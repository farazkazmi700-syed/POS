const { test } = require('node:test');
const assert = require('node:assert/strict');
const { InstallmentService } = require('../apps/api/dist/modules/installment/installment.service.js');

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
