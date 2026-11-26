'use strict';
// Runs as the postgres OS account. API and worker only receive ordinary business logins.
const fs = require('node:fs');
const { createHmac } = require('node:crypto');
const { setTimeout: delay } = require('node:timers/promises');
const { Client } = require(require.resolve('pg', { paths: [require.resolve('@pos/invoice-store')] }));
const schema = fs.readFileSync(require.resolve('@pos/invoice-store/schema.sql'), 'utf8');
const directory = '/run/pos/businesses';
const secret = fs.readFileSync('/var/lib/postgresql/data/secrets/postgres');
const connect = database => new Client({ host: '/var/run/postgresql', user: 'postgres', database, connectionTimeoutMillis: 5000 });

async function provision(admin, id) {
  if (!/^[a-f0-9]{24}$/.test(id)) throw new Error('Invalid tenant identity');
  const db = 'kazmion_business_' + id;
  const role = 'kazmion_business_' + id;
  const password = createHmac('sha256', secret).update('business-role/' + id).digest('hex');
  const existing = await admin.query('SELECT pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname=$1', [db]);
  const reserved = await admin.query('SELECT 1 FROM kazmion_control.business_databases WHERE tenant_id=$1', [id]);
  if (!reserved.rowCount) {
    if (existing.rowCount || (await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [role])).rowCount)
      throw new Error('Business database or role name is already in use');
    await admin.query('BEGIN');
    try {
      await admin.query('INSERT INTO kazmion_control.business_databases(tenant_id) VALUES($1)', [id]);
      await admin.query(`CREATE ROLE "${role}" LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`);
      await admin.query('COMMIT');
    } catch (error) { await admin.query('ROLLBACK'); throw error; }
  }
  // A management dump restores reservations; PostgreSQL roles are cluster-wide.
  if (reserved.rowCount) {
    const login = await admin.query('SELECT rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls FROM pg_roles WHERE rolname=$1', [role]);
    if (!login.rowCount) await admin.query(`CREATE ROLE "${role}" LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`);
    else if (Object.values(login.rows[0]).some(Boolean)) throw new Error('Business role has excessive privileges');
  }
  if (!existing.rowCount) await admin.query(`CREATE DATABASE "${db}" TEMPLATE template0`);
  else if (existing.rows[0].owner !== 'postgres') throw new Error('Unexpected database owner');
  await admin.query(`REVOKE ALL ON DATABASE "${db}" FROM PUBLIC`);
  await admin.query(`GRANT CONNECT ON DATABASE "${db}" TO "${role}"`);
  const target = connect(db);
  try {
    await target.connect();
    await target.query('BEGIN');
    await target.query(schema);
    await target.query('INSERT INTO invoice_store.business(tenant_id) VALUES($1) ON CONFLICT DO NOTHING', [id]);
    const identity = await target.query('SELECT tenant_id FROM invoice_store.business');
    if (identity.rowCount !== 1 || identity.rows[0].tenant_id !== id) throw new Error('Business database identity mismatch');
    await target.query(`GRANT USAGE ON SCHEMA invoice_store TO "${role}"`);
    await target.query(`GRANT SELECT ON invoice_store.business TO "${role}"`);
    await target.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON invoice_store.invoices TO "${role}"`);
    await target.query('COMMIT');
  } finally { await target.end(); }
  const uri = 'postgresql://' + role + ':' + password + '@127.0.0.1:5432/' + db;
  fs.writeFileSync(directory + '/' + id + '.tmp', uri, { mode: 0o640 });
  fs.renameSync(directory + '/' + id + '.tmp', directory + '/' + id);
}

async function serve() {
  const admin = connect('postgres');
  const ready = new Set();
  try {
    await admin.connect();
    await admin.query("SELECT pg_advisory_lock(71139286)");
    await admin.query(`CREATE SCHEMA IF NOT EXISTS kazmion_control;
      REVOKE ALL ON SCHEMA kazmion_control FROM PUBLIC;
      CREATE TABLE IF NOT EXISTS kazmion_control.business_databases(tenant_id text PRIMARY KEY CHECK(tenant_id ~ '^[a-f0-9]{24}$'))`);
    while (true) {
      const tenants = await admin.query(`SELECT documentdb_core.bson_to_json_string(document)::text::jsonb->'_id'->>'$oid' AS id
        FROM documentdb_api.collection('pos','tenants')`);
      for (const { id } of tenants.rows) {
        if (!ready.has(id)) { await provision(admin, id); ready.add(id); }
      }
      fs.closeSync(fs.openSync(directory + '/ready', 'a', 0o640));
      await delay(1500);
    }
  } finally { await admin.end(); }
}
serve().catch(error => { console.error('Business provisioning unavailable:', error.code || error.name); process.exitCode = 1; });
