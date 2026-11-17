const assert = require('node:assert/strict');
const { randomUUID, createHash } = require('node:crypto');

module.exports = async function deliveryChecks({ request, check, owner, cashier, otherOwner, developer, database, tenants, mongoose }) {
  await check('business packages reject mismatched tenants and scope provisioned administrator grants', async () => {
    const features = { pos: false, inventory: true, reports: true, customers: true, installments: true, barcodes: false };
    const plan = await request('/developer/plans', developer, { name: 'Electronics delivery package', domainType: 'electronics', price: 100, billingInterval: 'monthly', features });
    assert.equal(plan.status, 201, JSON.stringify(plan.data));
    assert.equal((await request(`/developer/businesses/${tenants[0]._id}/plan`, developer, { subscriptionPlanId: plan.data._id }, 'PATCH')).status, 400);
    const business = await request('/developer/businesses', developer, { name: 'Isolated Electronics', domainType: 'electronics', ownerName: 'Fixture owner', ownerEmail: 'delivery-owner@spec.test', ownerPhone: '03001234567', ownerPassword: 'test-password-123', initialPlanId: plan.data._id,
      accounts: [{ name: 'Fixture manager', email: 'delivery-admin@spec.test', password: 'test-password-123', role: 'admin' }] });
    assert.equal(business.status, 201, JSON.stringify(business.data));
    const manager = await database.collection('users').findOne({ email: 'delivery-admin@spec.test' });
    assert.equal(String(manager.tenantId), business.data.businessId);
    assert.ok(manager.moduleRights.includes('installments')); assert.ok(manager.moduleRights.includes('products'));
    assert.ok(!manager.moduleRights.includes('pos')); assert.ok(!manager.moduleRights.includes('barcode-generator'));
    assert.equal((await request(`/developer/plans/${plan.data._id}`, developer, { domainType: 'retail' }, 'PATCH')).status, 409);
  });

  await check('print settings accept supported physical sizes and reject unbounded custom dimensions', async () => {
    for (const paperSize of ['A4', 'A5', 'A6', '80mm', '58mm', 'custom']) {
      const updated = await request('/tenant/me', owner, { invoicePrintSettings: { paperSize, widthMm: 120, heightMm: 180, stamp: 'SAMPLE', watermark: 'TEST', footerText: 'Test footer' } }, 'PATCH');
      assert.equal(updated.status, 200, JSON.stringify(updated.data)); assert.equal(updated.data.invoicePrintSettings.paperSize, paperSize);
    }
    for (const settings of [{ paperSize: 'invented' }, { widthMm: 0 }, { widthMm: 421 }, { heightMm: 1001 }, { stamp: 'x'.repeat(81) }]) assert.equal((await request('/tenant/me', owner, { invoicePrintSettings: settings }, 'PATCH')).status, 400);
    assert.equal((await request('/tenant/me', cashier, { invoicePrintSettings: { paperSize: 'A4' } }, 'PATCH')).status, 403);
  });
  await check('manifest startup is idempotent and disabled modules deny execution', async () => {
    const { ModuleRegistryService } = require('../apps/api/dist/modules/super-admin/module-registry.service');
    const { PlatformModuleSchema } = require('../apps/api/dist/modules/super-admin/schemas/platform-module.schema');
    const model = database.model('DeliveryPlatformModule', PlatformModuleSchema, 'platformmodules');
    const registry = new ModuleRegistryService(model);
    const before = await request('/developer/modules', developer);
    assert.equal(before.status, 200);
    const pos = before.data.find((m) => m.key === 'pos');
    assert.ok(pos.submodules.some((m) => m.key === 'pos.invoices'));
    assert.equal(before.data.find((m) => m.key === 'ai-chatbot').executable, false);
    assert.equal((await request(`/developer/modules/${pos._id}`, developer, { isActive: false }, 'PATCH')).status, 200);
    await Promise.all([registry.onModuleInit(), registry.onModuleInit()]);
    assert.equal(await model.countDocuments({ key: 'pos' }), 1);
    assert.equal((await model.findOne({ key: 'pos' })).isActive, false);
    assert.equal((await request('/orders', owner)).status, 403);
    assert.equal((await request(`/developer/modules/${pos._id}`, developer, { isActive: true }, 'PATCH')).status, 200);
    assert.equal((await request('/orders', owner)).status, 200);
    assert.equal((await request(`/developer/modules/${pos._id}`, developer, { releaseState: 'active', installed: true }, 'PATCH')).status, 400);
    const planned = await request('/developer/modules', developer, { key: 'future-test', label: 'Future test' });
    assert.equal(planned.status, 201);
    const features = await request('/developer/features', developer);
    assert.ok(!features.data.some((f) => f.key === 'future-test'));
  });

  await check('all accounts have support; business export is permission-gated and tenant-isolated', async () => {
    const support = await request('/support', cashier);
    assert.equal(support.status, 200); assert.equal(support.data.entitlements.backup, true); assert.equal(support.data.backup.canExport, false);
    assert.equal((await request('/support/backup', cashier)).status, 403);
    const response = await request('/support/backup', owner); assert.equal(response.status, 200);
    const backup = response.data;
    assert.equal(createHash('sha256').update(backup.payload).digest('hex'), backup.sha256);
    assert.ok(!/passwordHash|pinHash|refreshToken|recoverychallenges/.test(backup.payload));
    const decoded = mongoose.mongo.BSON.EJSON.parse(backup.payload);
    for (const [name, rows] of Object.entries(decoded.collections)) for (const row of rows) {
      assert.equal(String(name === 'tenants' ? row._id : row.tenantId), String(tenants[0]._id));
    }
    // Restore ONLY into a newly generated sibling of this disposable test database; never a supplied database name.
    const restoreName = `${database.name}_restore`;
    assert.match(restoreName, /^pos_spec_test_\d+_[a-f0-9]{8}_restore$/);
    const restored = await mongoose.createConnection(`mongodb://127.0.0.1:27017/${restoreName}`).asPromise();
    try {
      assert.equal((await restored.db.listCollections().toArray()).length, 0);
      for (const [name, rows] of Object.entries(decoded.collections)) if (rows.length) {
        await restored.collection(name).insertMany(rows);
        assert.equal(await restored.collection(name).countDocuments(), rows.length);
        const actual = await restored.collection(name).find().sort({ _id: 1 }).toArray();
        const expected = [...rows].sort((a, b) => String(a._id).localeCompare(String(b._id)));
        assert.equal(mongoose.mongo.BSON.EJSON.stringify(actual), mongoose.mongo.BSON.EJSON.stringify(expected));
      }
    } finally {
      assert.equal(restored.name, restoreName);
      await restored.dropDatabase(); await restored.close();
    }
  });

  await check('independent installment payments prevent overpayment, races, replay changes and tenant IDOR', async () => {
    const customer = await request('/customers', owner, { name: 'Delivery test customer', phone: '03001234567' });
    assert.equal(customer.status, 201, JSON.stringify(customer.data));
    const product = await request('/installments/products', owner, { name: 'Delivery test appliance', actualPrice: 100, defaultCommissionRate: 10 });
    assert.equal(product.status, 201, JSON.stringify(product.data));
    const sale = await request('/installments/sales', owner, { customerId: customer.data._id, installmentProductId: product.data._id, advancePayment: 10, installmentDuration: 3, saleDate: '2026-01-31' });
    assert.equal(sale.status, 201, JSON.stringify(sale.data));
    assert.equal(sale.data.schedule[0].dueDate, '2026-02-28');
    assert.equal(sale.data.outstandingBalance, 99); assert.equal(sale.data.payments.length, 1);
    const endpoint = `/installments/sales/${sale.data._id}/payments`;
    const body = { amount: 30.01, mode: 'cash', idempotencyKey: randomUUID() };
    assert.equal((await request(endpoint, otherOwner, body)).status, 404);
    assert.equal((await request(endpoint, owner, { ...body, amount: 100 })).status, 400);
    const responses = await Promise.all(Array.from({ length: 6 }, () => request(endpoint, owner, body)));
    assert.ok(responses.every((r) => r.status === 201), JSON.stringify(responses));
    const replay = await request(endpoint, owner, body);
    assert.equal(replay.data.payments.length, 2); assert.equal(replay.data.totalPaid, 40.01); assert.equal(replay.data.outstandingBalance, 68.99);
    assert.equal(replay.data.payments[1].receivedBy.length, 24);
    assert.equal((await request(endpoint, owner, { ...body, amount: 1 })).status, 409);
    assert.equal((await request(endpoint, owner, { ...body, installmentId: 'foreign-row' })).status, 409);
    const races = await Promise.all(Array.from({ length: 4 }, () => request(endpoint, owner, { amount: 50, mode: 'cash', idempotencyKey: randomUUID() })));
    assert.equal(races.filter((r) => r.status === 201).length, 1);
    assert.ok(races.every((r) => [201, 400, 409].includes(r.status)));
    const final = await request(`/installments/sales/${sale.data._id}`, owner);
    assert.equal(final.data.totalPaid, 90.01); assert.equal(final.data.outstandingBalance, 18.99); assert.equal(final.data.payments.length, 3);
  });
};
