const { readFileSync } = require('node:fs');
const { randomUUID } = require('node:crypto');
const { Pool } = require('pg');
const identifier = value => {
  if (typeof value !== 'string' || !/^[a-f0-9]{24}$/.test(value)) throw new Error('Invalid invoice identity');
  return value;
};
class PostgresInvoiceStore {
  constructor(connections) {
    if (!connections || Object.getPrototypeOf(connections) !== Object.prototype || Object.keys(connections).length > 32) throw new Error('Invalid invoice database registry');
    this.connections = new Map(Object.entries(connections).map(([tenant, url]) => {
      identifier(tenant);
      if (typeof url !== 'string' || !/^postgres(?:ql)?:\/\//.test(url)) throw new Error('Invalid invoice database configuration');
      return [tenant, url];
    }));
    this.pools = new Map();
  }
  static fromFile(file) {
    if (!file) throw new Error('INVOICE_DATABASES_FILE is required for PostgreSQL invoices');
    try { return new PostgresInvoiceStore(JSON.parse(readFileSync(file, 'utf8'))); }
    catch { throw new Error('Cannot load trusted invoice database registry'); }
  }
  static fromDirectory(directory) {
    const store = new PostgresInvoiceStore({});
    store.directory = directory;
    return store;
  }
  async pool(tenant) {
    identifier(tenant);
    if (this.directory && !this.connections.has(tenant)) {
      this.connections.set(tenant, readFileSync(require('node:path').join(this.directory, tenant), 'utf8').trim());
    }
    if (!this.connections.has(tenant)) throw new Error('Business has no provisioned invoice database');
    if (!this.pools.has(tenant)) {
      const pool = new Pool({ connectionString: this.connections.get(tenant), max: 2, idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000, statement_timeout: 10000 });
      pool.on('error', () => {}); // Query failures are surfaced without logging credentials.
      this.pools.set(tenant, pool);
    }
    const pool = this.pools.get(tenant);
    const identity = await pool.query('SELECT tenant_id FROM invoice_store.business');
    if (identity.rowCount !== 1 || identity.rows[0].tenant_id !== tenant) throw new Error('Invoice database business identity mismatch');
    return pool;
  }
  async query(tenant, sql, values) {
    try { return await (await this.pool(tenant)).query(sql, values); }
    catch { throw new Error('PostgreSQL invoice store unavailable or business mapping invalid'); }
  }
  async ready() {
    if (this.directory) { require('node:fs').accessSync(require('node:path').join(this.directory, 'ready')); return; }
    if (!this.connections.size) throw new Error('Invoice registry has no provisioned businesses');
    await Promise.all([...this.connections.keys()].map(tenant => this.query(tenant, 'SELECT 1 FROM invoice_store.invoices LIMIT 0', [])));
  }
  async seed(tenant, records) {
    if (!records.length) return;
    const rows = records.map(row => {
      identifier(row.orderId);
      if (!['pending', 'ready', 'failed'].includes(row.status) || (row.status === 'ready' && !row.pdfPath)) throw new Error('Invalid legacy invoice state');
      return { order_id: row.orderId, status: row.status, pdf_path: row.pdfPath ?? null };
    });
    await this.query(tenant, `INSERT INTO invoice_store.invoices(tenant_id,order_id,status,pdf_path)
      SELECT $1,r.order_id,r.status,r.pdf_path FROM jsonb_to_recordset($2::jsonb) AS r(order_id text,status text,pdf_path text)
      ON CONFLICT(tenant_id,order_id) DO NOTHING`, [tenant, JSON.stringify(rows)]);
  }
  async read(tenant, orderIds) {
    orderIds.forEach(identifier);
    if (!orderIds.length) return [];
    const result = await this.query(tenant, 'SELECT order_id AS "orderId", status, pdf_path AS "pdfPath" FROM invoice_store.invoices WHERE tenant_id=$1 AND order_id=ANY($2::text[])', [tenant, orderIds]);
    return result.rows;
  }
  async begin(tenant, orderId) {
    identifier(orderId);
    const generation = randomUUID();
    await this.query(tenant, `INSERT INTO invoice_store.invoices(tenant_id,order_id,status,generation)
      VALUES($1,$2,'pending',$3) ON CONFLICT(tenant_id,order_id) DO UPDATE SET status='pending',pdf_path=NULL,generation=EXCLUDED.generation,updated_at=now()`, [tenant, orderId, generation]);
    return generation;
  }
  async finish(tenant, orderId, generation, status, pdfPath = null) {
    identifier(orderId);
    if (!generation || !/^[a-f0-9-]{36}$/.test(generation) || !['ready', 'failed'].includes(status) || (status === 'ready' && !pdfPath)) throw new Error('Invalid invoice completion');
    const result = await this.query(tenant, `UPDATE invoice_store.invoices SET status=$4,pdf_path=$5,updated_at=now()
      WHERE tenant_id=$1 AND order_id=$2 AND generation=$3 AND status='pending'`, [tenant, orderId, generation, status, pdfPath]);
    return result.rowCount === 1;
  }
  async invoicesPurged(tenant) {
    identifier(tenant);
    const result = await this.query(tenant, 'SELECT invoices_purged_at IS NOT NULL AS purged FROM invoice_store.business WHERE tenant_id=$1', [tenant]);
    return result.rows[0]?.purged === true;
  }
  async readAppearance(tenant) {
    const result = await this.query(tenant, 'SELECT preferences FROM invoice_store.business_appearance WHERE tenant_id = $1', [tenant]);
    return result.rows[0]?.preferences ?? null;
  }
  async writeAppearance(tenant, preferences) {
    const result = await this.query(tenant, `
      INSERT INTO invoice_store.business_appearance (tenant_id, preferences) VALUES ($1, $2)
      ON CONFLICT (tenant_id) DO UPDATE SET preferences = EXCLUDED.preferences, updated_at = now()
      RETURNING preferences
    `, [tenant, preferences]);
    return result.rows[0].preferences;
  }
  async close() { await Promise.all([...this.pools.values()].map(pool => pool.end())); this.pools.clear(); }
}
module.exports = { PostgresInvoiceStore };
