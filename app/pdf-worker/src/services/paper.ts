import { InvoiceJobData } from '../types';
export function invoicePaper(tenant: InvoiceJobData['tenant']) {
  const size = tenant.invoicePaperSize ?? 'A4';
  const bounded = (value: number | undefined, fallback: number, max: number) => {
    const n = value ?? fallback;
    if (!Number.isFinite(n) || n < 40 || n > max) throw new Error('Invalid invoice paper dimensions');
    return n;
  };
  let width: number, height: number;
  switch (size) {
    case 'A4': width = 210; height = 297; break;
    case 'A5': width = 148; height = 210; break;
    case 'A6': width = 105; height = 148; break;
    case 'Receipt': case '80mm': width = 80; height = bounded(tenant.heightMm, 200, 1000); break;
    case '58mm': width = 58; height = bounded(tenant.heightMm, 200, 1000); break;
    case 'custom': width = bounded(tenant.widthMm, 80, 420); height = bounded(tenant.heightMm, 200, 1000); break;
    default: throw new Error('Unsupported invoice paper size');
  }
  if (tenant.invoiceOrientation === 'landscape' && ['A4', 'A5', 'A6', 'custom'].includes(size)) [width, height] = [height, width];
  return { width, height, margin: width <= 80 ? 3 : width <= 148 ? 6 : 10, compact: width <= 105 };
}
