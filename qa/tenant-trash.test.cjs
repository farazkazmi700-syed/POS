const assert = require('node:assert/strict');
const { test } = require('node:test');
const { Types } = require('../app/api/node_modules/mongoose');
const { TenantTrashService } = require('../app/api/dist/modules/developer/tenant-trash.service');

const id = '507f1f77bcf86cd799439011';
const actor = { userId: '507f1f77bcf86cd799439012', tenantId: '507f1f77bcf86cd799439013', email: 'demo@example.test' };
const now = new Date('2026-11-26T08:00:00Z');
const purgeAt = new Date('2026-12-26T08:00:00Z');

function setup({ invoiceError = false } = {}) {
  const calls = [];
  let tenant = { _id: new Types.ObjectId(id), name: 'Fixture Business', status: 'suspended' };
  const matches = (filter) => {
    if (!tenant) return false;
    if (filter.trashedAt === null && tenant.trashedAt) return false;
    if (filter.trashedAt?.$ne === null && !tenant.trashedAt) return false;
    if (filter.purgeAt?.$gt && !(tenant.purgeAt > filter.purgeAt.$gt)) return false;
    if (filter.purgeAt?.$lte && !(tenant.purgeAt <= filter.purgeAt.$lte)) return false;
    if (filter.purgeStartedAt === null && tenant.purgeStartedAt) return false;
    return !filter.purgeLeaseUntil || tenant.purgeLeaseUntil === filter.purgeLeaseUntil;
  };
  const applyUpdate = (update) => {
    Object.assign(tenant, update.$set);
    for (const key of Object.keys(update.$unset ?? {})) delete tenant[key];
  };
  const tenants = {
    async findOne(filter) { return matches(filter) ? { ...tenant } : null; },
    async updateOne(filter, update) {
      if (!matches(filter)) return { modifiedCount: 0 };
      applyUpdate(update);
      return { modifiedCount: 1 };
    },
    async findOneAndUpdate(filter, update) {
      if (!matches(filter) || tenant.purgeLeaseUntil > filter.purgeAt.$lte) return null;
      applyUpdate(update);
      return { ...tenant };
    },
    async deleteOne(filter) {
      assert.ok(matches(filter));
      calls.push({ collection: 'tenants', filter });
      tenant = null;
    },
  };
  const db = {
    collection(name) {
      if (name === 'tenants') return tenants;
      return {
        findOne: async () => null,
        find: async function* () { yield { _id: new Types.ObjectId('507f1f77bcf86cd799439014') }; },
        insertOne: async () => {},
        deleteOne: async (filter) => { calls.push({ collection: name, filter }); },
        deleteMany: async (filter) => { calls.push({ collection: name, filter }); },
      };
    },
  };
  const invoices = { purgeTenantInvoices: async (tenantId) => {
    assert.equal(tenantId, id);
    calls.push({ collection: 'invoices' });
    if (invoiceError) throw new Error('fixture cleanup error');
  } };
  const service = new TenantTrashService({ db }, { get: () => undefined }, invoices);
  return { service, calls, tenant: () => tenant };
}

test('requires confirmation, checks the exact name and protects the developer tenant', async () => {
  const { service, tenant } = setup();
  await assert.rejects(service.trash(id, 'Fixture Business', false, actor, now), /Confirm/);
  await assert.rejects(service.trash(id, 'Wrong', true, actor, now), /exact business name/);
  await assert.rejects(service.trash(id, 'Fixture Business', true, { ...actor, tenantId: id }, now), /own business/);
  assert.equal(tenant().trashedAt, undefined);
});

test('restores the original suspended status within the 30-day window', async () => {
  const { service, tenant } = setup();
  await service.trash(id, 'Fixture Business', true, actor, now);
  assert.deepEqual(tenant().purgeAt, purgeAt);
  const result = await service.restore(id, actor, new Date(purgeAt.getTime() - 1));
  assert.equal(result.status, 'suspended');
  assert.equal(tenant().trashedAt, undefined);
});

test('purges only at the expiry boundary and deletes invoice data before tenant records', async () => {
  const { service, tenant, calls } = setup();
  await service.trash(id, 'Fixture Business', true, actor, now);
  await service.sweep(new Date(purgeAt.getTime() - 1));
  assert.equal(calls.length, 0);
  await assert.rejects(service.restore(id, actor, purgeAt), /no longer be restored/);
  await service.sweep(purgeAt);
  assert.equal(calls[0].collection, 'invoices');
  assert.equal(calls.at(-1).collection, 'tenants');
  assert.equal(String(calls.find((call) => call.collection === 'orders').filter.tenantId), id);
  assert.equal(tenant(), null);
});

test('failed invoice cleanup keeps the expired tenant and its database records for retry', async () => {
  const { service, tenant, calls } = setup({ invoiceError: true });
  await service.trash(id, 'Fixture Business', true, actor, now);
  await service.sweep(purgeAt);
  await service.sweep(new Date(purgeAt.getTime() + 60_000));
  assert.deepEqual(calls.map((call) => call.collection), ['invoices']);
  assert.ok(tenant().purgeStartedAt);
  assert.match(tenant().purgeError, /retry/);
});
