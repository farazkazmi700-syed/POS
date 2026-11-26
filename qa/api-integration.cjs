/* Real API + isolated MongoDB/Redis namespace. Never targets the production database. */
const assert = require('node:assert/strict');
const path = require('node:path');
const { createRequire } = require('node:module');
const { spawn } = require('node:child_process');
const { randomUUID, randomBytes } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const requireApi = createRequire(path.join(root, 'app/api/package.json'));
const mongoose = requireApi('mongoose');
const bcrypt = requireApi('bcryptjs');
const databaseName = `pos_spec_test_${Date.now()}_${randomBytes(4).toString('hex')}`;
const prefix = `spec-test-${randomUUID()}`;
const port = Number(process.env.SPEC_TEST_PORT || 3101);
const setupToken = randomBytes(32).toString('hex');
const registrationPassword = randomBytes(24).toString('hex');
const endpoint = new URL(process.env.SPEC_DATABASE_URI_FILE
  ? require('node:fs').readFileSync(process.env.SPEC_DATABASE_URI_FILE, 'utf8').trim()
  : 'mongodb://127.0.0.1:27017');
if (endpoint.protocol !== 'mongodb:' || endpoint.hostname !== '127.0.0.1') throw new Error('Use a local test database');
endpoint.pathname = '/' + databaseName;
const uri = endpoint.toString();
let child; let database; let recoveryFixtures; let checks = 0; let output = '';
let appearancePostgres;
let appearanceDirectory;
const appearanceDatabases = [];

