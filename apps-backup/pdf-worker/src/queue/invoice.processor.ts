import { Job } from 'bullmq';
import { Collection, ObjectId } from 'mongodb';
import { renderInvoiceHtml } from '../services/invoice-renderer';
import { htmlToPdf } from '../services/pdf.service';
import { savePdf } from '../services/storage.service';
import { InvoiceJobData } from '../types';

export function createProcessor(orders: Collection) {
  return async (job: Job<InvoiceJobData>) => {
    const data = job.data;
    const html = await renderInvoiceHtml(data);
    const pdf = await htmlToPdf(html);
    const relPath = await savePdf(data.tenant.id, data.invoiceNo, pdf);
    await orders.updateOne(
      { _id: new ObjectId(data.orderId) },
      { $set: { invoiceStatus: 'ready', invoicePdfPath: relPath } },
    );
    return { relPath, bytes: pdf.length };
  };
}

export async function markFailed(orders: Collection, job: Job<InvoiceJobData>) {
  await orders.updateOne({ _id: new ObjectId(job.data.orderId) }, { $set: { invoiceStatus: 'failed' } });
}
