const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { randomBytes, randomUUID } = require('node:crypto');
const fs = require('node:fs');
const https = require('node:https');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { createLanGateway, privateIPv4 } = require('../deploy/scripts/lan-gateway.cjs');

const image = process.env.SPEC_LAN_POS_IMAGE;
const script = path.resolve(__dirname, '../deploy/scripts/backup/pos-encrypted-backup.cjs');
const mountPaths = { pgdata: '/var/lib/postgresql/data', uploads: '/data/invoices', queue: '/data/redis' };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

function docker(...args) {
  return execFileSync('docker', args, { encoding: 'utf8', timeout: 120_000, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function archive(...args) {
  return execFileSync(process.execPath, [script, ...args], { encoding: 'utf8', timeout: 120_000, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
}

async function ready(container) {
  const port = Number(docker('port', container, '8080/tcp').split(':').at(-1));
  for (let i = 0; i < 45; i++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(2000) });
      if (response.ok) { await response.body.cancel(); return port; }
    } catch {}
    await pause(1000);
  }
  throw new Error('Isolated POS container did not become ready.');
}

test('authorized TLS access, concurrent sales, restart, and encrypted restore', { skip: !image, timeout: 360_000 }, async () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'pos-lan-rehearsal-'));
  const storage = fs.mkdtempSync(path.join(os.tmpdir(), 'pos-lan-archive-'));
  const identifier = randomBytes(5).toString('hex');
  const source = 'pos-lan-test-' + identifier;
  const restored = source + '-restored';
  const prefix = 'pos-restore-rehearsal-' + identifier;
  const originalVolumes = Object.fromEntries(Object.keys(mountPaths).map(key => [key, source + '-' + key]));
  const restoredVolumes = Object.fromEntries(Object.keys(mountPaths).map(key => [key, prefix + '-' + key]));
  const keyPath = path.join(scratch, 'backup.key');
  const target = path.join(storage, 'backup.kzpos');
  const password = 'test-password-123';
  const born = [];
  const servers = [];

  function start(name, volumes) {
    const vars = [
      'PORT=3000', 'POS_SERVE=true', 'CORS_ORIGIN=https://localhost:8080',
      'PASSWORD_RESET_BASE_URL=https://localhost:8080/reset-password',
      'JWT_ACCESS_SECRET=' + randomBytes(32).toString('hex'),
      'JWT_REFRESH_SECRET=' + randomBytes(32).toString('hex'),
    ];
    docker('run', '-d', '--name', name, '-p', '127.0.0.1::8080',
      ...vars.flatMap(value => ['-e', value]),
      ...Object.entries(mountPaths).flatMap(([key, destination]) => [
        '--mount', `type=volume,src=${volumes[key]},dst=${destination}`,
      ]), image);
    born.push(name);
    const ports = docker('port', name);
    assert.match(ports, /^8080\/tcp -> 127\.0\.0\.1:\d+$/);
  }

  let cert;
  let tlsKey;
  async function client(upstreamPort, allowedClients = ['127.0.0.1']) {
    const gateway = createLanGateway({ key: tlsKey, cert, authority: 'localhost:8080', allowedClients, upstreamPort });
    await listen(gateway);
    servers.push(gateway);
    return (route, token, params, extras = {}) => new Promise((resolve, reject) => {
      const request = https.request({
        hostname: '127.0.0.1', port: gateway.address().port, servername: 'localhost', ca: cert,
        path: '/api' + route, method: params === undefined ? 'GET' : 'POST',
        headers: { Host: 'localhost:8080', ...(token ? { Authorization: 'Bearer ' + token } : {}),
          ...(params === undefined ? {} : { 'Content-Type': 'application/json' }), ...extras },
      }, response => {
        const pieces = [];
        response.on('data', data => pieces.push(data));
        response.on('error', reject);
        response.on('end', () => {
          const bytes = Buffer.concat(pieces);
          const json = response.headers['content-type']?.startsWith('application/json') && bytes.length ? JSON.parse(bytes) : null;
          resolve({ status: response.statusCode, headers: response.headers, json, bytes });
        });
      });
      request.setTimeout(30_000, () => request.destroy(new Error('LAN request timed out')));
      request.on('error', reject);
      request.end(params === undefined ? undefined : JSON.stringify(params));
    });
  }

  async function login(api, role) {
    let result = await api('/auth/login', null, { email: role + '@lan.spec.test', password });
    assert.equal(result.status, 201, JSON.stringify(result.json));
    if (result.json.requiresPin) result = await api('/auth/login/pin', null, { challengeToken: result.json.challengeToken, pin: '1234' });
    assert.equal(result.status, 201, JSON.stringify(result.json));
    return result.json.accessToken;
  }

  try {
    assert.equal(privateIPv4('192.168.1.9'), true);
    for (const value of ['127.0.0.1', '0.0.0.0', '8.8.8.8', '::1']) assert.equal(privateIPv4(value), false);
    docker('run', '--rm', '--network', 'none', '--mount', 'type=bind,src=' + scratch + ',dst=/fixtures',
      '--entrypoint', 'openssl', image, 'req', '-x509', '-newkey', 'rsa:2048', '-sha256', '-nodes',
      '-days', '1', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost',
      '-keyout', '/fixtures/lan.key', '-out', '/fixtures/lan.crt');
    cert = fs.readFileSync(path.join(scratch, 'lan.crt'));
    tlsKey = fs.readFileSync(path.join(scratch, 'lan.key'));

    start(source, originalVolumes);
    const port = await ready(source);
    const api = await client(port);
    const denied = await client(port, ['127.0.0.2']);
    assert.equal((await denied('/health', null, undefined, { 'X-Forwarded-For': '127.0.0.2' })).status, 403);
    assert.equal((await api('/health', null, undefined, { Host: 'untrusted.test:8080' })).status, 403);
    assert.equal((await api('/health')).status, 200);
    assert.match((await api('/health')).headers['content-security-policy'], /script-src 'self'/);
    assert.equal((await api('/products')).status, 401);

    docker('exec', '--user', 'node', '--workdir', '/app/api', source, 'node', '-e', `
      const fs = require('node:fs');
      const mongoose = require('mongoose');
      const bcrypt = require('bcryptjs');
      (async () => {
        const db = await mongoose.createConnection(fs.readFileSync('/run/pos/app-uri', 'utf8')).asPromise();
        const tenantId = new mongoose.Types.ObjectId();
        await db.collection('tenants').insertOne({ _id: tenantId, name: 'LAN rehearsal', currency: 'PKR',
          domainType: 'retail', status: 'active', featureFlags: { pos: true, inventory: true, barcodes: true, customers: true, settings: true },
          taxProfile: { gstPercent: 0, reducedGstPercent: 0, serviceChargePercent: 0, otherCharges: [] }, invoicePrefix: 'LAN' });
        for (const role of ['owner','cashier']) await db.collection('users').insertOne({
          tenantId, name: role, role, email: role + '@lan.spec.test',
          passwordHash: await bcrypt.hash(${JSON.stringify(password)}, 4), pinHash: await bcrypt.hash('1234', 4),
          isActive: true, superAdmin: false, pinVersion: 0, sessionVersion: 0, pinRequiresChange: false, branchIds: [],
        });
        await db.close();
      })().catch(() => process.exit(1));
    `);
    // The local database provisioner discovers new businesses on a short interval.
    await pause(4000);
    const owner = await login(api, 'owner');
    const cashier = await login(api, 'cashier');
    assert.equal((await api('/products', cashier, { name: 'Denied', price: 1 })).status, 403);
    const product = await api('/products', owner, { name: 'Local item', sku: 'LAN-1', price: 20, stockQty: 2, taxClass: 'exempt' });
    assert.equal(product.status, 201, JSON.stringify(product.json));
    const barcode = await api('/barcodes/generate', owner, { format: 'CODE128', productId: product.json._id });
    assert.equal(barcode.status, 201, JSON.stringify(barcode.json));
    assert.match(barcode.json.svg, /<svg/);

    const checkout = { idempotencyKey: randomUUID(), items: [{ productId: product.json._id, qty: 2 }], paymentMode: 'cash' };
    const attempts = await Promise.all(Array.from({ length: 5 }, () => api('/orders', cashier, checkout)));
    assert.ok(attempts.every(result => [201, 409].includes(result.status)), JSON.stringify(attempts.map(r => [r.status, r.json?.message])));
    const replay = await api('/orders', cashier, checkout);
    assert.equal(replay.status, 201, JSON.stringify(replay.json));
    const orderId = replay.json._id;
    assert.equal((await api('/products/' + product.json._id, owner)).json.stockQty, 0);
    assert.equal((await api('/orders', cashier, { ...checkout, idempotencyKey: randomUUID() })).status, 409);
    assert.equal((await api('/orders/' + orderId + '/refund', cashier, { reason: 'Denied' })).status, 403);

    for (let i = 0; i < 30; i++) {
      if ((await api('/orders/' + orderId + '/invoice', owner)).json?.status === 'ready') break;
      await pause(1000);
    }
    const pdf = await api('/orders/' + orderId + '/invoice/pdf', owner);
    assert.equal(pdf.status, 200);
    assert.equal(pdf.bytes.subarray(0, 5).toString(), '%PDF-');
    assert.equal((await api('/auth/logout', cashier, {})).status, 201);
    assert.equal((await api('/auth/me', cashier)).status, 401);

    docker('restart', '-t', '90', source);
    const restarted = await client(await ready(source));
    const restartedOwner = await login(restarted, 'owner');
    assert.equal((await restarted('/orders/' + orderId, restartedOwner)).status, 200);
    assert.equal((await restarted('/auth/me', cashier)).status, 401);

    archive('keygen', keyPath);
    assert.throws(() => archive('backup', source, target, keyPath), /Stop the POS container/);
    docker('stop', '-t', '90', source);
    archive('backup', source, target, keyPath);
    const wrongKey = path.join(scratch, 'wrong.key');
    archive('keygen', wrongKey);
    assert.throws(() => archive('restore', target, wrongKey, prefix), /authentication failed/);
    assert.equal(docker('volume', 'ls', '-q', '--filter', 'name=' + prefix), '');
    const result = JSON.parse(archive('restore', target, keyPath, prefix));
    assert.deepEqual(result.volumes, restoredVolumes);
    assert.throws(() => archive('restore', target, keyPath, prefix), /already exists/);

    start(restored, restoredVolumes);
    const restoredApi = await client(await ready(restored));
    assert.equal((await restoredApi('/auth/me', restartedOwner)).status, 401);
    const restoredOwner = await login(restoredApi, 'owner');
    const restoredOrder = await restoredApi('/orders/' + orderId, restoredOwner);
    assert.equal(restoredOrder.json.invoiceNo, replay.json.invoiceNo);
    assert.equal(restoredOrder.json.grandTotal, replay.json.grandTotal);
    assert.equal((await restoredApi('/products/' + product.json._id, restoredOwner)).json.stockQty, 0);
    const restoredPdf = await restoredApi('/orders/' + orderId + '/invoice/pdf', restoredOwner);
    assert.deepEqual(restoredPdf.bytes, pdf.bytes);
  } finally {
    for (const server of servers) server.close();
    for (const container of born.reverse()) try { docker('rm', '-f', '-v', container); } catch {}
    for (const volume of [...Object.values(originalVolumes), ...Object.values(restoredVolumes)]) {
      try { docker('volume', 'rm', volume); } catch {}
    }
    for (const directory of [scratch, storage]) {
      for (const file of fs.readdirSync(directory)) fs.unlinkSync(path.join(directory, file));
      fs.rmdirSync(directory);
    }
  }
});
