import fs from 'fs';
import Handlebars from 'handlebars';
import path from 'path';
import QRCode from 'qrcode';
import { InvoiceJobData } from '../types';
import { invoicePaper } from './paper';

// Works both from src/ (tsx) and dist/ (compiled): templates always live in <worker>/src/templates.
const TEMPLATE_PATH = path.resolve(__dirname, '../../src/templates/invoice.hbs');
const TZ = process.env.REPORT_TZ || 'UTC';
const fonts = {
  latin: fs.readFileSync(path.join(path.dirname(TEMPLATE_PATH), 'fonts/NotoSans.ttf')).toString('base64'),
  urdu: fs.readFileSync(path.join(path.dirname(TEMPLATE_PATH), 'fonts/NotoSansArabic.ttf')).toString('base64'),
};

const hbs = Handlebars.create();

/** Format a number as money with 2 decimal places */
hbs.registerHelper('money', (n: number) =>
  Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

/** Format quantity — strips trailing zeros */
hbs.registerHelper('qty', (n: number) => String(Number(n)));

/** Format as percentage */
hbs.registerHelper('pct', (n: number) => `${Number(n)}%`);

/** Increment index (for 1-based row numbers) */
hbs.registerHelper('inc', (n: number) => n + 1);

/** Uppercase a string */
hbs.registerHelper('upper', (s: string) => String(s ?? '').toUpperCase());

/** Render block only when array is non-empty */
hbs.registerHelper('ifAny', function (this: unknown, arr: unknown[], options: Handlebars.HelperOptions) {
  return Array.isArray(arr) && arr.length ? options.fn(this) : options.inverse(this);
});

/** Map installment/schedule status to a CSS class name */
hbs.registerHelper('statusClass', (status: string) => {
  const map: Record<string, string> = {
    active: 'badge-active', completed: 'badge-completed', overdue: 'badge-overdue',
    pending: 'badge-pending', partial: 'badge-partial', paid: 'badge-paid', cancelled: 'badge-cancelled',
  };
  return map[String(status ?? '').toLowerCase()] ?? 'badge-pending';
});

/** Format ISO date string as DD MMM YYYY */
hbs.registerHelper('dateOnly', (iso: string) => {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
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
  const logoUrl = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(job.tenant.logoUrl ?? '') ? job.tenant.logoUrl : undefined;
  const paper = invoicePaper(job.tenant);

  const labels: Record<string, string> = {
    restaurant: 'Restaurant Bill', pharmacy: 'Pharmacy Invoice',
    electronics: 'Electronics Invoice', salon: 'Service Invoice',
    grocery: 'Grocery Receipt', supermarket: 'Supermarket Receipt', retail: 'Tax Invoice',
  };

  // Enrich the installment payload for the template:
  // — format payment timestamps
  // — ensure schedule rows include a `remainingAmount` field (the plan schema stores it;
  //   the independent-sale schema uses the same name, so just default-zero if absent)
  const installment = job.installment
    ? {
        ...job.installment,
        schedule: job.installment.schedule.map((s) => ({
          ...s,
          remainingAmount: (s as unknown as { remainingAmount?: number }).remainingAmount ?? (s.amount - s.paidAmount),
        })),
        payments: job.installment.payments?.map((p) => ({
          ...p,
          paidAt: formatDateTime(p.paidAt),
        })),
      }
    : undefined;

  return template()({
    ...job,
    fonts,
    installment,
    tenant: { ...job.tenant, logoUrl },
    paper,
    title: labels[job.tenant.domainType ?? ''] ?? 'TAX INVOICE',
    showLogoWatermark: !!logoUrl && job.tenant.logoWatermark !== false,
    qrDataUrl,
    issuedAt: formatDateTime(job.createdAt),
  });
}
