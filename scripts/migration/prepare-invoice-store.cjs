// Explicit local preparation only; never called during application startup.
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { Client } = require('pg');
const { BSON } = require('mongodb');
const root = path.resolve(__dirname, '../..');
const file = path.join(root, 'storage/postgresql-staging/invoice-databases.json');
const schema = fs.readFileSync(path.join(root, 'packages/invoice-store/schema.sql'), 'utf8');
async function main() {
  if (process.argv[2] !== '--prepare') throw new Error('Use --prepare for the isolated local PostgreSQL server');
  const config = { host: '127.0.0.1', port: 55432, user: 'pos_migration', password: fs.readFileSync(path.join(root, 'storage/postgresql-staging/password'), 'utf8').trim() };
  const admin = new Client({ ...config, database: 'postgres' });
  const registry = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  let copied = 0;
  try {
    await admin.connect();
    const databases = (await admin.query("SELECT datname FROM pg_database WHERE datname ~ '^pos_stage_[a-f0-9]{24}$' ORDER BY datname")).rows;
    for (const { datname } of databases) {
      const tenant = datname.slice('pos_stage_'.length);
      const database = 'pos_invoice_' + tenant;
      const role = 'invoice_' + tenant;
      if (!registry[tenant]) {
        registry[tenant] = `postgresql://${role}:${randomBytes(32).toString('hex')}@127.0.0.1:55432/${database}`;
        // Persist generated credentials before provisioning, allowing safe retries.
        fs.writeFileSync(file, JSON.stringify(registry, null, 2) + '\n', { mode: 0o600 });
      }
      const url = new URL(registry[tenant]);
      if (url.username !== role || url.hostname !== '127.0.0.1' || url.port !== '55432' || url.pathname !== '/' + database || !/^[a-f0-9]{64}$/.test(url.password)) throw new Error('Registry mismatch');
      const hasRole = (await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [role])).rowCount;
      if (!hasRole) await admin.query(`CREATE ROLE "${role}" LOGIN PASSWORD '${url.password}' NOSUPERUSER NOCREATEDB NOCREATEROLE`);
      const hasDatabase = (await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [database])).rowCount;
      if (!hasDatabase) await admin.query(`CREATE DATABASE "${database}"`);
      const source = new Client({ ...config, database: datname });
      const target = new Client({ ...config, database });
      try {
        await source.connect(); await target.connect();
        const identity = await source.query('SELECT business_id,purpose FROM migration.target_identity');
        if (identity.rows[0]?.business_id !== tenant || identity.rows[0]?.purpose !== 'staging') throw new Error('Source identity mismatch');
        if (hasDatabase) {
          const marker = await target.query("SELECT to_regclass('invoice_store.business') AS marker");
          if (!marker.rows[0].marker) throw new Error('Existing destination has no business identity');
          const existing = await target.query('SELECT tenant_id FROM invoice_store.business');
          if (existing.rowCount !== 1 || existing.rows[0].tenant_id !== tenant) throw new Error('Destination identity mismatch');
        }
        await target.query('BEGIN');
        await target.query(schema);
        await target.query('INSERT INTO invoice_store.business(tenant_id) VALUES($1) ON CONFLICT DO NOTHING', [tenant]);
        const records = await source.query("SELECT source_bson, sha256=encode(sha256(source_bson),'hex') AS valid FROM migration.source_records WHERE collection_name='orders'");
        for (const record of records.rows) {
          if (!record.valid) throw new Error('Staging checksum mismatch');
          const order = BSON.deserialize(record.source_bson);
          if (order.tenantId.toHexString() !== tenant) throw new Error('Order business mismatch');
          await target.query('INSERT INTO invoice_store.invoices(tenant_id,order_id,status,pdf_path) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING', [tenant, order._id.toHexString(), order.invoiceStatus, order.invoicePdfPath ?? null]);
          copied++;
        }
        await target.query(`REVOKE ALL ON DATABASE "${database}" FROM PUBLIC`);
        await target.query(`GRANT CONNECT ON DATABASE "${database}" TO "${role}"`);
        await target.query(`GRANT USAGE ON SCHEMA invoice_store TO "${role}"`);
        await target.query(`GRANT SELECT ON invoice_store.business TO "${role}"`);
        await target.query(`GRANT SELECT,INSERT,UPDATE ON invoice_store.invoices TO "${role}"`);
        await target.query('COMMIT');
      } catch (error) { await target.query('ROLLBACK').catch(() => {}); throw error; }
      finally { await source.end(); await target.end(); }
    }
    const dockerRegistry = Object.fromEntries(Object.entries(registry).map(([tenant, connection]) => {
      const url = new URL(connection); url.hostname = 'postgres'; url.port = '5432'; return [tenant, url.toString()];
    }));
    fs.writeFileSync(file.replace('.json', '.docker.json'), JSON.stringify(dockerRegistry, null, 2) + '\n', { mode: 0o600 });
    console.log(JSON.stringify({ preparedBusinessDatabases: databases.length, sourceInvoiceStates: copied, productionConnectionsChanged: false }));
  } finally { await admin.end(); }
}
main().catch(() => { console.error('Invoice preparation failed; inspect local configuration and source identities. Credentials are not logged.'); process.exitCode = 1; });
