import type { ExecutionContext, R2Bucket, ScheduledEvent } from '@cloudflare/workers-types';
import dotenv from 'dotenv';
dotenv.config({ path: '../../.env' });

import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { MongoClient, ObjectId } from 'mongodb';
import { createProcessor, markFailed } from './queue/invoice.processor';
import { closeBrowser } from './services/pdf.service';
import { InvoiceJobData } from './types';
import { PostgresInvoiceStore } from '@pos/invoice-store';
import { initR2Storage } from './services/storage.service';

// Cloudflare Workers entry point for PDF worker
// This allows running the BullMQ worker on Cloudflare Workers

interface Env {
  PDF_BUCKET: R2Bucket;
  R2_PUBLIC_URL?: string;
  REDIS_URL: string;
  MONGO_URI: string;
  INVOICE_STORE?: string;
  INVOICE_DATABASES_FILE?: string;
  BUSINESS_DB_DIRECTORY?: string;
  BULL_PREFIX?: string;
  WORKER_CONCURRENCY?: string;
}

const QUEUE = 'invoice';

// Export the worker for Cloudflare Workers
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // Health check endpoint
    if (request.url.endsWith('/health')) {
      return new Response(JSON.stringify({ status: 'ok', worker: 'pdf-worker' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    // This is a background worker, not an HTTP service
    // Return info about the worker
    return new Response(JSON.stringify({ 
      worker: 'kazmion-pos-pdf-worker',
      status: 'running',
      queue: QUEUE,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  },
  
  // Scheduled handler for cron triggers (if needed)
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    // Could be used for periodic tasks
    console.log('Scheduled event triggered:', event.cron);
  },
};

// Main worker function - can be called directly or via scheduled trigger
export async function runWorker(env: Env): Promise<void> {
  // Initialize R2 storage
  initR2Storage({
    PDF_BUCKET: env.PDF_BUCKET,
    R2_PUBLIC_URL: env.R2_PUBLIC_URL,
  });
  
  const mode = process.env.INVOICE_STORE || (process.env.INVOICE_DATABASES_FILE ? 'postgres' : 'mongodb');
  if (!['postgres', 'mongodb'].includes(mode)) throw new Error('Invalid INVOICE_STORE');
  
  const postgres = process.env.BUSINESS_DB_DIRECTORY 
    ? PostgresInvoiceStore.fromDirectory(process.env.BUSINESS_DB_DIRECTORY) 
    : mode === 'postgres' 
      ? PostgresInvoiceStore.fromFile(process.env.INVOICE_DATABASES_FILE || '') 
      : undefined;
  await postgres?.ready();
  
  const mongo = new MongoClient(process.env.MONGO_URI || 'mongodb://localhost:27017/pos');
  await mongo.connect();
  const orders = postgres ?? mongo!.db().collection('orders');
  
  const connection = new IORedis(env.REDIS_URL || 'redis://localhost:6379', { maxRetriesPerRequest: null });
  
  const authorize = async (data: InvoiceJobData) => {
    const tenant = await mongo.db().collection('tenants').findOne({ _id: new ObjectId(data.tenant.id) });
    if (!tenant || tenant.status === 'suspended' || (tenant.licenseExpiresAt && new Date(tenant.licenseExpiresAt).getTime() <= Date.now())) {
      throw new Error('Business is unavailable');
    }
    const keys = data.installment ? ['pos', 'installments'] : ['pos'];
    const active = await mongo.db().collection('platformmodules').countDocuments({ 
      key: { $in: keys }, 
      installed: true, 
      isActive: true, 
      releaseState: 'active' 
    });
    if (active !== keys.length || keys.some((key) => tenant.featureFlags?.[key] === false)) {
      throw new Error('Invoice module is unavailable');
    }
  };
  
  const worker = new Worker<InvoiceJobData>(QUEUE, createProcessor(orders, authorize), {
    prefix: env.BULL_PREFIX || 'bull',
    connection,
    concurrency: Number(env.WORKER_CONCURRENCY || 2),
  });
  
  worker.on('completed', (job, result) => console.log(`[invoice] ${job.data.invoiceNo} ready`, result));
  worker.on('failed', async (job, err) => {
    console.error(`[invoice] ${job?.data.invoiceNo} failed (attempt ${job?.attemptsMade}):`, err.message);
    if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
      try { await markFailed(orders, job); }
      catch { console.error('[invoice] could not persist failure status'); }
    }
  });
  
  console.log('[invoice] worker started, waiting for jobs...');
  
  // Keep the worker running
  const shutdown = async () => {
    console.log('[invoice] shutting down...');
    await worker.close();
    await closeBrowser();
    await mongo?.close();
    await postgres?.close();
    connection.disconnect();
  };
  
  // Handle shutdown signals
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  
  // For Cloudflare Workers, we don't wait indefinitely
  // The worker runs in the background
}
