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
    logoUrl: 'https://example.com/logo.png',
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
    assert.match(html, /https:\/\/example\.com\/logo\.png/i);
  });
});
