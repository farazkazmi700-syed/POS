import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import worker from './worker.mjs';

const business = '507f1f77bcf86cd799439011';
// ZIP end-of-central-directory record for an empty archive.
const zip = Uint8Array.of(0x50, 0x4b, 0x05, 0x06, ...new Uint8Array(18));
const digest = createHash('sha256').update(zip).digest('hex');
const url = 'https://snapshot.example.test/v1/business-snapshot';

function setup() {
  const sqlite = new DatabaseSync(':memory:');
  for (const migration of ['0001_snapshots.sql', '0002_encrypted_snapshots.sql']) {
    sqlite.exec(readFileSync(new URL(`./migrations/${migration}`, import.meta.url), 'utf8'));
  }
  const env = {
    BUSINESS_ID: business,
    DATA_SYNC_TOKEN: 'a'.repeat(64),
    DATA_SYNC_ENCRYPTION_KEY: 'b'.repeat(64),
    SNAPSHOTS: {
      prepare(sql) {
        const statement = sqlite.prepare(sql);
        return { bind: (...args) => ({
          run: async () => ({ meta: statement.run(...args.map((arg) => arg instanceof ArrayBuffer ? new Uint8Array(arg) : arg)) }),
          first: () => statement.get(...args),
        }) };
      },
      async batch(statements) {
        sqlite.exec('BEGIN');
        try {
          const result = [];
          for (const statement of statements) result.push(await statement.run());
          sqlite.exec('COMMIT');
          return result;
        } catch (error) {
          sqlite.exec('ROLLBACK');
          throw error;
        }
      },
    },
  };
  function request(method, headers = {}, body) {
    return worker.fetch(new Request(url, {
      method,
      headers: { Authorization: `Bearer ${env.DATA_SYNC_TOKEN}`, 'X-Business-Id': business, ...headers },
      body,
    }), env);
  }
  const upload = (hash = digest) => request('POST', { 'Content-Type': 'application/zip', 'X-Snapshot-SHA256': hash }, zip);
  return { sqlite, env, upload, request };
}

test('encrypts snapshots at rest and returns the original ZIP with its verified checksum', async () => {
  const { sqlite, upload, request } = setup();
  const response = await upload();
  assert.equal(response.status, 201);
  assert.equal(response.headers.get('X-Snapshot-SHA256'), digest);
  assert.equal(sqlite.prepare('SELECT encrypted FROM snapshots').get().encrypted, 1);
  assert.notDeepEqual(sqlite.prepare('SELECT content FROM snapshot_chunks').get().content, zip);

  const download = await request('GET');
  assert.equal(download.headers.get('X-Snapshot-SHA256'), digest);
  assert.deepEqual(new Uint8Array(await download.arrayBuffer()), zip);
  assert.equal((await request('GET', { 'X-Business-Id': '507f1f77bcf86cd799439012' })).status, 403);
});

test('rejects a bad checksum without replacing the current snapshot', async () => {
  const { sqlite, upload } = setup();
  const original = await (await upload()).json();
  assert.equal((await upload('0'.repeat(64))).status, 400);
  assert.equal(sqlite.prepare('SELECT snapshot_id FROM current_snapshots').get().snapshot_id, original.id);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM snapshots').get().count, 1);
});

test('rejects writes without an independent key and fails closed on tampered ciphertext', async () => {
  const { sqlite, env, upload, request } = setup();
  const key = env.DATA_SYNC_ENCRYPTION_KEY;
  env.DATA_SYNC_ENCRYPTION_KEY = env.DATA_SYNC_TOKEN;
  assert.equal((await upload()).status, 503);
  env.DATA_SYNC_ENCRYPTION_KEY = key;
  assert.equal((await upload()).status, 201);
  const { content } = sqlite.prepare('SELECT content FROM snapshot_chunks').get();
  content[content.length - 1] ^= 1;
  sqlite.prepare('UPDATE snapshot_chunks SET content = ?').run(content);
  const download = await request('GET');
  await assert.rejects(download.arrayBuffer());
});

test('keeps existing unencrypted snapshots accessible during upgrade', async () => {
  const { sqlite, request } = setup();
  const id = 'legacy-snapshot';
  sqlite.prepare('INSERT INTO snapshots (id, business_id, started_at, byte_count, sha256) VALUES (?, ?, ?, ?, ?)')
    .run(id, business, 1, zip.length, digest);
  sqlite.prepare('INSERT INTO snapshot_chunks VALUES (?, ?, ?)').run(id, 0, zip);
  sqlite.prepare('INSERT INTO current_snapshots VALUES (?, ?, ?)').run(business, id, 1);
  assert.deepEqual(new Uint8Array(await (await request('GET')).arrayBuffer()), zip);
});
