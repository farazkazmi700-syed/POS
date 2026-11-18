const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { MongoClient, BSON } = require('mongodb');
const { Client } = require('pg');
const { destination, stagingDatabaseName, objectId, GLOBAL_COLLECTIONS, BUSINESS_COLLECTIONS } = require('./routing.cjs');
const root = path.resolve(__dirname, '../..');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const schema = fs.readFileSync(path.join(root, 'database/postgresql/migrations/0001-source-staging.sql'), 'utf8');

async function main() {
  if (!['--dry-run', '--staging'].includes(process.argv[2])) throw new Error('Specify --dry-run or --staging');
  const dryRun = process.argv[2] === '--dry-run';
  const mongo = new MongoClient(process.env.MIGRATION_MONGO_URI || 'mongodb://127.0.0.1:27017/pos', { serverSelectionTimeoutMS: 10000 });
  const capture = process.env.MIGRATION_CAPTURE_ID || '';
  if (capture && !/^[0-9]{14}$/.test(capture)) throw new Error('Specify a 14-digit staging capture ID');
  const targets = new Map();
  let admin;
  try {
    await mongo.connect();
    const source = mongo.db();
    const collectionNames = (await source.listCollections({}, { nameOnly: true }).toArray()).map(x => x.name).sort();
    if (collectionNames.some(x => !GLOBAL_COLLECTIONS.has(x) && !BUSINESS_COLLECTIONS.has(x))) throw new Error('Unmapped source collections require review');
    const tenantIds = new Set((await source.collection('tenants').find({}, { projection: { _id: 1 } }).toArray()).map(x => objectId(x._id)));
    const users = new Map((await source.collection('users').find({}, { projection: { _id: 1, tenantId: 1 } }).toArray()).map(x => [objectId(x._id), objectId(x.tenantId)]));
    const databases = ['pos_stage_control', ...[...tenantIds].sort().map(x => `pos_stage_${x}`)];
    let pgConfig;
    if (!dryRun) {
      pgConfig = { host: '127.0.0.1', port: 55432, user: 'pos_migration', password: fs.readFileSync(path.join(root, 'storage/postgresql-staging/password'), 'utf8').trim(), connectionTimeoutMillis: 10000 };
      admin = new Client({ ...pgConfig, database: 'postgres' });
      await admin.connect();
      // Fixed local endpoint and reserved DB names prevent accidental production writes.
      for (const database of databases) {
        const physicalName = stagingDatabaseName(database, capture);
        const exists = (await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [physicalName])).rowCount;
        if (!exists) await admin.query(`CREATE DATABASE "${physicalName}"`);
        const client = new Client({ ...pgConfig, database: physicalName });
        await client.connect();
        targets.set(database, client);
        if (exists) {
          const marker = await client.query("SELECT to_regclass('migration.target_identity') AS marker");
          if (!marker.rows[0].marker) throw new Error('Existing target has no migration identity; refusing to modify it');
        }
        await client.query('BEGIN');
        try {
          await client.query(schema);
          const businessId = database === 'pos_stage_control' ? null : database.slice('pos_stage_'.length);
          const identity = await client.query('SELECT source_database, business_id, purpose FROM migration.target_identity');
          if (!identity.rowCount) {
            if (exists) throw new Error('Existing target identity is empty');
            await client.query("INSERT INTO migration.target_identity(source_database,business_id,purpose) VALUES($1,$2,'staging')", [source.databaseName, businessId]);
          } else if (identity.rows[0].source_database !== source.databaseName || identity.rows[0].business_id !== businessId || identity.rows[0].purpose !== 'staging') throw new Error('Target identity mismatch');
          await client.query('COMMIT');
        } catch (error) { await client.query('ROLLBACK'); throw error; }
      }
    }
    const report = { capture, mode: dryRun ? 'dry_run' : 'staging', startedAt: new Date().toISOString(), sourceDatabase: source.databaseName, consistency: 'Live two-pass verification; not an approved cutover snapshot', collections: [], targetDatabaseCount: databases.length, verifiedRecords: 0 };
    for (const collectionName of collectionNames) {
      const expected = new Map(databases.map(name => [name, 0]));
      let processed = 0;
      // raw BSON preserves Decimal128, Int64, binary, field order, null and missing values.
      const cursor = source.collection(collectionName).find({}, { raw: true, batchSize: 100 }).sort({ _id: 1 });
      for await (const raw of cursor) {
        if (!Buffer.isBuffer(raw)) throw new Error('Driver did not return raw BSON');
        const doc = BSON.deserialize(raw, { promoteValues: false, promoteLongs: false });
        const target = destination(collectionName, doc, tenantIds, users);
        const id = BSON.EJSON.stringify(doc._id, { relaxed: false });
        const digest = hash(raw);
        expected.set(target, expected.get(target) + 1);
        if (!dryRun) {
          const client = targets.get(target);
          await client.query('INSERT INTO migration.source_records(collection_name,legacy_id,source_bson,sha256) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING', [collectionName, id, raw, digest]);
          const stored = await client.query("SELECT sha256, encode(sha256(source_bson),'hex') AS actual FROM migration.source_records WHERE collection_name=$1 AND legacy_id=$2", [collectionName, id]);
          if (stored.rows[0].sha256 !== digest || stored.rows[0].actual !== digest) throw new Error('Source changed or target checksum mismatch; no existing record overwritten');
        }
        processed++;
      }
      if (await source.collection(collectionName).countDocuments({}) !== processed) throw new Error('Source count changed during capture');
      if (!dryRun) {
        for (const [database, count] of expected) {
          const client = targets.get(database);
          const saved = await client.query('SELECT count(*)::text AS count FROM migration.source_records WHERE collection_name=$1', [collectionName]);
          if (BigInt(saved.rows[0].count) !== BigInt(count)) throw new Error('Target count mismatch; stale records require review');
          await client.query('INSERT INTO migration.collection_manifests(collection_name,source_count) VALUES($1,$2) ON CONFLICT(collection_name) DO UPDATE SET source_count=EXCLUDED.source_count,captured_at=now()', [collectionName, count]);
        }
        // A second source pass detects edits between extraction and reconciliation.
        let verified = 0;
        for await (const raw of source.collection(collectionName).find({}, { raw: true, batchSize: 100 })) {
          const doc = BSON.deserialize(raw, { promoteValues: false, promoteLongs: false });
          const client = targets.get(destination(collectionName, doc, tenantIds, users));
          const stored = await client.query('SELECT sha256 FROM migration.source_records WHERE collection_name=$1 AND legacy_id=$2', [collectionName, BSON.EJSON.stringify(doc._id, { relaxed: false })]);
          if (stored.rows[0]?.sha256 !== hash(raw)) throw new Error('Source changed during validation');
          report.verifiedRecords++;
          verified++;
        }
        if (verified !== processed) throw new Error('Source count changed during verification');
      }
      report.collections.push({ collection: collectionName, sourceRecords: processed, targetRecords: dryRun ? null : processed });
    }
    const finalCollections = (await source.listCollections({}, { nameOnly: true }).toArray()).map(x => x.name).sort();
    if (JSON.stringify(finalCollections) !== JSON.stringify(collectionNames)) throw new Error('Source collections changed during capture');
    report.completedAt = new Date().toISOString();
    const reportDirectory = path.join(root, 'docs/migration/reports');
    fs.mkdirSync(reportDirectory, { recursive: true });
    const output = path.join(reportDirectory, (dryRun ? 'staging-dry-run' : 'staging-reconciliation') + (capture ? '-' + capture : '') + '.json');
    fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ mode: report.mode, collections: report.collections.length, records: report.collections.reduce((n, x) => n + x.sourceRecords, 0), verifiedRecords: report.verifiedRecords, targetDatabases: report.targetDatabaseCount }));
  } finally {
    for (const client of targets.values()) await client.end();
    if (admin) await admin.end();
    await mongo.close();
  }
}
main().catch(error => {
  // Never print driver errors: they may include connection strings or document values.
  const safe = /^(Specify|Unmapped|Expected|Unresolved|Refusing|Existing|Target|Source|Driver)/.test(error.message);
  console.error(safe ? error.message : 'Migration failed; inspect the local configuration and database availability. No source writes were issued.');
  process.exitCode = 1;
});
