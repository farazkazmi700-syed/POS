/**
 * invoice.service.spec.ts
 *
 * Tests the InvoiceService.enqueue() business logic in isolation.
 * We avoid loading NestJS decorators (which are pure ESM in NestJS 12) by
 * mocking the entire '@nestjs/bullmq' and '@nestjs/common' modules before
 * any imports, using Jest's manual factory hoisting.
 *
 * The service itself is loaded via a dynamic import AFTER the mocks are set up.
 */

jest.mock('@nestjs/bullmq', () => ({ InjectQueue: () => () => undefined }));
jest.mock('@nestjs/common', () => ({
  Injectable: () => () => undefined,
  Logger: class { error() {} warn() {} log() {} },
  NotFoundException: class extends Error { constructor(msg: string) { super(msg); } },
}));
jest.mock('@nestjs/config', () => ({ ConfigService: class {} }));
jest.mock('@nestjs/mongoose', () => {
  const schemaObj = { plugin: () => schemaObj, index: () => schemaObj, pre: () => schemaObj, post: () => schemaObj };
  return {
    InjectModel: () => () => undefined,
    Prop: () => () => undefined,
    Schema: () => () => undefined,
    SchemaFactory: { createForClass: () => ({ ...schemaObj }) },
  };
});

import { InvoiceService } from './invoice.service';

describe('invoice queue snapshot', () => {
  it('includes saved customer, guarantor, serials and payment history without reading mutable customer/product records', async () => {
    const service = Object.create(InvoiceService.prototype) as InvoiceService;

    const plan = {
      cashTotal: 100,
      downPayment: 10,
      markupAmount: 0,
      markupPercent: 0,
      months: 3,
      totalPayable: 100,
      paidTotal: 40,
      balance: 60,
      invoiceNo: 'AGR-1',
      status: 'active' as const,
      monthlyAmount: 30,
      firstDueDate: '2099-01-01',
      schedule: [] as [],
      financedAmount: 90,
      customerName: 'Saved buyer',
      customerPhone: '03001234567',
      customerCnic: '12345-1234567-1',
      customerAddress: 'Saved address',
      guarantor: { name: 'Saved guarantor', phone: '03007654321', cnic: '54321-1234567-1', address: 'Guarantor address' },
      payments: [{ receiptNo: 'REC-1', amount: 30, paidAt: new Date('2026-11-17T12:00:00Z'), mode: 'cash', receivedBy: 'Cashier', note: 'Payment' }],
    };

    // Wire up mock dependencies directly on the service instance
    (service as any).state = {};
    (service as any).tenants = { findById: jest.fn().mockResolvedValue({ id: 'tenant-1', name: 'Shop', currency: 'PKR', timeZone: 'Asia/Karachi' }) };
    (service as any).plans = { findOne: jest.fn().mockResolvedValue(plan) };
    (service as any).queue = { add: jest.fn().mockResolvedValue({}) };

    const order = {
      id: 'order-1',
      _id: 'order-1',
      tenantId: 'tenant-1',
      invoiceNo: 'INV-1',
      paymentMode: 'installment',
      cashierName: 'Cashier',
      createdAt: new Date('2026-11-17T12:00:00Z'),
      customer: undefined,
      payments: undefined,
      items: [{ productId: 'product-1', name: 'Phone', serialNo: 'IMEI-123', qty: 1, unitPrice: 100, lineTotal: 100,
        discountPercent: 0, discountAmount: 0, taxPercent: 0, taxAmount: 0 }],
      subtotal: 100, discountTotal: 0, taxableTotal: 100, taxTotal: 0,
      charges: [], chargesTotal: 0, grandTotal: 100, taxBreakdown: [],
    };

    await service.enqueue(order as any);

    expect((service as any).plans.findOne).toHaveBeenCalledWith({ tenantId: 'tenant-1', orderId: 'order-1' });

    const payload = (service as any).queue.add.mock.calls[0][1];

    // Items snapshot — includes productId and serialNo from the order at time of sale
    expect(payload.items[0]).toMatchObject({ productId: 'product-1', serialNo: 'IMEI-123' });

    // Installment snapshot — uses plan values, not live customer record
    expect(payload.installment).toMatchObject({
      remaining: 60,
      firstDueDate: '2099-01-01',
      monthlyAmount: 30,
      customer: { name: 'Saved buyer', cnic: plan.customerCnic, address: 'Saved address' },
      guarantor: plan.guarantor,
      payments: [{ ...plan.payments[0], paidAt: '2026-11-17T12:00:00.000Z' }],
    });
  });
});
