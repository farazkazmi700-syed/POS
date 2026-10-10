import fs from 'fs';
import Handlebars from 'handlebars';
import path from 'path';
import QRCode from 'qrcode';
import { InvoiceJobData } from '../types';

// Works both from src/ (tsx) and dist/ (compiled): templates always live in <worker>/src/templates.
const TEMPLATE_PATH = path.resolve(__dirname, '../../src/templates/invoice.hbs');
const TZ = process.env.REPORT_TZ || 'UTC';

const hbs = Handlebars.create();
hbs.registerHelper('money', (n: number) =>
  Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
hbs.registerHelper('qty', (n: number) => String(Number(n)));
hbs.registerHelper('pct', (n: number) => `${Number(n)}%`);
hbs.registerHelper('inc', (n: number) => n + 1);
hbs.registerHelper('upper', (s: string) => String(s ?? '').toUpperCase());
hbs.registerHelper('ifAny', function (this: unknown, arr: unknown[], options: Handlebars.HelperOptions) {
  return Array.isArray(arr) && arr.length ? options.fn(this) : options.inverse(this);
});

let compiled: HandlebarsTemplateDelegate | null = null;
const template = () => (compiled ??= hbs.compile(fs.readFileSync(TEMPLATE_PATH, 'utf8')));

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(iso));
}

/**
 * The QR encodes the facts a verifier needs. If your country's tax authority runs an
 * invoice-verification service (e.g. FBR POS integration in Pakistan), replace this payload with the
 * authority-issued invoice number / QR returned by their API.
 */
export function qrPayload(job: InvoiceJobData): string {
  return JSON.stringify({
    inv: job.invoiceNo, seller: job.tenant.name, tax_id: job.tenant.taxRegNo ?? null,
    total: job.totals.grandTotal, tax: job.totals.taxTotal, ts: job.createdAt,
  });
}

export async function renderInvoiceHtml(job: InvoiceJobData): Promise<string> {
  const qrDataUrl = await QRCode.toDataURL(qrPayload(job), { margin: 1, width: 220, errorCorrectionLevel: 'M' });
  return template()({ ...job, qrDataUrl, issuedAt: formatDateTime(job.createdAt) });
}
