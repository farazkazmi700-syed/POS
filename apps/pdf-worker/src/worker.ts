import 'dotenv/config';
import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { MongoClient } from 'mongodb';
import { createProcessor, markFailed } from './queue/invoice.processor';
import { closeBrowser } from './services/pdf.service';
import { InvoiceJobData } from './types';

const QUEUE = 'invoice';

async function main() {
  const mongo = new MongoClient(process.env.MONGO_URI || 'mongodb://localhost:27017/pos');
  await mongo.connect();
  const orders = mongo.db().collection('orders');

  const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', { maxRetriesPerRequest: null });

  const worker = new Worker<InvoiceJobData>(QUEUE, createProcessor(orders), {
    connection,
    concurrency: Number(process.env.WORKER_CONCURRENCY || 2),
  });

  worker.on('completed', (job, result) => console.log(`[invoice] ${job.data.invoiceNo} ready`, result));
  worker.on('failed', async (job, err) => {
    console.error(`[invoice] ${job?.data.invoiceNo} failed (attempt ${job?.attemptsMade}):`, err.message);
    // Only flag the order once BullMQ has used up every retry.
    if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) await markFailed(orders, job);
  });

  console.log('[invoice] worker started, waiting for jobs...');

  const shutdown = async () => {
    console.log('[invoice] shutting down...');
    await worker.close();
    await closeBrowser();
    await mongo.close();
    connection.disconnect();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => { console.error(err); process.exit(1); });
