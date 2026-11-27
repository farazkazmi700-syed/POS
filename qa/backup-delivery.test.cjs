const { test, mock } = require('node:test');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const requireApi = createRequire(require('node:path').resolve('app/api/package.json'));
const { BackupDeliveryService } = requireApi('./dist/modules/developer/backup-delivery.service.js');
const { SupportController } = requireApi('./dist/modules/support/support.module.js');
const { createHash } = require('node:crypto');
const nodemailer = requireApi('nodemailer');
const { unzipSync, strFromU8 } = requireApi('fflate');
const snapshot = { meta: { version: 2 }, businessData: { Product: [{ name: 'Test' }] } };
const make = (config) => new BackupDeliveryService({ get: (key, fallback) => config[key] ?? fallback }, { createBackup: async () => snapshot });
const drive = { BACKUP_MODE: 'cloud', BACKUP_DRIVE_CLIENT_ID: 'client', BACKUP_DRIVE_CLIENT_SECRET: 'secret', BACKUP_DRIVE_REFRESH_TOKEN: 'refresh', BACKUP_DRIVE_FOLDER_ID: 'folder' };

test('cloud snapshots require a matching checksum before recording a confirmed sync', async (t) => {
  const tenantId = '507f1f77bcf86cd799439011';
  const user = { tenantId, role: 'owner' };
  const endpoint = 'https://snapshots.example.test/v1/business-snapshot';
  const config = { DATA_SYNC_TENANT_ID: tenantId, DATA_SYNC_URL: endpoint, DATA_SYNC_TOKEN: 'a'.repeat(64) };
  const audit = [];
  const controller = new SupportController(
    { db: { collection: () => ({ findOne: async () => ({ deploymentMode: 'hybrid', featureFlags: { 'data-sync': true } }) }) } },
    { record: async (...event) => audit.push(event) },
    { executableKeys: async (keys) => keys },
    { get: (key) => config[key] },
  );
  const payload = Buffer.from('snapshot fixture');
  controller.createArchive = async () => ({ bytes: payload });
  const hash = createHash('sha256').update(payload).digest('hex');
  let confirm = false;
  t.mock.method(globalThis, 'fetch', async (url, request) => {
    assert.equal(String(url), endpoint);
    assert.equal(request.redirect, 'error');
    assert.equal(request.headers['X-Business-Id'], tenantId);
    assert.equal(request.headers['X-Snapshot-SHA256'], hash);
    assert.deepEqual(Buffer.from(request.body), payload);
    return new Response(null, { status: 201, headers: { 'X-Snapshot-SHA256': confirm ? hash : 'mismatch' } });
  });
  await assert.rejects(controller.sync(user), error => error.getStatus() === 502);
  assert.equal(audit.length, 0);
  confirm = true;
  assert.ok((await controller.sync(user)).syncedAt);
  assert.equal(audit[0][1], 'backup.synced');
  await assert.rejects(controller.sync({ ...user, tenantId: '507f1f77bcf86cd799439012' }), error => error.getStatus() === 503);
});
test('offline mode rejects cloud delivery', async () => {
  const service = make({}); assert.equal(service.options().mode, 'offline');
  await assert.rejects(service.deliver('email'), /unavailable/);
});
test('email delivers a valid ZIP to the configured address', async () => {
  let message; let closed = false;
  const stub = mock.method(nodemailer, 'createTransport', () => ({ sendMail: async value => { message = value; return { accepted: ['backup@example.test'] }; }, close: () => { closed = true; } }));
  try {
    const service = make({ BACKUP_MODE: 'cloud', SMTP_HOST: 'smtp.example.test', SMTP_USER: 'sender', SMTP_PASSWORD: 'test', BACKUP_EMAIL_TO: 'backup@example.test' });
    assert.equal((await service.deliver('email')).status, 'accepted');
    assert.equal(message.to, 'backup@example.test');
    const files = unzipSync(message.attachments[0].content);
    assert.deepEqual(JSON.parse(strFromU8(files['businessData.json'])), snapshot.businessData);
    assert.ok(files['manifest.json']); assert.ok(closed);
  } finally { stub.mock.restore(); }
});
test('Drive refreshes OAuth and uploads to the configured folder', async () => {
  const requests = [];
  const stub = mock.method(global, 'fetch', async (url, options) => { requests.push([url, options]); return new Response(JSON.stringify(requests.length === 1 ? { access_token: 'fake-token' } : { id: 'file-id' })); });
  try {
    assert.equal((await make(drive).deliver('drive')).fileId, 'file-id');
    assert.equal(requests.length, 2); assert.match(String(requests[1][1].body), /"parents":\["folder"\]/);
  } finally { stub.mock.restore(); }
});
test('provider failure hides secrets and releases the delivery lock', async () => {
  const stub = mock.method(global, 'fetch', async () => { throw new Error('private-token'); });
  try {
    const service = make(drive);
    await assert.rejects(service.deliver('drive'), /Delivery could not be confirmed/);
    await assert.rejects(service.deliver('drive'), /Delivery could not be confirmed/);
  } finally { stub.mock.restore(); }
});
