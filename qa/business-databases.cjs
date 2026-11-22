'use strict';
// Run inside the production image. Tests use read-only transactions.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createRequire } = require('node:module');
const apiRequire = createRequire('/app/api/package.json');
const { Client } = createRequire(apiRequire.resolve('@pos/invoice-store'))('pg');
const directory = '/run/pos/businesses';
async function main() {
  const tenants = fs.readdirSync(directory).filter(id => /^[0-9a-f]{24}$/.test(id));
  assert.ok(tenants.length >= 2, 'Requires two provisioned businesses');
  for (const tenant of tenants) {
    const uri = fs.readFileSync(directory + '/' + tenant, 'utf8');
    const client = new Client({ connectionString: uri });
    try {
      await client.connect();
      const { rows: [identity] } = await client.query('SELECT current_database() AS db, tenant_id FROM invoice_store.business');
      assert.equal(identity.db, 'kazmion_business_' + tenant);
      assert.equal(identity.tenant_id, tenant);
      const { rows: [rights] } = await client.query("SELECT rolsuper,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=current_user");
      for (const value of Object.values(rights)) assert.equal(value, false);
      await client.query('SELECT order_id FROM invoice_store.invoices LIMIT 0');
      for (const database of ['postgres', 'kazmion_business_' + tenants.find(id => id !== tenant)]) {
        const foreign = new URL(uri);
        foreign.pathname = '/' + database;
        const other = new Client({ connectionString: foreign.toString() });
        try { await assert.rejects(other.connect(), error => error.code === '28000' || error.code === '42501'); }
        finally { await other.end().catch(() => {}); }
      }
    } finally { await client.end(); }
  }
  console.log('Verified business identities, role restrictions and cross-database access denial for', tenants.length, 'businesses.');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
