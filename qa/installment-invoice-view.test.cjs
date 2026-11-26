const { test } = require('node:test');
const assert = require('node:assert/strict');
const { InstallmentService } = require('../app/api/dist/modules/installment/installment.service.js');

test('installment invoice preserves plain plan fields and computes remaining balance', async () => {
  const service = Object.create(InstallmentService.prototype);
  const plan = { invoiceNo: 'TEST-1', paidTotal: 25, totalPayable: 100, overdueAmount: 10, overdueCount: 1, nextDue: null };
  service.findOne = async (tenant, id) => {
    assert.equal(tenant, 'tenant'); assert.equal(id, 'plan'); return plan;
  };
  assert.deepEqual(await service.invoiceView('tenant', 'plan'), {
    ...plan, remainingBalance: 75, isFullyPaid: false, paidPercent: 25,
  });
});

test('collections forecast combines tenant-scoped POS and standalone schedules', async () => {
  const service = Object.create(InstallmentService.prototype);
  const tenantId = '507f1f77bcf86cd799439011';
  const filters = [];
  const scheduled = (rows) => ({
    find(filter) {
      filters.push(filter);
      return {
        select() { return this; },
        lean() { return this; },
        async *cursor() { yield { schedule: rows }; },
      };
    },
  });
  service.tz = 'UTC';
  service.model = scheduled([
    { dueDate: '2025-01-01', amount: 100, paidAmount: 40, status: 'partial' },
    { dueDate: '2025-01-01', amount: 20, paidAmount: 20, status: 'paid' },
  ]);
  service.saleModel = scheduled([
    { dueDate: '2025-01-01', expectedAmount: 30.75, amountPaid: 0.25, status: 'overdue' },
    { dueDate: '2025-01-01', expectedAmount: 99, amountPaid: 0, status: 'cancelled' },
  ]);
  const result = await service.collectionForecast(tenantId);
  assert.deepEqual(filters.map((filter) => String(filter.tenantId)), [tenantId, tenantId]);
  assert.equal(filters[0].status, 'active');
  assert.deepEqual(filters[1].saleStatus, { $in: ['active', 'overdue'] });
  assert.deepEqual(result.overdue, { amount: 90.5, count: 2 });
  assert.ok(result.periods.every((period) => period.count === 0 && period.amount === 0));
});
