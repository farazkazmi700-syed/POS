const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { BSON } = require('mongodb');
const { Client } = require('pg');
const passwordPath = path.resolve(__dirname, '../../storage/postgresql-staging/password');

test('PostgreSQL staging preserves exact BSON, numeric precision and missing/null distinctions', { skip: !fs.existsSync(passwordPath) }, async () => {
  const client = new Client({ host: '127.0.0.1', port: 55432, database: 'postgres', user: 'pos_migration', password: fs.readFileSync(passwordPath, 'utf8').trim(), connectionTimeoutMillis: 10000 });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query('CREATE TEMP TABLE bson_roundtrip (data bytea NOT NULL) ON COMMIT DROP');
    const source = {
      _id: new BSON.ObjectId(),
      money: BSON.Decimal128.fromString('999999999999999999999.123456789'),
      counter: BSON.Long.fromString('9223372036854775807'),
      double: new BSON.Double(0.1),
      integer: new BSON.Int32(42),
      explicitNull: null,
      when: new Date('2026-11-15T01:02:03.456Z'),
      binary: new BSON.Binary(Buffer.from([0, 128, 255])),
      nested: [{ missingSibling: true }],
    };
    const bytes = BSON.serialize(source);
    await client.query('INSERT INTO bson_roundtrip(data) VALUES($1)', [bytes]);
    const result = (await client.query("SELECT data, encode(sha256(data),'hex') AS checksum FROM bson_roundtrip")).rows[0];
    assert.deepEqual(result.data, bytes);
    assert.equal(result.checksum, createHash('sha256').update(bytes).digest('hex'));
    const restored = BSON.deserialize(result.data, { promoteValues: false });
    assert.equal(restored.money.toString(), source.money.toString());
    assert.equal(restored.counter.toString(), source.counter.toString());
    assert.equal(restored.explicitNull, null);
    assert.equal(Object.hasOwn(restored, 'missing'), false);
    assert.equal(restored.when.toISOString(), source.when.toISOString());
    assert.deepEqual(restored.binary.buffer, source.binary.buffer);
  } finally {
    await client.query('ROLLBACK');
    await client.end();
  }
});
