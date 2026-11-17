const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { createRequire } = require('node:module');
const { randomBytes } = require('node:crypto');
const requireApi = createRequire(path.resolve('apps/api/package.json'));
const { PostgresInvoiceStore } = requireApi('@pos/invoice-store');
const { Client } = requireApi('pg');
const file = path.resolve('storage/postgresql-staging/invoice-databases.json');
test('PostgreSQL invoice authority, tenant isolation, stale-job protection and least privilege', { skip: !fs.existsSync(file) }, async () => {
  const registry = JSON.parse(fs.readFileSync(file, 'utf8'));
  const [tenant, second] = Object.keys(registry);
  assert.ok(tenant && second, 'Test requires two prepared business databases');
  const store = new PostgresInvoiceStore(registry);
  const order = randomBytes(12).toString('hex');
  const runtime = new Client({ connectionString: registry[tenant] });
  let apiState;
  let workerStore;
  let closeBrowser;
  try {
    await runtime.connect();
    await store.seed(tenant, [{ orderId: order, status: 'failed' }]);
    const first = await store.begin(tenant, order);
    const newest = await store.begin(tenant, order);
    assert.equal(await store.finish(tenant, order, first, 'ready', 'obsolete.pdf'), false);
    assert.equal(await store.finish(tenant, order, newest, 'ready', 'current.pdf'), true);
    assert.equal(await store.finish(tenant, order, newest, 'failed'), false);
    await store.seed(tenant, [{ orderId: order, status: 'failed' }]);
    assert.deepEqual(await store.read(tenant, [order]), [{ orderId: order, status: 'ready', pdfPath: 'current.pdf' }]);
    assert.deepEqual(await store.read(second, [order]), []);
    await assert.rejects(store.begin('f'.repeat(24), order));
    await assert.rejects(runtime.query('DELETE FROM invoice_store.invoices WHERE order_id=$1', [order]), error => error.code === '42501');
    await assert.rejects(runtime.query('INSERT INTO invoice_store.invoices(tenant_id,order_id,status) VALUES($1,$2,$3)', [second, order, 'pending']), error => error.code === '23503');
    const misrouted = new PostgresInvoiceStore({ [second]: registry[tenant] });
    try { await assert.rejects(misrouted.begin(second, order)); } finally { await misrouted.close(); }
    const { InvoiceStateService } = requireApi('./dist/modules/invoice/invoice-state.service.js');
    apiState = new InvoiceStateService({ get: key => ({ INVOICE_STORE: 'postgres', INVOICE_DATABASES_FILE: file })[key] });
    await apiState.onModuleInit();
    const legacyOrder = { id: order, invoiceStatus: 'failed' };
    await apiState.hydrate(tenant, [legacyOrder]);
    assert.equal(legacyOrder.invoiceStatus, 'ready');
    assert.equal(legacyOrder.invoicePdfPath, 'current.pdf');
    process.env.STORAGE_DIR = path.resolve('qa/artifacts/postgres-invoices');
    const requireWorker = createRequire(path.resolve('apps/pdf-worker/package.json'));
    const WorkerStore = requireWorker('@pos/invoice-store').PostgresInvoiceStore;
    workerStore = new WorkerStore(registry);
    const { createProcessor } = requireWorker('./dist/queue/invoice.processor.js');
    closeBrowser = requireWorker('./dist/services/pdf.service.js').closeBrowser;
    const generation = await store.begin(tenant, order);
    const data = {
      orderId: order, invoiceGeneration: generation, invoiceNo: 'PG-TEST-' + order,
      createdAt: new Date().toISOString(), tenant: { id: tenant, name: 'Migration test business', currency: 'PKR' },
      cashierName: 'Test cashier', paymentMode: 'cash',
      items: [{ name: 'Test product', qty: 1, unitPrice: 100, discountPercent: 0, discountAmount: 0, taxPercent: 0, taxAmount: 0, lineTotal: 100 }],
      totals: { subtotal: 100, discountTotal: 0, taxableTotal: 100, taxTotal: 0, charges: [], chargesTotal: 0, grandTotal: 100, taxBreakdown: [] },
    };
    const generated = await createProcessor(workerStore)({ data });
    assert.equal(generated.superseded, false);
    assert.equal(fs.readFileSync(path.join(process.env.STORAGE_DIR, generated.relPath)).subarray(0, 5).toString(), '%PDF-');
    await apiState.hydrate(tenant, [legacyOrder]);
    assert.equal(legacyOrder.invoiceStatus, 'ready');
    assert.equal(legacyOrder.invoicePdfPath, generated.relPath);
    await assert.rejects(createProcessor(workerStore)({ data: { ...data, invoiceGeneration: undefined } }), /Legacy invoice job/);
    const readState = apiState.postgres.read.bind(apiState.postgres);
    apiState.postgres.read = async () => { throw new Error('Simulated SQL outage'); };
    try { await assert.rejects(apiState.hydrate(tenant, [legacyOrder]), error => error.getStatus() === 503); }
    finally { apiState.postgres.read = readState; }
  } finally {
    await apiState?.onModuleDestroy();
    await workerStore?.close();
    if (closeBrowser) await closeBrowser();
    await store.close(); await runtime.end();
    // Delete only this synthetic random test identity from the isolated local target.
    const admin = new Client({ host: '127.0.0.1', port: 55432, database: new URL(registry[tenant]).pathname.slice(1), user: 'pos_migration', password: fs.readFileSync('storage/postgresql-staging/password', 'utf8').trim() });
    await admin.connect();
    try { await admin.query('DELETE FROM invoice_store.invoices WHERE tenant_id=$1 AND order_id=$2', [tenant, order]); }
    finally { await admin.end(); }
  }
});
