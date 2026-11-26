const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { createRequire } = require('node:module');
const { readFileSync, readdirSync } = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const root = path.resolve(__dirname, '..');
const { Client } = createRequire(path.join(root, 'deploy/scripts/migration/package.json'))('pg');

const connectionString = process.env.SPEC_SYNC_POSTGRES_URL;
const tenant = '00000000-0000-0000-0000-000000000001';
const other = '00000000-0000-0000-0000-000000000002';
const product = '00000000-0000-0000-0000-000000000003';
const order = '00000000-0000-0000-0000-000000000004';
const consumer = '00000000-0000-0000-0000-000000000005';
const secondConsumer = '00000000-0000-0000-0000-000000000006';

test('V2 populated migration, local exports, atomic outbox, and retention', { skip: !connectionString }, async () => {
  const url = new URL(connectionString);
  assert.equal(url.hostname, '127.0.0.1');
  assert.equal(url.pathname, '/pos_sync_rehearsal');
  const client = new Client({ connectionString });
  await client.connect();
  try {
    assert.equal((await client.query("SELECT to_regclass('public.tenants') AS tenants")).rows[0].tenants, null);
    await client.query('CREATE TABLE pos_sql_migrations (filename text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    const migrations = path.join(root, 'deploy/database/postgresql/migrations');
    for (const file of readdirSync(migrations).filter(file => file.endsWith('.sql') && file < '004').sort()) {
      await client.query(readFileSync(path.join(migrations, file), 'utf8'));
      await client.query('INSERT INTO pos_sql_migrations(filename) VALUES($1)', [file]);
    }
    await client.query("INSERT INTO tenants(id,name) VALUES ($1,'Legacy'),($2,'Other')", [tenant, other]);
    await client.query("INSERT INTO products(id,tenant_id,name,price) VALUES ($1,$2,'Legacy item',12.50)", [product, tenant]);
    await client.query("INSERT INTO products(tenant_id,name,price) VALUES ($1,'Private item',1)", [other]);
    await client.query("INSERT INTO orders(id,tenant_id,invoice_no,payment_mode,cashier_name,grand_total) VALUES ($1,$2,'INV-1','cash','Staff',12.50)", [order, tenant]);
    const run = () => execFileSync(process.execPath, ['deploy/scripts/migrate/run-migrations.cjs'], {
      cwd: root, env: { ...process.env, POSTGRES_URL: connectionString }, encoding: 'utf8',
    });
    await client.query("INSERT INTO order_items(order_id,tenant_id,name,qty,unit_price,line_total) VALUES ($1,$2,'Wrong tenant',1,1,1)", [order, other]);
    assert.throws(run, /23503/);
    assert.equal((await client.query("SELECT to_regnamespace('pos_sync') AS sync_schema")).rows[0].sync_schema, null);
    await client.query('UPDATE order_items SET tenant_id=$1 WHERE order_id=$2', [tenant, order]);
    assert.match(run(), /\[done\] 004_sync_v2\.sql/);
    assert.match(run(), /\[skip\] 004_sync_v2\.sql/);
    const snapshot = async (id = tenant) => (await client.query('SELECT pos_sync.snapshot($1) AS payload', [id])).rows[0].payload;
    const changes = async (after = '0', limit = 500) => (await client.query('SELECT pos_sync.changes($1, $2, $3) AS payload', [tenant, after, limit])).rows[0].payload;
    await client.query("SET TIME ZONE 'Asia/Karachi'");
    const baseline = await snapshot();
    assert.equal(baseline.version, 2);
    assert.equal(baseline.checkpoint, '0');
    assert.match(baseline.exportedAt, /\+00:00$/);
    assert.deepEqual(baseline.collections.products.map(row => [row.id, row.tenant_id, row.sync_version]), [[product, tenant, '1']]);
    assert.equal(baseline.collections.orders[0].grand_total, 12.5);
    assert.deepEqual((await snapshot(other)).collections.products.map(row => row.name), ['Private item']);
    assert.deepEqual((await changes()).events, []);

    await client.query('BEGIN');
    await client.query("UPDATE products SET name = 'Rolled back' WHERE id = $1", [product]);
    assert.equal((await changes()).checkpoint, '1');
    await client.query('ROLLBACK');
    assert.equal((await changes()).checkpoint, '0');

    await client.query('CREATE ROLE sync_rehearsal_writer');
    await client.query('GRANT SELECT, UPDATE ON products TO sync_rehearsal_writer');
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE sync_rehearsal_writer');
    await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [tenant]);
    await client.query("UPDATE products SET name = 'Updated' WHERE id = $1", [product]);
    await client.query('COMMIT');
    await client.query('SET ROLE sync_rehearsal_writer');
    await assert.rejects(client.query('SELECT pos_sync.snapshot($1)', [tenant]), { code: '42501' });
    await client.query('RESET ROLE');

    await client.query("UPDATE products SET name = 'Updated' WHERE id = $1", [product]);
    assert.equal((await changes()).checkpoint, '1');
    await assert.rejects(client.query('UPDATE products SET tenant_id=$1 WHERE id=$2', [other, product]), { code: '23514' });
    await assert.rejects(client.query('DELETE FROM orders WHERE id=$1', [order]), { code: '23514' });
    await assert.rejects(client.query('UPDATE orders SET deleted_at=now() WHERE id=$1', [order]), { code: '23514' });
    await client.query("UPDATE orders SET status = 'refunded' WHERE id = $1", [order]);
    await client.query('UPDATE products SET deleted_at=now() WHERE id=$1', [product]);
    assert.equal((await client.query('SELECT is_active FROM products WHERE id=$1', [product])).rows[0].is_active, false);
    await assert.rejects(client.query('UPDATE products SET deleted_at=NULL WHERE id=$1', [product]), { code: '23514' });

    const first = await changes('0', 2);
    assert.equal(first.sourceId, baseline.sourceId);
    assert.equal(first.hasMore, true);
    assert.deepEqual(first.events.map(event => event.sequence), ['1', '2']);
    assert.deepEqual(await changes('0', 2), first);
    const last = await changes(first.checkpoint);
    assert.equal(last.hasMore, false);
    assert.equal(last.events[0].operation, 'tombstone');
    assert.equal(last.events[0].record.name, undefined);
    assert.equal(last.events[0].entityVersion, '3');
    assert.equal(new Set([...first.events, ...last.events].map(event => event.eventId)).size, 3);
    assert.equal((await snapshot()).checkpoint, '3');

    await client.query("UPDATE pos_sync.outbox SET occurred_at = now() - interval '91 days' WHERE tenant_id = $1", [tenant]);
    assert.equal((await client.query('SELECT pos_sync.prune($1) AS pruned', [tenant])).rows[0].pruned, '0');
    await client.query('SELECT pos_sync.acknowledge($1,$2,3), pos_sync.acknowledge($1,$3,2)', [tenant, consumer, secondConsumer]);
    await client.query('SELECT pos_sync.acknowledge($1,$2,1)', [tenant, consumer]);
    await assert.rejects(client.query('SELECT pos_sync.acknowledge($1,$2,4)', [tenant, consumer]), { code: '22023' });
    assert.equal((await client.query('SELECT pos_sync.prune($1) AS pruned', [tenant])).rows[0].pruned, '2');
    await assert.rejects(changes('1'), { code: '22023' });
    assert.equal((await changes('2')).checkpoint, '3');
    const history = (await client.query('SELECT before_record,after_record FROM pos_sync.financial_history WHERE tenant_id=$1', [tenant])).rows;
    assert.equal(history.length, 1);
    assert.equal(history[0].before_record.status, 'completed');
    assert.equal(history[0].after_record.status, 'refunded');
    assert.equal(history[0].after_record.grand_total, 12.5);
    assert.equal((await snapshot()).financialHistory[0].before.status, 'completed');

    const writer = new Client({ connectionString });
    await writer.connect();
    try {
      await client.query('BEGIN');
      await client.query("INSERT INTO products(tenant_id,name,price) VALUES ($1,'First writer',1)", [other]);
      const pending = writer.query("INSERT INTO products(tenant_id,name,price) VALUES ($1,'Second writer',2)", [other]);
      let waiting = false;
      for (let attempt = 0; attempt < 50 && !waiting; attempt++) {
        const state = await client.query('SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1', [writer.processID]);
        waiting = state.rows[0]?.wait_event_type === 'Lock';
        if (!waiting) await new Promise(resolve => setTimeout(resolve, 10));
      }
      await client.query('COMMIT');
      await pending;
      assert.equal(waiting, true);
      const eventPage = (await client.query('SELECT pos_sync.changes($1,0) AS payload', [other])).rows[0].payload;
      assert.deepEqual(eventPage.events.map(event => [event.sequence, event.record.name]), [['1', 'First writer'], ['2', 'Second writer']]);
    } finally {
      await client.query('ROLLBACK');
      await writer.end();
    }
  } finally {
    await client.end();
  }
});
