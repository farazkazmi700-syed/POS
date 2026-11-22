const { test } = require('node:test');
const assert = require('node:assert/strict');
const { InvoiceService } = require('../app/api/dist/modules/invoice/invoice.service');
test('includes saved customer, guarantor, serials and payment history without reading mutable customer/product records', async () => {
    const service = Object.create(InvoiceService.prototype);
    const plan = {
      cashTotal: 100, downPayment: 10, markupAmount: 0, markupPercent: 0, months: 3,
      totalPayable: 100, paidTotal: 40, balance: 60, invoiceNo: 'AGR-1', status: 'active',
      monthlyAmount: 30, firstDueDate: '2099-01-01', schedule: [],
      customerName: 'Saved buyer', customerPhone: '03001234567', customerCnic: '12345-1234567-1', customerAddress: 'Saved address',
      guarantor: { name: 'Saved guarantor', phone: '03007654321', cnic: '54321-1234567-1', address: 'Guarantor address' },
      payments: [{ receiptNo: 'REC-1', amount: 30, paidAt: new Date('2026-11-17T12:00:00Z'), mode: 'cash', receivedBy: 'Cashier', note: 'Payment' }],
    };
    service.state = {};
    service.tenants = { findById: async () => ({ id: 'tenant-1', name: 'Shop', currency: 'PKR' }) };
    service.plans = { findOne: async (filter) => { assert.deepEqual(filter, { tenantId: 'tenant-1', orderId: 'order-1' }); return plan; } };
    service.queue = { add: async (_name, data) => { service.payload = data; } };
    const order = {
      id: 'order-1', _id: 'order-1', tenantId: 'tenant-1', invoiceNo: 'INV-1', paymentMode: 'installment',
      cashierName: 'Cashier', createdAt: new Date('2026-11-17T12:00:00Z'),
      items: [{ productId: 'product-1', name: 'Phone', serialNo: 'IMEI-123', qty: 1, unitPrice: 100, lineTotal: 100 }],
      subtotal: 100, discountTotal: 0, taxableTotal: 100, taxTotal: 0, charges: [], chargesTotal: 0, grandTotal: 100, taxBreakdown: [],
    };
    await service.enqueue(order);
    const payload = service.payload;
    assert.equal(payload.items[0].productId, 'product-1');
    assert.equal(payload.items[0].serialNo, 'IMEI-123');
    assert.equal(payload.installment.remaining, 60);
    assert.equal(payload.installment.customer.cnic, plan.customerCnic);
    assert.equal(payload.installment.customer.address, plan.customerAddress);
    assert.deepEqual(payload.installment.guarantor, plan.guarantor);
    assert.deepEqual(payload.installment.payments, [{ ...plan.payments[0], paidAt: '2026-11-17T12:00:00.000Z' }]);
});