async function prepareAppearance(tenants) {
  const { Client } = requireApi('pg');
  const fs = require('node:fs');
  const connection = new URL(process.env.SPEC_APPEARANCE_POSTGRES_URL);
  if (connection.hostname !== '127.0.0.1' || connection.pathname !== '/pos_appearance_test') {
    throw new Error('Use the isolated local pos_appearance_test PostgreSQL database');
  }
  appearancePostgres = new Client({ connectionString: connection.toString() });
  await appearancePostgres.connect();
  const schema = fs.readFileSync(path.join(root, 'app/packages/invoice-store/schema.sql'), 'utf8');
  appearanceDirectory = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'pos-appearance-'));
  for (const tenant of tenants) {
    const id = tenant._id.toString();
    const name = 'pos_appearance_' + id;
    await appearancePostgres.query(`CREATE DATABASE "${name}"`);
    appearanceDatabases.push(name);
    connection.pathname = '/' + name;
    const client = new Client({ connectionString: connection.toString() });
    await client.connect();
    try {
      await client.query(schema);
      await client.query('INSERT INTO invoice_store.business(tenant_id) VALUES ($1)', [id]);
    } finally { await client.end(); }
    fs.writeFileSync(path.join(appearanceDirectory, id), connection.toString(), { mode: 0o600 });
  }
  fs.writeFileSync(path.join(appearanceDirectory, 'ready'), '');
}
async function check(name, task) { await task(); checks++; console.log(`PASS ${name}`); }
async function request(url, token, body, method = body === undefined ? 'GET' : 'POST', branch) {
  const response = await fetch(`http://127.0.0.1:${port}/api${url}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(branch ? { 'X-Branch-Id': branch } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(45000) }).catch((error) => { throw new Error(`${method} ${url}: ${error.message}`); });
  return { status: response.status, data: await response.json() };
}
async function loginSession(email, password = 'test-password-123', pin = '1234', newPin) {
  let result = await request('/auth/login', null, { email, password });
  assert.equal(result.status, 201, JSON.stringify(result.data));
  if (result.data.requiresPin) result = await request('/auth/login/pin', null, { challengeToken: result.data.challengeToken, pin, ...(newPin ? { newPin } : {}) });
  assert.equal(result.status, 201, JSON.stringify(result.data));
  assert.ok(result.data.accessToken); return result.data;
}
async function login(...args) { return (await loginSession(...args)).accessToken; }
async function main() {
  assert.match(databaseName, /^pos_spec_test_\d+_[a-f0-9]{8}$/);
  database = await mongoose.createConnection(uri, { serverSelectionTimeoutMS: 10000 }).asPromise();
  const features = { pos: true, inventory: true, customers: true, installments: true, reports: true, barcodes: true, settings: true };
  const tenants = ['A', 'B'].map((name) => ({ _id: new mongoose.Types.ObjectId(), name: `Test ${name}`, currency: 'PKR', domainType: 'retail', status: 'active', branchLimit: 1, branchCount: 0, defaultBranchId: null, featureFlags: features, taxProfile: { gstPercent: 0, reducedGstPercent: 0, serviceChargePercent: 0, otherCharges: [] }, invoicePrefix: 'TEST' }));
  await database.collection('tenants').insertMany(tenants);
  const owners = await Promise.all(tenants.map(async (tenant, index) => ({ _id: new mongoose.Types.ObjectId(), tenantId: tenant._id, name: `Owner ${index}`, email: `owner${index}@spec.test`, passwordHash: await bcrypt.hash('test-password-123', 4), pinHash: await bcrypt.hash('1234', 4), pinVersion: 0, sessionVersion: 0, pinRequiresChange: false, role: 'owner', isActive: true, superAdmin: false, branchIds: [] })));
  await database.collection('users').insertMany(owners);
  recoveryFixtures = await require('./recovery-fixtures.cjs').startRecoveryFixtures();
  if (process.argv.includes('--appearance')) await prepareAppearance(tenants);
  child = spawn(process.execPath, ['-r', path.join(root, 'qa/recovery-provider-hook.cjs'), 'dist/main.js'], { cwd: path.join(root, 'app/api'), env: { ...process.env, ...(appearanceDirectory ? { BUSINESS_DB_DIRECTORY: appearanceDirectory } : {}),
    ...(process.argv.includes('--backup') ? { DATA_SYNC_TENANT_ID: tenants[0]._id.toString(), DATA_SYNC_URL: 'https://127.0.0.1:1/v1/business-snapshot', DATA_SYNC_TOKEN: randomBytes(32).toString('hex') } : {}),
    PORT: String(port), DEV_ACCOUNT_EMAIL: 'provisioner@spec.test', DEV_ACCOUNT_PASSWORD_HASH: await bcrypt.hash(registrationPassword, 4), MONGO_URI: uri, REDIS_URL: 'redis://127.0.0.1:6379/0', BULL_PREFIX: prefix, JWT_ACCESS_SECRET: randomBytes(32).toString('hex'), JWT_REFRESH_SECRET: randomBytes(32).toString('hex'), PLATFORM_DEVELOPER_EMAIL: 'developer@spec.test', PLATFORM_DEVELOPER_SETUP_TOKEN: setupToken, CORS_ORIGIN: 'http://localhost:5173', THROTTLE_LIMIT: '10000', SMTP_HOST: '127.0.0.1', SMTP_PORT: String(recoveryFixtures.smtpPort), SMTP_SECURE: 'false', SMTP_USER: 'test@spec.test', SMTP_PASSWORD: randomBytes(16).toString('hex'), SMTP_FROM: 'test@spec.test', TWILIO_ACCOUNT_SID: 'AC-test', TWILIO_AUTH_TOKEN: 'test-only', TWILIO_WHATSAPP_FROM: '+15005550006', TWILIO_WHATSAPP_CONTENT_SID: 'HX-test', RECOVERY_TEST_PROVIDER: recoveryFixtures.whatsappUrl }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', (data) => { output = (output + data).slice(-18000); }); child.stderr.on('data', (data) => { output = (output + data).slice(-18000); });
  let ready = false;
  for (let attempt = 0; attempt < 240; attempt++) {
    if (child.exitCode !== null) throw new Error(`Test API exited: ${output}`);
    try { if ((await request('/health')).status === 200) { ready = true; break; } } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  assert.ok(ready, `API did not become ready: ${output}`);
  await check('health and unauthenticated access', async () => { assert.equal((await request('/health')).status, 200); assert.equal((await request('/products')).status, 401); });
  if (!process.argv.includes('--appearance') && !process.argv.includes('--backup') && !process.argv.includes('--branches')) {
    await check('license expiry blocks sign-in, existing business sessions, and refresh for only the expired tenant', async () => {
      const session = await loginSession(owners[0].email);
      const otherSession = await login(owners[1].email);
      await database.collection('tenants').updateOne({ _id: tenants[0]._id }, {
        $set: { licenseExpiresAt: new Date(Date.now() - 60_000) },
      });
      try {
        assert.equal((await request('/auth/login', null, { email: owners[0].email, password: 'test-password-123' })).status, 401);
        assert.equal((await request('/products', session.accessToken)).status, 401);
        assert.equal((await request('/auth/refresh', null, { refreshToken: session.refreshToken })).status, 401);
        assert.equal((await request('/products', otherSession)).status, 200);
      } finally {
        await database.collection('tenants').updateOne({ _id: tenants[0]._id }, { $unset: { licenseExpiresAt: '' } });
      }
      assert.equal((await request('/products', session.accessToken)).status, 200);
      assert.equal((await request('/tenant/me', session.accessToken, { licenseExpiresAt: '2099-01-01' }, 'PATCH')).status, 400);
    });
    if (process.argv.includes('--license')) return;
    await check('collection forecasts include only the entitled tenant’s remaining scheduled balances', async () => {
      const forecast = '/installments/collections-forecast';
      const first = await login(owners[0].email);
      const second = await login(owners[1].email);
      assert.equal((await request(forecast, first)).status, 403);
      const fixtures = [
        { _id: new mongoose.Types.ObjectId(), tenantId: tenants[0]._id, status: 'active',
          schedule: [{ dueDate: '2000-01-01', amount: 100, paidAmount: 25, status: 'pending' }] },
        { _id: new mongoose.Types.ObjectId(), tenantId: tenants[1]._id, status: 'active',
          schedule: [{ dueDate: '2000-01-01', amount: 900, paidAmount: 0, status: 'pending' }] },
      ];
      await database.collection('installmentplans').insertMany(fixtures);
      await database.collection('tenants').updateMany({ _id: { $in: tenants.map(tenant => tenant._id) } }, {
        $set: { 'featureFlags.collections-forecast': true },
      });
      try {
        const results = await Promise.all([request(forecast, first), request(forecast, second)]);
        assert.deepEqual(results.map(result => result.status), [200, 200]);
        assert.deepEqual(results.map(result => result.data.overdue), [{ amount: 75, count: 1 }, { amount: 900, count: 1 }]);
      } finally {
        await database.collection('installmentplans').deleteMany({ _id: { $in: fixtures.map(fixture => fixture._id) } });
        await database.collection('tenants').updateMany({ _id: { $in: tenants.map(tenant => tenant._id) } }, {
          $unset: { 'featureFlags.collections-forecast': '' },
        });
      }
    });
    if (process.argv.includes('--collections')) return;
  }
  if (process.argv.includes('--backup')) {
    const owner = await login(owners[0].email);
    const tenantId = tenants[0]._id;
    const text = 'a'.repeat(33_000);
    const rows = {
      products: { name: '=1+1', sku: '000123', price: 12.5, notes: text },
      customers: { name: 'Example customer', phone: '03001234567' },
      orders: { invoiceNo: 'INV-001', grandTotal: 12.5, items: [{ name: 'Example item', qty: 1 }] },
      invoicecounters: { year: 2026, lastNumber: 1 },
      installmentplans: { invoiceNo: 'INS-001', totalPayable: 12.5, payments: [] },
    };
    for (const [name, row] of Object.entries(rows)) {
      await database.collection(name).insertMany([{ tenantId, ...row }, { tenantId: tenants[1]._id, ...row }]);
    }
    await database.collection('users').updateOne({ _id: owners[0]._id }, { $set: { futureAuthSecret: 'must-not-export' } });
    await check('manual backup exports typed Excel workbooks and verified tenant-scoped records', async () => {
      const response = await fetch(`http://127.0.0.1:${port}/api/support/backup`, { headers: { Authorization: `Bearer ${owner}` } });
      assert.equal(response.status, 200, await (response.ok ? Promise.resolve('') : response.clone().text()));
      assert.match(response.headers.get('content-type') ?? '', /application\/zip/);
      const archive = new Uint8Array(await response.arrayBuffer());
      const sheets = await require('./backup-workbooks.cjs').verifyBackup(archive, tenantId.toString());
      for (const name of Object.keys(rows)) assert.equal(sheets[name + '.xlsx'].rowCount, 2);
      const products = sheets['products.xlsx'];
      const headers = products.getRow(1).values;
      assert.equal(products.getRow(2).getCell(headers.indexOf('Name')).value, '=1+1');
      assert.equal(products.getRow(2).getCell(headers.indexOf('Sku')).value, '000123');
      assert.equal(products.getRow(2).getCell(headers.indexOf('Price')).value, 12.5);
      assert.equal(products.getRow(2).getCell(headers.indexOf('Price')).numFmt, '#,##0.00');
      const longValues = products.workbook.getWorksheet('Long Values');
      assert.equal(longValues.getColumn(4).values.slice(2).join(''), text);
      assert.equal(response.headers.get('X-Snapshot-SHA256'), require('node:crypto').createHash('sha256').update(archive).digest('hex'));
    });
    await check('manual backup optionally exports JSON or both formats in one ZIP', async () => {
      const { unzipSync, strFromU8 } = requireApi('fflate');
      const { createHash } = require('node:crypto');
      for (const format of ['json', 'both']) {
        const response = await fetch(`http://127.0.0.1:${port}/api/support/backup?format=${format}`, { headers: { Authorization: `Bearer ${owner}` } });
        assert.equal(response.status, 200);
        const files = unzipSync(new Uint8Array(await response.arrayBuffer()));
        const manifest = JSON.parse(strFromU8(files['manifest.json']));
        for (const [name, record] of Object.entries(rows)) {
          const exported = JSON.parse(strFromU8(files[name + '.json']));
          assert.equal(exported.length, 1);
          assert.equal(exported[0].tenantId, tenantId.toString());
          for (const [field, value] of Object.entries(record)) assert.deepEqual(exported[0][field], value);
          assert.equal(!!files[name + '.xlsx'], format === 'both');
          assert.equal(manifest.counts[name], 1);
        }
        assert.equal(!!files['manifest.xlsx'], format === 'both');
        assert.equal(Object.keys(files).length, manifest.files.length + (format === 'both' ? 2 : 1));
        for (const file of manifest.files) {
          assert.equal(files[file.name].length, file.bytes);
          assert.equal(createHash('sha256').update(files[file.name]).digest('hex'), file.sha256);
        }
      }
      assert.equal((await request('/support/backup?format=csv', owner)).status, 400);
    });
    await check('V1 refuses cloud synchronization even with a destination configured', async () => {
      await database.collection('tenants').updateOne({ _id: tenantId }, {
        $set: { 'featureFlags.data-sync': true, deploymentMode: 'hybrid' },
      });
      const policy = await request('/support', owner);
      assert.deepEqual(policy.data.backup.sync, { entitled: true, configured: false, lastSyncedAt: null });
      const result = await request('/support/backup/sync', owner, {});
      assert.equal(result.status, 503);
      assert.match(result.data.message, /disabled in V1/);
    });
    return;
  }
  if (appearanceDirectory) {
    const owner = await login(owners[0].email);
    const otherOwner = await login(owners[1].email);
    const adminEmail = 'appearance-admin@spec.test';
    await database.collection('users').insertOne({ ...owners[0], _id: new mongoose.Types.ObjectId(), email: adminEmail, role: 'admin' });
    const admin = await login(adminEmail);
    const url = '/tenant/me/appearance';
    const defaults = { preset: 'minimal', mode: 'system', sidebar: 'preset', dashboardDensity: 'comfortable', tableDensity: 'comfortable', primary: null, secondary: null, logo: '' };
    await check('appearance is private and only owners can save it', async () => {
      assert.equal((await request(url)).status, 401);
      assert.equal((await request(url, admin, defaults, 'PATCH')).status, 403);
      assert.deepEqual((await request(url, owner)).data, defaults);
    });
    await check('appearance validates all presets and PostgreSQL persists updates for the right business', async () => {
      assert.equal((await request(url, owner, { ...defaults, primary: 'red' }, 'PATCH')).status, 400);
      assert.equal((await request(url, owner, { ...defaults, logo: 'https://example.test/logo' }, 'PATCH')).status, 400);
      assert.equal((await request(url, owner, { ...defaults, preset: 'unknown' }, 'PATCH')).status, 400);
      for (const preset of [
        'minimal', 'modern', 'enterprise', 'premium', 'compact',
        'glassmorphism', 'skeuomorphism', 'neo-brutalism', 'claymorphism', 'liquid-glass',
      ]) {
        const preferences = { ...defaults, preset, mode: 'dark', primary: '#C9A227', secondary: '#475569' };
        const result = await request(url, owner, preferences, 'PATCH');
        assert.equal(result.status, 200, JSON.stringify(result.data));
        assert.deepEqual(result.data, preferences);
        assert.deepEqual((await request(url, admin)).data, preferences);
        assert.deepEqual((await request(url, otherOwner)).data, defaults);
      }
      const { PostgresInvoiceStore } = requireApi('@pos/invoice-store');
      const reopened = PostgresInvoiceStore.fromDirectory(appearanceDirectory);
      try {
        assert.equal((await reopened.readAppearance(tenants[0]._id.toString())).preset, 'liquid-glass');
        assert.equal(await reopened.readAppearance(tenants[1]._id.toString()), null);
      } finally { await reopened.close(); }
      assert.deepEqual((await request(url, owner, defaults, 'PATCH')).data, defaults);
    });
    console.log(`${checks} live appearance integration checks passed.`);
    return;
  }
  if (process.argv.includes('--branches')) {
    const owner = await login(owners[0].email);
    const otherOwner = await login(owners[1].email);
    let mainId;
    let northId;
    let admin;
    await check('branch and audit APIs require authentication', async () => {
      for (const [path, method, body] of [
        ['/branches', 'GET'], ['/branches', 'POST', { name: 'North', code: 'NORTH' }],
        ['/branches/' + tenants[0]._id, 'PATCH', { name: 'North' }],
        ['/branches/' + tenants[0]._id, 'DELETE'], ['/audit', 'GET'],
      ]) assert.equal((await request(path, null, body, method)).status, 401);
    });
    await check('owners can list and create branches and the branch limit is enforced', async () => {
      assert.deepEqual((await request('/branches', owner)).data, []);
      const created = await request('/branches', owner, { name: 'Main branch', code: 'main' });
      assert.equal(created.status, 201, JSON.stringify(created.data));
      mainId = created.data._id;
      assert.deepEqual((await request('/branches', owner)).data.map((branch) => branch._id), [mainId]);
      assert.deepEqual((await request('/branches', otherOwner)).data, []);
      assert.equal((await request('/branches', owner, { name: 'North', code: 'NORTH' })).status, 403);
    });
    await check('administrators can manage newly created branches within their assigned scope', async () => {
      await database.collection('tenants').updateOne({ _id: tenants[0]._id }, { $set: { branchLimit: 2 } });
      const fixture = { ...owners[0], _id: new mongoose.Types.ObjectId(), email: 'branch-admin@spec.test', role: 'admin' };
      await database.collection('users').insertOne(fixture);
      admin = await login(fixture.email);
      const duplicate = await request('/branches', admin, { name: 'Duplicate', code: 'MAIN' });
      assert.equal(duplicate.status, 409, JSON.stringify(duplicate.data));
      assert.deepEqual((await database.collection('users').findOne({ _id: fixture._id })).branchIds, []);
      const created = await request('/branches', admin, { name: 'North branch', code: 'north', address: ' 10 Main Street ' });
      assert.equal(created.status, 201, JSON.stringify(created.data));
      northId = created.data._id;
      assert.equal(created.data.address, '10 Main Street');
      const listed = await request('/branches', admin);
      assert.equal(listed.status, 200, JSON.stringify(listed.data));
      assert.deepEqual(listed.data.map((branch) => branch._id), [northId]);
      assert.equal((await request(`/branches/${mainId}`, admin, { name: 'Outside scope' }, 'PATCH')).status, 403);
    });
    await check('branch edits validate fields, normalize values and prevent conflicting codes', async () => {
      const url = `/branches/${northId}`;
      assert.equal((await request(url, admin, { code: 'MAIN' }, 'PATCH')).status, 409);
      assert.equal((await request(url, admin, { name: '  ' }, 'PATCH')).status, 400);
      assert.equal((await request(url, admin, { address: null }, 'PATCH')).status, 400);
      assert.equal((await request('/branches/invalid', owner, { name: 'North' }, 'PATCH')).status, 400);
      assert.equal((await request(url, otherOwner, { name: 'Outside tenant' }, 'PATCH')).status, 404);
      const updated = await request(url, admin, { name: ' North Outlet ', code: ' north-1 ', address: '' }, 'PATCH');
      assert.equal(updated.status, 200, JSON.stringify(updated.data));
      assert.deepEqual([updated.data.name, updated.data.code, updated.data.address], ['North Outlet', 'NORTH-1', '']);
    });
    await check('deactivation preserves branch history, protects the default and can be reversed', async () => {
      const url = `/branches/${northId}`;
      assert.equal((await request(`/branches/${mainId}`, owner, undefined, 'DELETE')).status, 403);
      assert.equal((await request(url, otherOwner, undefined, 'DELETE')).status, 404);
      for (let attempt = 0; attempt < 2; attempt++) {
        const deactivated = await request(url, admin, undefined, 'DELETE');
        assert.equal(deactivated.status, 200, JSON.stringify(deactivated.data));
        assert.equal(deactivated.data.isActive, false);
      }
      const listed = await request('/branches', owner);
      assert.equal(listed.data.find((branch) => branch._id === northId)?.isActive, false);
      assert.equal((await request('/products', owner, undefined, 'GET', northId)).status, 403);
      assert.equal((await request('/branches', owner, { name: 'New branch', code: 'NEW' })).status, 403);
      const restored = await request(url, admin, { isActive: true }, 'PATCH');
      assert.equal(restored.status, 200, JSON.stringify(restored.data));
      assert.equal(restored.data.isActive, true);
      assert.equal((await request('/products', owner, undefined, 'GET', northId)).status, 200);
    });
    await check('audit events show branch mutations and respect tenant and branch scope', async () => {
      const audit = await request('/audit?page=1&limit=20', admin, undefined, 'GET', northId);
      assert.equal(audit.status, 200, JSON.stringify(audit.data));
      assert.ok(audit.data.data.every((event) => event.branchId === northId));
      const events = audit.data.data.filter((event) => event.details?.resourceId === northId);
      assert.deepEqual(new Set(events.map((event) => event.action)), new Set(['POST', 'PATCH', 'DELETE']));
      const ownAudit = await request('/audit', owner);
      assert.equal(ownAudit.status, 200);
      assert.ok(ownAudit.data.data.some((event) => event.details?.resourceId === mainId));
      const foreignBranch = await request('/branches', otherOwner, { name: 'Other business', code: 'NORTH-1' });
      assert.equal(foreignBranch.status, 201, JSON.stringify(foreignBranch.data));
      const foreignAudit = await request('/audit', otherOwner);
      assert.equal(foreignAudit.status, 200);
      assert.ok(foreignAudit.data.data.some((event) => event.details?.resourceId === foreignBranch.data._id));
      assert.ok(foreignAudit.data.data.every((event) => event.tenantId === tenants[1]._id.toString()));
    });
    console.log(`${checks} Branches & operations integration checks passed.`);
    return;
  }
  await check('registration persists the tenant and owner with a unique email', async () => {
    const registration = { developerEmail: 'provisioner@spec.test', developerPassword: registrationPassword,
      businessName: 'Provisioned business', domainType: 'retail', ownerName: 'New owner',
      email: 'new-owner@spec.test', password: 'Provision-Test-52!' };
    const response = await request('/auth/register', null, registration);
    assert.equal(response.status, 201, JSON.stringify(response.data));
    const account = await database.collection('users').findOne({ email: registration.email });
    assert.equal(account?.role, 'owner');
    assert.ok(await database.collection('tenants').findOne({ _id: account.tenantId }));
    assert.equal((await request('/auth/register', null, registration)).status, 409);
    assert.equal((await request('/auth/login', null, { email: registration.email, password: registration.password })).status, 201);
  });
  await check('invalid credentials rejected', async () => assert.equal((await request('/auth/login', null, { email: owners[0].email, password: 'wrong' })).status, 401));
  const owner = await login(owners[0].email); const otherOwner = await login(owners[1].email);
  await check('module read APIs respond for an authorized business account', async () => {
    for (const url of ['/tenant/me', '/auth/staff', '/products', '/customers', '/orders', '/orders/stats/summary', '/reports/sales', '/installments', '/installments/stats', '/installments/dashboard', '/installments/products', '/installments/sales', '/branches', '/audit', '/stock/movements', '/barcodes/products']) {
      const result = await request(url, owner);
      assert.equal(result.status, 200, `${url}: ${JSON.stringify(result.data)}`);
    }
  });
  await check('owner identity and action permissions', async () => { const me = await request('/auth/me', owner); assert.equal(me.status, 200); assert.ok(me.data.permissions.includes('sales.refund.approve')); });
  const productResult = await request('/products', owner, { name: 'Test item', sku: 'TEST-001', price: 100, stockQty: 10, taxClass: 'exempt' });
  assert.equal(productResult.status, 201, JSON.stringify(productResult.data)); const product = productResult.data;
  await check('cross-tenant product IDOR blocked', async () => { assert.equal((await request(`/products/${product._id}`, otherOwner)).status, 404); assert.equal((await request(`/products/${product._id}`, otherOwner, { price: 1 }, 'PATCH')).status, 404); });
  const staffResult = await request('/auth/staff', owner, { name: 'Cashier', email: 'cashier@spec.test', password: 'test-password-123', role: 'cashier', moduleRights: ['pos', 'orders'] });
  assert.equal(staffResult.status, 201, JSON.stringify(staffResult.data)); const staffId = staffResult.data._id; const cashier = await login('cashier@spec.test');
  await check('cashier role escalation and inventory edits denied', async () => { assert.equal((await request('/products', cashier, { name: 'Injected', price: 1 })).status, 403); assert.equal((await request('/auth/staff', cashier, { name: 'Escalated', email: 'x@spec.test', password: 'test-password-123', role: 'admin' })).status, 403); assert.equal((await request('/auth/staff', owner, { name: 'Escalated', email: 'x@spec.test', password: 'test-password-123', role: 'owner' })).status, 400); });
  const checkout = { idempotencyKey: randomUUID(), items: [{ productId: product._id, qty: 2 }], paymentMode: 'cash' };
  let order;
  await check('concurrent duplicate checkout deducts stock once', async () => {
    const responses = await Promise.all(Array.from({ length: 6 }, () => request('/orders', cashier, checkout)));
    assert.ok(responses.every((response) => [201, 409].includes(response.status)), JSON.stringify(responses));
    const replay = await request('/orders', cashier, checkout); assert.equal(replay.status, 201); order = replay.data;
    assert.equal((await request(`/products/${product._id}`, owner)).data.stockQty, 8);
    assert.equal(await database.collection('orders').countDocuments({ tenantId: tenants[0]._id }), 1);
    assert.equal((await request('/orders', cashier, { ...checkout, items: [{ productId: product._id, qty: 1 }] })).status, 409);
  });
  await check('invalid quantities and overselling leave stock unchanged', async () => { assert.equal((await request('/orders', cashier, { ...checkout, idempotencyKey: randomUUID(), items: [{ productId: product._id, qty: -1 }] })).status, 400); assert.equal((await request('/orders', cashier, { ...checkout, idempotencyKey: randomUUID(), items: [{ productId: product._id, qty: 100 }] })).status, 409); assert.equal((await request(`/products/${product._id}`, owner)).data.stockQty, 8); });
  let mixed;
  await check('mixed tender validates total and persists breakdown', async () => { assert.equal((await request('/orders', cashier, { ...checkout, idempotencyKey: randomUUID(), paymentMode: 'mixed', payments: [{ mode: 'cash', amount: 1 }, { mode: 'card', amount: 1 }] })).status, 400); const result = await request('/orders', cashier, { ...checkout, idempotencyKey: randomUUID(), paymentMode: 'mixed', payments: [{ mode: 'cash', amount: 120 }, { mode: 'card', amount: 80 }] }); assert.equal(result.status, 201, JSON.stringify(result.data)); mixed = result.data; assert.equal(mixed.payments.length, 2); });
  await check('cashier cannot authorize a refund', async () => assert.equal((await request(`/orders/${order._id}/refund`, cashier, { reason: 'Test return' })).status, 403));
  await check('refund race restores stock once', async () => { const responses = await Promise.all(Array.from({ length: 6 }, () => request(`/orders/${order._id}/refund`, owner, { reason: 'Test return' }))); assert.ok(responses.every((response) => response.status === 201), JSON.stringify(responses)); assert.equal((await request(`/products/${product._id}`, owner)).data.stockQty, 8); assert.equal((await request(`/orders/${order._id}`, owner)).data.status, 'refunded'); });
  await check('void race restores stock once', async () => { const responses = await Promise.all(Array.from({ length: 6 }, () => request(`/orders/${mixed._id}/void`, owner, {}))); assert.ok(responses.every((response) => response.status === 201), JSON.stringify(responses)); assert.equal((await request(`/products/${product._id}`, owner)).data.stockQty, 10); });
  await check('cashier cannot read another cashier or owner order and invoice', async () => { const result = await request('/orders', owner, { idempotencyKey: randomUUID(), items: [{ productId: product._id, qty: 1 }], paymentMode: 'cash' }); assert.equal(result.status, 201); assert.equal((await request(`/orders/${result.data._id}`, cashier)).status, 404); assert.equal((await request(`/orders/${result.data._id}/invoice`, cashier)).status, 404); await request(`/orders/${result.data._id}/void`, owner, {}); });
  await check('stock adjustments are audited, replay-safe, and never negative', async () => { const body = { productId: product._id, delta: 4, reason: 'Opening count correction', idempotencyKey: randomUUID() }; assert.equal((await request('/stock/adjustments', owner, body)).status, 201); assert.equal((await request('/stock/adjustments', owner, body)).status, 201); assert.equal((await request(`/products/${product._id}`, owner)).data.stockQty, 14); assert.equal((await request('/stock/adjustments', owner, { ...body, delta: -50, idempotencyKey: randomUUID() })).status, 409); assert.equal((await request('/stock/adjustments', cashier, body)).status, 403); assert.equal((await request('/stock/adjustments', otherOwner, { ...body, idempotencyKey: randomUUID() })).status, 404); assert.equal((await request(`/products/${product._id}`, owner, { stockQty: 500 }, 'PATCH')).status, 400); assert.ok((await request('/stock/movements', owner)).data.total >= 1); });
  await check('barcode lookup is exact and malformed or duplicate barcodes are rejected', async () => { const barcode = '1234567890128'; const body = { name: 'Barcode item', price: 25, barcode }; const created = await request('/products', owner, body); assert.equal(created.status, 201); const found = await request(`/products?barcode=${barcode}`, owner); assert.equal(found.status, 200); assert.equal(found.data.total, 1); assert.equal(found.data.data[0]._id, created.data._id); assert.equal((await request('/products', owner, body)).status, 409); assert.equal((await request('/products?barcode=%0Ainvalid', owner)).status, 400); });
  await check('barcode generation validates all supported formats and check digits', async () => {
    for (const [format, value, expected] of [['CODE128', 'SKU-001', 'SKU-001'], ['CODE39', 'ABC-123', 'ABC-123'], ['EAN13', '400638133393', '4006381333931'], ['EAN8', '9638507', '96385074'], ['UPC', '03600029145', '036000291452']]) {
      const result = await request('/barcodes/generate', owner, { format, value });
      assert.equal(result.status, 201, JSON.stringify(result.data)); assert.equal(result.data.value, expected); assert.match(result.data.svg, /<svg/);
    }
    for (const body of [{ format: 'EAN13', value: '4006381333932' }, { format: 'CODE128', value: 'A\u0001B' }, { format: 'CODE39', value: 'lowercase' }, { format: 'QRCODE', value: 'ABC' }, { format: 'CODE128', value: 'ABC', scale: 0 }, { format: 'CODE128' }]) assert.equal((await request('/barcodes/generate', owner, body)).status, 400);
    assert.equal((await request('/barcodes/generate', null, { format: 'CODE128', value: 'A' })).status, 401);
  });
  await check('generated product labels and scanner lookup respect tenant scope', async () => {
    const generated = await request('/barcodes/generate', owner, { format: 'CODE128', productId: product._id }); assert.equal(generated.status, 201); assert.equal(generated.data.value, 'TEST-001');
    assert.equal((await request('/barcodes/generate', otherOwner, { format: 'CODE128', productId: product._id })).status, 404);
    assert.equal((await request('/barcodes/lookup?value=TEST-001', owner)).data._id, product._id);
    assert.equal((await request('/barcodes/lookup?value=TEST-001', otherOwner)).status, 404);
    assert.equal((await request('/barcodes/lookup?value=%0A', owner)).status, 400);
    assert.equal((await request('/barcodes/lookup?value=missing', owner)).status, 404);
    assert.equal((await request('/products?barcode=1234567890128&q=Test', owner)).data.total, 0);
  });
  await check('exact barcode wins over SKU and inactive products are not scanned', async () => {
    await request('/products', owner, { name: 'SKU fallback item', sku: 'SAME-CODE', price: 1 });
    const exact = await request('/products', owner, { name: 'Exact barcode item', barcode: 'SAME-CODE', price: 2 }); assert.equal(exact.status, 201);
    assert.equal((await request('/barcodes/lookup?value=SAME-CODE', owner)).data._id, exact.data._id);
    await request(`/products/${exact.data._id}`, owner, { isActive: false }, 'PATCH');
    assert.equal((await request('/barcodes/generate', owner, { format: 'CODE128', productId: exact.data._id })).status, 400);
    assert.notEqual((await request('/barcodes/lookup?value=SAME-CODE', owner)).data._id, exact.data._id);
  });
  await check('UPC and zero-prefixed EAN scans resolve the same retail product', async () => {
    const item = await request('/products', owner, { name: 'UPC product', barcode: '036000291452', price: 50 });
    assert.equal(item.status, 201);
    assert.equal((await request('/barcodes/lookup?value=0036000291452', owner)).data._id, item.data._id);
    await request(`/products/${item.data._id}`, owner, { barcode: '0036000291452' }, 'PATCH');
    assert.equal((await request('/barcodes/lookup?value=036000291452', owner)).data._id, item.data._id);
    assert.equal((await request('/barcodes/lookup?value=0036000291453', owner)).status, 404);
  });
  await check('barcode modules enforce separate scanner and generator rights', async () => {
    const staff = await request('/auth/staff', owner, { name: 'Scanner user', email: 'scanner@spec.test', password: 'test-password-123', role: 'cashier', moduleRights: ['barcode-scanner'] }); assert.equal(staff.status, 201);
    const token = await login('scanner@spec.test');
    assert.equal((await request('/barcodes/lookup?value=TEST-001', token)).status, 200);
    assert.equal((await request('/barcodes/generate', token, { format: 'CODE128', value: 'A' })).status, 403);
    assert.equal((await request('/barcodes/products', token)).status, 403);
    await request(`/auth/staff/${staff.data._id}/rights`, owner, { moduleRights: ['barcode-generator'] }, 'PATCH');
    assert.equal((await request('/barcodes/generate', token, { format: 'CODE128', value: 'A' })).status, 201);
    assert.equal((await request('/barcodes/products?q=Test', token)).status, 200);
    assert.equal((await request('/barcodes/lookup?value=TEST-001', token)).status, 403);
  });
  await check('barcode entitlement works independently and disabled access is enforced', async () => {
    try {
      await database.collection('tenants').updateOne({ _id: tenants[0]._id }, { $set: { 'featureFlags.inventory': false, 'featureFlags.pos': false } });
      assert.equal((await request('/barcodes/generate', owner, { format: 'CODE128', value: 'A' })).status, 201);
      assert.equal((await request('/barcodes/products', owner)).status, 200);
      await database.collection('tenants').updateOne({ _id: tenants[0]._id }, { $set: { 'featureFlags.barcodes': false } });
      assert.equal((await request('/barcodes/lookup?value=TEST-001', owner)).status, 403);
      assert.equal((await request('/barcodes/generate', owner, { format: 'CODE128', value: 'A' })).status, 403);
    } finally { await database.collection('tenants').updateOne({ _id: tenants[0]._id }, { $set: { 'featureFlags.inventory': true, 'featureFlags.pos': true, 'featureFlags.barcodes': true } }); }
  });
  await check('action-level restrictions cannot be expanded through staff invitations', async () => { const created = await request('/auth/staff', owner, { name: 'Limited admin', email: 'limited@spec.test', password: 'test-password-123', role: 'admin', moduleRights: ['settings', 'dashboard'] }); assert.equal(created.status, 201); const changed = await request(`/auth/staff/${created.data._id}/rights`, owner, { moduleRights: ['settings', 'dashboard'], permissions: ['users.invite', 'reports.read'] }, 'PATCH'); assert.equal(changed.status, 200); const admin = await login('limited@spec.test', 'test-password-123', '0000', '4321'); assert.equal((await request(`/orders/${order._id}/refund`, admin, { reason: 'Not authorized' })).status, 403); const invited = await request('/auth/staff', admin, { name: 'Delegated admin', email: 'delegated@spec.test', password: 'test-password-123', role: 'admin', moduleRights: ['settings'] }); assert.equal(invited.status, 201, JSON.stringify(invited.data)); assert.ok(!invited.data.permissions.includes('users.roles.assign')); assert.ok(!invited.data.permissions.includes('inventory.write')); });
  await check('deactivate and reactivate revoke previous sessions', async () => { assert.equal((await request(`/auth/staff/${staffId}/status`, owner, { isActive: false }, 'PATCH')).status, 200); assert.equal((await request('/products', cashier)).status, 401); assert.equal((await request(`/auth/staff/${staffId}/status`, owner, { isActive: true }, 'PATCH')).status, 200); assert.equal((await request('/products', cashier)).status, 401); });
  const defaultBranch = await request('/branches', owner, { name: 'Main branch', code: 'MAIN' }); assert.equal(defaultBranch.status, 201, JSON.stringify(defaultBranch.data));
  await check('branch limit is enforced', async () => assert.equal((await request('/branches', owner, { name: 'Second branch', code: 'SECOND' })).status, 403));
  const developerPassword = 'developer-password-123';
  const setup = await request('/auth/developer/setup-password', null, { email: 'developer@spec.test', setupToken, password: developerPassword }); assert.equal(setup.status, 201, JSON.stringify(setup.data)); assert.equal(setup.data.passwordSet, true);
  const developerResult = await request('/auth/developer/login', null, { email: 'developer@spec.test', password: developerPassword }); assert.equal(developerResult.status, 201, JSON.stringify(developerResult.data)); const developer = developerResult.data.accessToken;
  await require('./delivery-phase-checks.cjs')({ request, check, owner, cashier: await login('cashier@spec.test'), otherOwner, developer, database, tenants, mongoose, uri, rawFetch: (url, token) => fetch(`http://127.0.0.1:${port}/api${url}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} }) });
  await check('backup is developer-only and includes business records without credentials', async () => {
    assert.equal((await request('/developer/backup', owner)).status, 403);
    const backup = await request('/developer/backup', developer);
    assert.equal(backup.status, 200, JSON.stringify(backup.data));
    assert.equal(backup.data.meta.version, 2);
    assert.equal((await request('/developer/backup/options', owner)).status, 403);
    assert.equal((await request('/developer/backup/deliver', owner, { destination: 'email' })).status, 403);
    const options = await request('/developer/backup/options', developer);
    assert.equal(options.status, 200);
    assert.equal(options.data.mode, 'offline');
    assert.equal((await request('/developer/backup/deliver', developer, { destination: 'email' })).status, 400);
    for (const name of ['Product', 'Customer', 'Order', 'InstallmentPlan', 'InstallmentSale', 'Branch', 'StockAdjustment', 'AuditEvent']) assert.ok(Array.isArray(backup.data.businessData[name]), name);
    assert.ok(backup.data.businessData.Product.length > 0);
    for (const account of backup.data.accounts) {
      assert.equal(account.passwordHash, undefined); assert.equal(account.pinHash, undefined); assert.equal(account.developerPinHash, undefined);
    }
  });
  await check('platform settings require developer scope', async () => { assert.equal((await request(`/developer/businesses/${tenants[0]._id}`, owner, { branchLimit: 2 }, 'PATCH')).status, 403); assert.equal((await request(`/developer/businesses/${tenants[0]._id}`, developer, { branchLimit: 2, deploymentMode: 'hybrid' }, 'PATCH')).status, 200); });
  const secondBranch = await request('/branches', owner, { name: 'Second branch', code: 'SECOND' }); assert.equal(secondBranch.status, 201, JSON.stringify(secondBranch.data));
  await check('branches can be edited, deactivated, and reactivated within their tenant', async () => {
    const branchUrl = `/branches/${secondBranch.data._id}`;
    const updated = await request(branchUrl, owner, { name: ' North Branch ', code: ' north-1 ', address: ' 12 Main Street ' }, 'PATCH');
    assert.equal(updated.status, 200);
    assert.deepEqual(
      [updated.data.name, updated.data.code, updated.data.address],
      ['North Branch', 'NORTH-1', '12 Main Street'],
    );
    assert.equal((await request(branchUrl, owner, { code: 'MAIN' }, 'PATCH')).status, 409);
    assert.equal((await request(branchUrl, otherOwner, undefined, 'DELETE')).status, 404);
    assert.equal((await request(`/branches/${defaultBranch.data._id}`, owner, undefined, 'DELETE')).status, 403);
    const deactivated = await request(branchUrl, owner, undefined, 'DELETE');
    assert.equal(deactivated.status, 200);
    assert.equal(deactivated.data.isActive, false);
    const listed = await request('/branches', owner);
    assert.equal(listed.status, 200);
    assert.equal(listed.data.find((branch) => branch._id === secondBranch.data._id)?.isActive, false);
    assert.equal((await request('/products', owner, undefined, 'GET', secondBranch.data._id)).status, 403);
    const reactivated = await request(branchUrl, owner, { isActive: true }, 'PATCH');
    assert.equal(reactivated.status, 200);
    assert.equal(reactivated.data.isActive, true);
  });
  await check('developer catalog and subscription edits propagate to existing accounts', async () => {
    const catalog = await request('/developer/features', developer);
    assert.equal(catalog.status, 200); assert.ok(catalog.data.some((item) => item.key === 'barcodes'));
    assert.equal((await request('/developer/features', owner)).status, 403);
    const plan = await request('/developer/plans', developer, { name: 'Integration subscription', price: 100, billingInterval: 'monthly', features });
    assert.equal(plan.status, 201, JSON.stringify(plan.data));
    assert.equal((await request(`/developer/businesses/${tenants[0]._id}/plan`, developer, { subscriptionPlanId: plan.data._id }, 'PATCH')).status, 200);
    assert.equal((await request(`/developer/plans/${plan.data._id}`, developer, { features: { ...features, barcodes: false } }, 'PATCH')).status, 200);
    assert.equal((await request('/barcodes/lookup?value=TEST-001', owner)).status, 403);
    assert.equal((await request(`/developer/plans/${plan.data._id}`, developer, { features }, 'PATCH')).status, 200);
    assert.equal((await request('/barcodes/lookup?value=TEST-001', owner)).status, 200);
  });
  await check('barcode generation and lookup cannot cross branch boundaries', async () => {
    assert.equal((await request('/barcodes/lookup?value=TEST-001', owner, undefined, 'GET', secondBranch.data._id)).status, 404);
    assert.equal((await request('/barcodes/generate', owner, { format: 'CODE128', productId: product._id }, 'POST', secondBranch.data._id)).status, 404);
    assert.equal((await request('/barcodes/lookup?value=TEST-001', owner, undefined, 'GET', defaultBranch.data._id)).status, 200);
    assert.equal((await request('/barcodes/products', otherOwner, undefined, 'GET', secondBranch.data._id)).status, 403);
  });
  await check('branch IDOR blocked and legacy stock belongs to default branch only', async () => { assert.equal((await request(`/products/${product._id}`, owner, undefined, 'GET', secondBranch.data._id)).status, 404); const newProduct = await request('/products', owner, { name: 'Branch item', price: 50, stockQty: 3 }, 'POST', secondBranch.data._id); assert.equal(newProduct.status, 201, JSON.stringify(newProduct.data)); assert.equal((await request(`/products/${newProduct.data._id}`, owner, undefined, 'GET', defaultBranch.data._id)).status, 404); assert.equal((await request('/products', otherOwner, undefined, 'GET', secondBranch.data._id)).status, 403); });
  await check('staff branch grants reject cross-tenant branches', async () => { const result = await request(`/auth/staff/${staffId}/rights`, owner, { moduleRights: ['pos', 'orders'], branchIds: [defaultBranch.data._id] }, 'PATCH'); assert.equal(result.status, 200, JSON.stringify(result.data)); const freshCashier = await login('cashier@spec.test'); assert.equal((await request('/products', freshCashier, undefined, 'GET', secondBranch.data._id)).status, 403); assert.equal((await request('/products', freshCashier, undefined, 'GET', defaultBranch.data._id)).status, 200); });
  await check('license expiry blocks tenant operations and cannot be changed by owner', async () => { assert.equal((await request('/tenant/me', owner, { licenseExpiresAt: '2099-01-01' }, 'PATCH')).status, 400); assert.equal((await request(`/developer/businesses/${tenants[0]._id}`, developer, { licenseExpiresAt: '2020-01-01T00:00:00Z' }, 'PATCH')).status, 200); assert.equal((await request('/products', owner)).status, 401); await request(`/developer/businesses/${tenants[0]._id}`, developer, { licenseExpiresAt: '2099-01-01T00:00:00Z' }, 'PATCH'); });
  await check('audit trail records actions without credentials', async () => { const audit = await request('/audit', owner); assert.equal(audit.status, 200); assert.ok(audit.data.total >= 10); assert.ok(!JSON.stringify(audit.data).includes('test-password')); });
  const recoveryRequest = async (email, purpose = 'password', channel = 'email') => {
    await database.collection('users').updateOne({ email }, { $unset: { securityCodeRequestedAt: 1 } });
    const result = await request('/auth/recovery/request', null, { email, purpose, channel });
    assert.equal(result.status, 201, JSON.stringify(result.data));
    const code = channel === 'email' ? /code is (\d{6})/.exec(recoveryFixtures.emails.at(-1) || '')?.[1] : JSON.parse(recoveryFixtures.messages.at(-1).ContentVariables)['1'];
    assert.ok(code, 'No code was captured by the local provider fixture');
    return { ...result.data, code };
  };
  await check('unknown accounts receive a generic recovery response without delivery', async () => {
    const count = recoveryFixtures.emails.length;
    const result = await request('/auth/recovery/request', null, { email: 'missing@spec.test', purpose: 'password' });
    assert.equal(result.status, 201); assert.ok(result.data.challengeId); assert.equal(recoveryFixtures.emails.length, count);
    assert.equal((await request('/auth/recovery/confirm', null, { challengeId: result.data.challengeId, code: '123456', newSecret: 'new-password-123' })).status, 400);
  });
  await check('WhatsApp enrollment requires OTP and old fake verification is rejected', async () => {
    await database.collection('users').updateOne({ _id: owners[0]._id }, { $set: { phone: '+923001234567', phoneVerified: true, phoneVerifiedAt: null }, $unset: { securityCodeRequestedAt: 1 } });
    const count = recoveryFixtures.messages.length;
    assert.equal((await request('/auth/recovery/request', null, { email: owners[0].email, purpose: 'password', channel: 'whatsapp' })).status, 201);
    assert.equal(recoveryFixtures.messages.length, count);
    const sent = await request('/auth/me/phone/request', owner, { phone: '+923001234567' }); assert.equal(sent.status, 201, JSON.stringify(sent.data));
    const code = JSON.parse(recoveryFixtures.messages.at(-1).ContentVariables)['1'];
    const stored = await database.collection('recoverychallenges').findOne({ challengeId: sent.data.challengeId });
    assert.ok(stored, 'Phone OTP challenge was not persisted');
    assert.ok(await bcrypt.compare(code, stored.codeHash), 'Delivered phone OTP does not match the stored hash');
    assert.equal(String(stored.userId), String(owners[0]._id));
    assert.equal((await request('/auth/me/phone/confirm', otherOwner, { challengeId: sent.data.challengeId, code })).status, 400);
    const confirmed = await request('/auth/me/phone/confirm', owner, { challengeId: sent.data.challengeId, code });
    assert.equal(confirmed.status, 201, JSON.stringify(confirmed.data));
    assert.equal((await database.collection('users').findOne({ _id: owners[0]._id })).phoneVerified, true);
    assert.equal((await request('/auth/me/phone/confirm', owner, { challengeId: sent.data.challengeId, code })).status, 400);
  });
  await check('recovery cooldown and five concurrent wrong guesses block further use', async () => {
    const issued = await recoveryRequest(owners[0].email);
    const count = recoveryFixtures.emails.length;
    assert.equal((await request('/auth/recovery/request', null, { email: owners[0].email, purpose: 'password' })).status, 201);
    assert.equal(recoveryFixtures.emails.length, count);
    const wrong = await Promise.all(Array.from({ length: 5 }, () => request('/auth/recovery/confirm', null, { challengeId: issued.challengeId, code: '000000', newSecret: 'new-password-123' })));
    assert.ok(wrong.every((result) => result.status === 400));
    assert.equal((await request('/auth/recovery/confirm', null, { challengeId: issued.challengeId, code: issued.code, newSecret: 'new-password-123' })).status, 400);
  });
  await check('expired, superseded and contact-changed recovery codes are rejected', async () => {
    const expired = await recoveryRequest(owners[0].email);
    await database.collection('recoverychallenges').updateOne({ challengeId: expired.challengeId }, { $set: { expiresAt: new Date(0) } });
    assert.equal((await request('/auth/recovery/confirm', null, { challengeId: expired.challengeId, code: expired.code, newSecret: 'new-password-123' })).status, 400);
    const old = await recoveryRequest(owners[0].email); const fresh = await recoveryRequest(owners[0].email);
    assert.equal((await request('/auth/recovery/confirm', null, { challengeId: old.challengeId, code: old.code, newSecret: 'new-password-123' })).status, 400);
    await database.collection('users').updateOne({ _id: owners[0]._id }, { $set: { recoveryEmail: 'changed@spec.test', emailVerified: true, emailVerifiedAt: new Date() } });
    assert.equal((await request('/auth/recovery/confirm', null, { challengeId: fresh.challengeId, code: fresh.code, newSecret: 'new-password-123' })).status, 400);
    await database.collection('users').updateOne({ _id: owners[0]._id }, { $set: { recoveryEmail: null, emailVerified: false, emailVerifiedAt: null } });
  });
  await check('failed WhatsApp delivery reports an error and invalidates its code', async () => {
    recoveryFixtures.failWhatsapp(true);
    await database.collection('users').updateOne({ _id: owners[0]._id }, { $unset: { securityCodeRequestedAt: 1 } });
    assert.equal((await request('/auth/recovery/request', null, { email: owners[0].email, purpose: 'password', channel: 'whatsapp' })).status, 503);
    assert.equal(await database.collection('recoverychallenges').countDocuments({ userId: owners[0]._id }), 0);
    recoveryFixtures.failWhatsapp(false);
  });
  await database.collection('users').insertOne({ tenantId: tenants[1]._id, name: 'Test platform admin', email: 'super@spec.test', passwordHash: await bcrypt.hash('test-password-123', 4), pinHash: await bcrypt.hash('1234', 4), role: 'owner', superAdmin: true, isActive: true, pinVersion: 0 });
  await check('developer sends a verified, business-bound client reset link', async () => {
    const client = { ...owners[1], _id: new mongoose.Types.ObjectId(), email: 'client-reset@spec.test', emailVerified: true, emailVerifiedAt: new Date() };
    await database.collection('users').insertOne(client);
    const session = await login(client.email);
    const route = `/developer/clients/${tenants[1]._id}/${client._id}/password-reset`;
    assert.equal((await request(route, owner, {})).status, 403);
    assert.equal((await request(`/developer/clients/${tenants[0]._id}/${client._id}/password-reset`, developer, {})).status, 404);
    const sent = await request(route, developer, {});
    assert.equal(sent.status, 201, JSON.stringify(sent.data));
    assert.deepEqual(Object.keys(sent.data), ['message']);
    assert.equal((await request(route, developer, {})).status, 409);
    const mail = recoveryFixtures.emails.at(-1).replace(/=\r\n/g, '').replace(/=3D/g, '=');
    const token = /\/reset-password#token=([A-Za-z0-9_-]{43})/.exec(mail)?.[1];
    assert.ok(token);
    const body = { token, newPassword: 'client-recovery-passphrase-456' };
    assert.equal((await request('/auth/reset-password', null, body)).status, 201);
    assert.equal((await request('/auth/reset-password', null, body)).status, 400);
    assert.equal((await request('/auth/me', session)).status, 401);
    assert.ok(await login(client.email, body.newPassword));
    assert.equal(await database.collection('auditevents').countDocuments({
      tenantId: tenants[1]._id, action: { $in: ['password.reset_requested', 'password.reset_completed'] },
      'details.accountId': String(client._id),
    }), 2);
  });
  await check('email OTP changes passwords for owner, admin, cashier, superadmin and developer', async () => {
    for (const email of [owners[0].email, 'limited@spec.test', 'cashier@spec.test', 'super@spec.test', 'developer@spec.test']) {
      const issued = await recoveryRequest(email);
      assert.ok(recoveryFixtures.emails.at(-1).includes(email));
      const result = await request('/auth/recovery/confirm', null, { challengeId: issued.challengeId, code: issued.code, newSecret: 'updated-password-123' });
      assert.equal(result.status, 201, `${email}: ${JSON.stringify(result.data)}`);
      assert.equal((await request('/auth/recovery/confirm', null, { challengeId: issued.challengeId, code: issued.code, newSecret: 'another-password-123' })).status, 400);
      const account = await database.collection('users').findOne({ email }); assert.ok(await bcrypt.compare('updated-password-123', account.passwordHash));
    }
    assert.equal((await request('/auth/me', owner)).status, 401);
    assert.equal((await request('/auth/me', developer)).status, 401);
    assert.equal((await request('/auth/login', null, { email: owners[0].email, password: 'test-password-123' })).status, 401);
    assert.equal((await request('/auth/login', null, { email: owners[0].email, password: 'updated-password-123' })).status, 201);
  });
  await check('WhatsApp PIN recovery enables verified PIN login for a cashier', async () => {
    const account = await database.collection('users').findOne({ email: 'cashier@spec.test' });
    await database.collection('users').updateOne({ _id: account._id }, { $set: { phone: '+923001234568', phoneVerified: true, phoneVerifiedAt: new Date() } });
    const issued = await recoveryRequest(account.email, 'pin', 'whatsapp');
    assert.equal((await request('/auth/recovery/confirm', null, { challengeId: issued.challengeId, code: issued.code, newSecret: '5678' })).status, 201);
    const step = await request('/auth/login', null, { email: account.email, password: 'updated-password-123' }); assert.equal(step.data.requiresPin, true);
    const loggedIn = await request('/auth/login/pin', null, { challengeToken: step.data.challengeToken, pin: '5678' }); assert.equal(loggedIn.status, 201, JSON.stringify(loggedIn.data));
    assert.equal((await request('/auth/me', loggedIn.data.accessToken)).status, 200);
  });
  await check('developer authentication requires the configured email and password', async () => {
    assert.equal((await request('/auth/developer/login', null, { pin: '48291736' })).status, 400);
    assert.equal((await request('/auth/developer/login', null, { email: 'developer@spec.test', password: 'wrong-password-123' })).status, 401);
    assert.equal((await request('/auth/developer/login', null, { email: 'developer@spec.test', password: developerPassword })).status, 401);
    assert.equal((await request('/auth/developer/login', null, { email: 'developer@spec.test', password: 'updated-password-123' })).status, 201);
    assert.equal((await request('/auth/recovery/request', null, { email: 'developer@spec.test', purpose: 'developer-pin' })).status, 400);
  });
  await check('legacy PIN reset endpoints use the same OTP and session protections', async () => {
    await database.collection('users').updateOne({ email: owners[0].email }, { $unset: { securityCodeRequestedAt: 1 } });
    const issued = await request('/auth/pin/reset/request', null, { email: owners[0].email }); assert.equal(issued.status, 201);
    const code = /code is (\d{6})/.exec(recoveryFixtures.emails.at(-1))[1];
    assert.equal((await request('/auth/pin/reset', null, { email: owners[0].email, code, newPin: '6789' })).status, 201);
    assert.equal((await request('/auth/pin/reset', null, { email: owners[0].email, code, newPin: '9876' })).status, 400);
    const token = await login(owners[0].email, 'updated-password-123', '6789'); assert.ok(token);
  });
  await check('an emailed reset link changes the password once and revokes the previous session', async () => {
    const email = 'reset-link@spec.test';
    await database.collection('users').insertOne({ ...owners[0], _id: new mongoose.Types.ObjectId(), email });
    const previousSession = await login(email);
    assert.equal((await request('/auth/forgot-password', null, { email })).status, 201);
    const message = recoveryFixtures.emails.at(-1).replace(/=\r\n/g, '').replace(/=3D/g, '=');
    const token = /\/reset-password#token=([A-Za-z0-9_-]{43})/.exec(message)?.[1];
    assert.ok(token, 'Expected reset link in local SMTP delivery');
    const body = { token, newPassword: 'new-test-passphrase-123' };
    assert.equal((await request('/auth/reset-password', null, body)).status, 201);
    assert.equal((await request('/auth/reset-password', null, body)).status, 400);
    assert.equal((await request('/auth/me', previousSession)).status, 401);
    assert.ok(await login(email, body.newPassword));
  });
  console.log(`\n${checks} real API integration checks passed against ${databaseName}.`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => {
  child?.kill();
  if (appearancePostgres) {
    try {
      for (const name of appearanceDatabases) await appearancePostgres.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    } finally { await appearancePostgres.end(); }
  }
  if (appearanceDirectory) {
    const fs = require('node:fs');
    for (const name of fs.readdirSync(appearanceDirectory)) fs.unlinkSync(path.join(appearanceDirectory, name));
    fs.rmdirSync(appearanceDirectory);
  }
  if (recoveryFixtures) await recoveryFixtures.close();
  if (database && /^pos_spec_test_\d+_[a-f0-9]{8}$/.test(databaseName) && database.name === databaseName) { await database.dropDatabase(); await database.close(); }
  const Redis = requireApi('ioredis'); const redis = new Redis('redis://127.0.0.1:6379/0', { maxRetriesPerRequest: 1 });
  try { const keys = await redis.keys(`${prefix}:*`); if (keys.length && keys.every((key) => key.startsWith(`${prefix}:`))) await redis.del(...keys); } finally { redis.disconnect(); }
});
