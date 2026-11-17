const { test, mock } = require('node:test');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const requireApi = createRequire(require('node:path').resolve('apps/api/package.json'));
const { BackupDeliveryService } = requireApi('./dist/modules/developer/backup-delivery.service.js');
const nodemailer = requireApi('nodemailer');
const { unzipSync, strFromU8 } = requireApi('fflate');
const snapshot = { meta: { version: 2 }, businessData: { Product: [{ name: 'Test' }] } };
const make = (config) => new BackupDeliveryService({ get: (key, fallback) => config[key] ?? fallback }, { createBackup: async () => snapshot });
const drive = { BACKUP_MODE: 'cloud', BACKUP_DRIVE_CLIENT_ID: 'client', BACKUP_DRIVE_CLIENT_SECRET: 'secret', BACKUP_DRIVE_REFRESH_TOKEN: 'refresh', BACKUP_DRIVE_FOLDER_ID: 'folder' };
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
