const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ObjectId } = require('mongodb');
const { destination, databaseIdentifier } = require('./routing.cjs');
const tenant = new ObjectId('0123456789abcdef01234567');
const tenants = new Set([tenant.toHexString()]);
test('routes business documents to their own staging database', () => {
  assert.equal(destination('orders', { tenantId: tenant }, tenants, new Map()), 'pos_stage_' + tenant);
  assert.equal(destination('tenants', { _id: tenant }, tenants, new Map()), 'pos_stage_' + tenant);
});
test('rejects unknown business ownership and unknown collections', () => {
  assert.throws(() => destination('orders', { tenantId: new ObjectId() }, tenants, new Map()));
  assert.throws(() => destination('orders', {}, tenants, new Map()));
  assert.throws(() => destination('unknown', { tenantId: tenant }, tenants, new Map()));
});
test('recovery records resolve ownership from users without going to control plane', () => {
  const user = new ObjectId();
  assert.equal(destination('recovery_codes', { userId: user }, tenants, new Map([[user.toHexString(), tenant.toHexString()]])), 'pos_stage_' + tenant);
  assert.throws(() => destination('recovery_codes', { userId: user }, tenants, new Map()));
});
test('rejects arbitrary databases and SQL injection', () => {
  for (const value of ['postgres', 'pos', 'pos_stage_control"; DROP DATABASE pos;', '../pos']) assert.throws(() => databaseIdentifier(value));
  assert.equal(databaseIdentifier('pos_stage_control'), '"pos_stage_control"');
});
