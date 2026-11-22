const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createRequire } = require('node:module');
const workerRequire = createRequire(path.resolve('app/pdf-worker/package.json'));
const { renderInvoiceHtml } = require('../app/pdf-worker/dist/services/invoice-renderer');
const { htmlToPdf, closeBrowser } = require('../app/pdf-worker/dist/services/pdf.service');
const puppeteer = workerRequire('puppeteer');
const out = path.resolve('qa/artifacts/print');
const sample = {
  orderId: '665f1c2a9b1e8a0012345678', invoiceNo: 'QA-0001', createdAt: '2026-11-16T12:00:00Z',
  tenant: { id: '665f1c2a9b1e8a0012345679', name: 'KazmiOn Test Electronics', currency: 'PKR', domainType: 'electronics',
    address: 'Isolated print fixture', stamp: 'SAMPLE', watermark: 'TEST COPY', footerText: 'Thank you.' },
  cashierName: 'علی Ahmed', paymentMode: 'installment',
  installment: {
    customer: { name: 'محمد احمد', phone: '0300-1234567', cnic: '35202-1234567-1', address: 'مکان ۱۲، ماڈل ٹاؤن، لاہور' },
    guarantor: { name: 'علی رضا', phone: '0301-1234567', cnic: '35202-7654321-1', address: 'گلی ۵، لاہور' },
    agreementId: 'AGR-001', status: 'active', downPayment: 10, principal: 90, charges: 0,
    totalPayable: 100, paidToDate: 10, remaining: 90, overdue: 0, count: 3, frequency: 'monthly', monthlyAmount: 30, firstDueDate: '2026-12-17',
    schedule: [12, 1, 2].map((month, i) => ({ no: i + 1, dueDate: `${i ? 2027 : 2026}-${String(month).padStart(2, '0')}-17`, amount: 30, paidAmount: 0, status: 'pending' })),
    payments: [{ receiptNo: 'REC-001', amount: 10, paidAt: '2026-11-17T12:00:00Z', mode: 'cash', receivedBy: 'علی Ahmed' }],
  },
  items: [{ name: 'موبائل فون / Samsung Phone', serialNo: '123456789012345', productId: '665f1c2a9b1e8a0012345670', qty: 1, unitPrice: 100, discountPercent: 0, discountAmount: 0, taxPercent: 0, taxAmount: 0, lineTotal: 100 }],
  totals: { subtotal: 100, discountTotal: 0, taxableTotal: 100, taxTotal: 0, charges: [], chargesTotal: 0, grandTotal: 100, taxBreakdown: [] },
};
async function main() {
  await fs.mkdir(out, { recursive: true });
  const browser = await puppeteer.launch({ headless: true, executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || await puppeteer.executablePath() });
  try {
    for (const [size, width, height] of [['A4', 210, 297], ['A5', 148, 210], ['A6', 105, 148], ['80mm', 80, 200], ['58mm', 58, 200], ['custom', 120, 180], ['Receipt', 80, 200]]) {
      const html = await renderInvoiceHtml({ ...sample, tenant: { ...sample.tenant, invoicePaperSize: size, ...(size === 'custom' ? { widthMm: 120, heightMm: 180 } : {}) } });
      const pdf = await htmlToPdf(html);
      const boxes = [...pdf.toString('latin1').matchAll(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/g)];
      assert.ok(boxes.length, 'PDF page boxes must be present');
      for (const box of boxes) { assert.ok(Math.abs(Number(box[1]) * 25.4 / 72 - width) < 0.6); assert.ok(Math.abs(Number(box[2]) * 25.4 / 72 - height) < 0.6); }
      await fs.writeFile(path.join(out, `${size}.pdf`), pdf);
      await fs.writeFile(path.join(out, `${size}.html`), html);
      const page = await browser.newPage();
      const margin = width <= 80 ? 3 : width <= 148 ? 6 : 10;
      await page.setViewport({ width: Math.round((width - margin * 2) * 96 / 25.4), height: Math.round(height * 96 / 25.4), deviceScaleFactor: 2 });
      await page.setContent(html);
      await page.evaluate(() => document.fonts.ready);
      assert.equal(await page.evaluate(() => [...document.fonts].every(font => font.status === 'loaded')), true, 'Embedded fonts must load');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `${size}: content overflows printable width`);
      await page.screenshot({ path: path.join(out, `${size}-layout.png`), fullPage: true });
      await page.close();
      console.log(`PASS ${size}: ${width} x ${height} mm, ${boxes.length} PDF page(s), no horizontal overflow`);
    }
  } finally { await browser.close(); await closeBrowser(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
