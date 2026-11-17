import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { renderInvoiceHtml } from './invoice-renderer';
import { InvoiceJobData } from '../types';

const sample: InvoiceJobData = {
  orderId: '665f1c2a9b1e8a0012345678',
  invoiceNo: 'INV-2026-000241',
  createdAt: new Date('2026-10-10T12:15:00Z').toISOString(),
  tenant: {
    id: 't1',
    name: 'Faraz Retail Store',
    address: 'Main Boulevard, Gulberg, Lahore',
    taxRegNo: '1234567-8',
    currency: 'PKR',
    logoUrl: 'data:image/png;base64,aGVsbG8=',
  },
  cashierName: 'Ali Raza',
  customer: { name: 'Walk-in customer', phone: '0300-1234567' },
  paymentMode: 'cash',
  items: [
    { name: 'Wireless mouse', qty: 1, unitPrice: 1800, discountPercent: 5, discountAmount: 90, taxPercent: 18, taxAmount: 307.8, lineTotal: 2017.8 },
  ],
  totals: {
    subtotal: 1800,
    discountTotal: 90,
    taxableTotal: 1710,
    taxTotal: 307.8,
    charges: [],
    chargesTotal: 0,
    grandTotal: 2017.8,
    taxBreakdown: [{ ratePercent: 18, taxableAmount: 1710, taxAmount: 307.8 }],
  },
};

describe('renderInvoiceHtml', () => {
  it('loads the invoice template and renders the receipt HTML with a business logo watermark', async () => {
    const html = await renderInvoiceHtml(sample);
    assert.match(html, /INVOICE/i);
    assert.match(html, /Faraz Retail Store/i);
    assert.match(html, /INV-2026-000241/i);
    assert.match(html, /logo-watermark/i);
    assert.match(html, /data:image\/png;base64,aGVsbG8(?:=|&#x3D;)/i);
  });
  it('does not embed arbitrary network URLs from tenant logos', async () => {
    const html = await renderInvoiceHtml({ ...sample, tenant: { ...sample.tenant, logoUrl: 'http://169.254.169.254/latest/meta-data/' } });
    assert.doesNotMatch(html, /169\.254\.169\.254/);
  });
  it('prints mixed tenders and escapes business-controlled text', async () => {
    const html = await renderInvoiceHtml({ ...sample, tenant: { ...sample.tenant, name: '<script>alert(1)</script>' }, paymentMode: 'mixed', payments: [{ mode: 'cash', amount: 1000 }, { mode: 'card', amount: 1017.8 }] });
    assert.match(html, /1,017\.80/); assert.match(html, /MIXED/); assert.doesNotMatch(html, /<script>alert/);
  });
  it('renders installment buyer and guarantor details from the plan snapshot', async () => {
    const html = await renderInvoiceHtml({
      ...sample,
      paymentMode: 'installment',
      items: [{ ...sample.items[0], name: 'موبائل فون Phone', productId: 'product-1', serialNo: 'IMEI-123456' }],
      customer: undefined,
      installment: {
        cashPrice: 155000,
        downPayment: 15000, principal: 140000, charges: 0, count: 12, frequency: 'monthly',
        totalPayable: 155000, paidToDate: 15000, remaining: 140000, overdue: 0, overdueCount: 0, nextDue: null,
        schedule: [{ no: 1, dueDate: '2026-12-10', amount: 11667, paidAmount: 0, status: 'pending' }],
        customer: { name: 'Imran Khan', phone: '0301-7654321', cnic: '35202-1234567-1', address: 'House 12, Model Town, Lahore' },
        guarantor: { name: 'Sponsor Sahib', phone: '0300-0000000', cnic: '35202-9999999-9', address: 'Guarantor address' },
        agreementId: 'AGR-TEST-1',
        status: 'active', firstDueDate: '2026-12-10', monthlyAmount: 11667,
        payments: [{ receiptNo: 'REC-001', amount: 15000, paidAt: '2026-10-10T12:15:00Z', mode: 'cash', receivedBy: 'علی', note: '<script>unsafe</script>' }],
      },
    });
    assert.match(html, /Installment Agreement/i);
    assert.match(html, /AGR-TEST-1/);
    assert.match(html, /Imran Khan/);
    assert.match(html, /35202-1234567-1/);
    assert.match(html, /House 12, Model Town, Lahore/);
    assert.match(html, /Guarantor/);
    assert.match(html, /35202-9999999-9/);
    assert.match(html, /data:font\/ttf;base64,/);
    assert.match(html, /موبائل فون Phone/);
    assert.match(html, /IMEI-123456/);
    assert.match(html, /product-1/);
    assert.match(html, /REC-001/);
    assert.match(html, /علی/);
    assert.doesNotMatch(html, /<script>unsafe/);
  });
});
