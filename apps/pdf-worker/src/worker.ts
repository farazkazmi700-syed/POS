import dotenv from 'dotenv';
dotenv.config({ path: '../../.env' });
import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { MongoClient, ObjectId } from 'mongodb';
import { createProcessor, markFailed } from './queue/invoice.processor';
import { closeBrowser } from './services/pdf.service';
import { InvoiceJobData } from './types';
import { PostgresInvoiceStore } from '@pos/invoice-store';

const QUEUE = 'invoice';

async function main() {
  const mode = process.env.INVOICE_STORE || (process.env.INVOICE_DATABASES_FILE ? 'postgres' : 'mongodb');
  if (!['postgres', 'mongodb'].includes(mode)) throw new Error('Invalid INVOICE_STORE');
  const postgres = mode === 'postgres' ? PostgresInvoiceStore.fromFile(process.env.INVOICE_DATABASES_FILE || '') : undefined;
  await postgres?.ready();
  // Tenant entitlements remain in the control database even when invoice state uses PostgreSQL.
  const mongo = new MongoClient(process.env.MONGO_URI || 'mongodb://localhost:27017/pos');
  await mongo.connect();
  const orders = postgres ?? mongo!.db().collection('orders');

  const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', { maxRetriesPerRequest: null });

  const authorize = async (data: InvoiceJobData) => {
    const tenant = await mongo.db().collection('tenants').findOne({ _id: new ObjectId(data.tenant.id) });
    if (!tenant || tenant.status === 'suspended' || (tenant.licenseExpiresAt && new Date(tenant.licenseExpiresAt).getTime() <= Date.now())) throw new Error('Business is unavailable');
    const keys = data.installment ? ['pos', 'installments'] : ['pos'];
    const active = await mongo.db().collection('platformmodules').countDocuments({ key: { $in: keys }, installed: true, isActive: true, releaseState: 'active' });
    if (active !== keys.length || keys.some((key) => tenant.featureFlags?.[key] === false)) throw new Error('Invoice module is unavailable');
  };
  const worker = new Worker<InvoiceJobData>(QUEUE, createProcessor(orders, authorize), {
    prefix: process.env.BULL_PREFIX || 'bull',
    connection,
    concurrency: Number(process.env.WORKER_CONCURRENCY || 2),
  });

  worker.on('completed', (job, result) => console.log(`[invoice] ${job.data.invoiceNo} ready`, result));
  worker.on('failed', async (job, err) => {
    console.error(`[invoice] ${job?.data.invoiceNo} failed (attempt ${job?.attemptsMade}):`, err.message);
    // Only flag the order once BullMQ has used up every retry.
    if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
      try { await markFailed(orders, job); }
      catch { console.error('[invoice] could not persist failure status'); }
    }
  });

  console.log('[invoice] worker started, waiting for jobs...');

  const shutdown = async () => {
    console.log('[invoice] shutting down...');
    await worker.close();
    await closeBrowser();
    await mongo?.close();
    await postgres?.close();
    connection.disconnect();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => { console.error(err); process.exit(1); });
