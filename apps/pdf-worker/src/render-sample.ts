/**
 * Renders a sample invoice to ./sample-invoice.html (and .pdf when Chromium is available).
 * Handy while you tweak templates/invoice.hbs:   npm run render:sample
 */
import fs from 'fs';
import { renderInvoiceHtml } from './services/invoice-renderer';
import { InvoiceJobData } from './types';

export const sample: InvoiceJobData = {
  orderId: '665f1c2a9b1e8a0012345678',
  invoiceNo: 'INV-2026-000241',
  createdAt: new Date().toISOString(),
  tenant: { id: 't1', name: 'Faraz Retail Store', address: 'Main Boulevard, Gulberg, Lahore', taxRegNo: '1234567-8', currency: 'PKR' },
  cashierName: 'Ali Raza',
  customer: { name: 'Walk-in customer', phone: '0300-1234567' },
  paymentMode: 'cash',
  items: [
    { name: 'Wireless mouse', qty: 1, unitPrice: 1800, discountPercent: 5, discountAmount: 90, taxPercent: 18, taxAmount: 307.8, lineTotal: 2017.8 },
    { name: 'Notebook A5', qty: 2, unitPrice: 220, discountPercent: 5, discountAmount: 22, taxPercent: 18, taxAmount: 75.24, lineTotal: 493.24 },
    { name: 'Green tea 250g (reduced rate)', qty: 1, unitPrice: 450, discountPercent: 0, discountAmount: 0, taxPercent: 5, taxAmount: 22.5, lineTotal: 472.5 },
  ],
  totals: {
    subtotal: 2690, discountTotal: 112, taxableTotal: 2578, taxTotal: 405.54,
    charges: [{ label: 'Service charge (5%)', amount: 128.9 }, { label: 'Packaging', amount: 20 }],
    chargesTotal: 148.9, grandTotal: 3132.44,
    taxBreakdown: [
      { ratePercent: 18, taxableAmount: 2128, taxAmount: 383.04 },
      { ratePercent: 5, taxableAmount: 450, taxAmount: 22.5 },
    ],
  },
};

(async () => {
  const html = await renderInvoiceHtml(sample);
  fs.writeFileSync('sample-invoice.html', html);
  console.log('wrote sample-invoice.html');
  try {
    const { htmlToPdf, closeBrowser } = await import('./services/pdf.service');
    fs.writeFileSync('sample-invoice.pdf', await htmlToPdf(html));
    await closeBrowser();
    console.log('wrote sample-invoice.pdf');
  } catch (e) {
    console.log('PDF step skipped (no Chromium available):', (e as Error).message.split('\n')[0]);
  }
})();
