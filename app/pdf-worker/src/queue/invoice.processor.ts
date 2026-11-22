import { Job } from 'bullmq';
import { Collection, ObjectId } from 'mongodb';
import { renderInvoiceHtml } from '../services/invoice-renderer';
import { htmlToPdf } from '../services/pdf.service';
import { savePdf } from '../services/storage.service';
import { InvoiceJobData } from '../types';
import { invoicePaper } from '../services/paper';
import { PostgresInvoiceStore } from '@pos/invoice-store';


export function createProcessor(orders: Collection | PostgresInvoiceStore, authorize?: (data: InvoiceJobData) => Promise<void>) {
  return async (job: Job<InvoiceJobData>) => {
    const data = job.data;
    if (!/^[a-f0-9]{24}$/.test(data.tenant.id) || !/^[a-f0-9]{24}$/.test(data.orderId)) throw new Error('Invalid invoice identity');
    await authorize?.(data);
    const postgres = orders instanceof PostgresInvoiceStore;
    if (postgres && !data.invoiceGeneration) throw new Error('Legacy invoice job requires regeneration for PostgreSQL');
    if (orders instanceof PostgresInvoiceStore && !(await orders.read(data.tenant.id, [data.orderId])).length) throw new Error('Invoice was not registered by API');
    const html = await renderInvoiceHtml(data);
    // Pass paper dimensions so Puppeteer uses them as a fallback when CSS @page
    // size is unavailable (e.g. very old Chrome builds).
    const paper = invoicePaper(data.tenant);
    const pdf = await htmlToPdf(html, { width: `${paper.width}mm`, height: `${paper.height}mm` });
    const relPath = await savePdf(data.tenant.id, postgres ? `${data.invoiceNo}-${data.invoiceGeneration}` : data.invoiceNo, pdf);
    if (orders instanceof PostgresInvoiceStore) {
      const accepted = await orders.finish(data.tenant.id, data.orderId, data.invoiceGeneration!, 'ready', relPath);
      return { relPath, bytes: pdf.length, superseded: !accepted };
    }
    await orders.updateOne(
      { _id: new ObjectId(data.orderId), tenantId: new ObjectId(data.tenant.id) },
      { $set: { invoiceStatus: 'ready', invoicePdfPath: relPath } },
    );
    return { relPath, bytes: pdf.length };
  };
}

export async function markFailed(orders: Collection | PostgresInvoiceStore, job: Job<InvoiceJobData>) {
  if (orders instanceof PostgresInvoiceStore) {
    if (job.data.invoiceGeneration) await orders.finish(job.data.tenant.id, job.data.orderId, job.data.invoiceGeneration, 'failed');
    return;
  }
  await orders.updateOne({ _id: new ObjectId(job.data.orderId), tenantId: new ObjectId(job.data.tenant.id) }, { $set: { invoiceStatus: 'failed' } });
}
