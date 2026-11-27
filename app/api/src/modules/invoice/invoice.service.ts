import { InjectQueue } from '@nestjs/bullmq';
import { ConflictException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Queue } from 'bullmq';
import { existsSync } from 'fs';
import { open, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import * as path from 'path';
import { Model } from 'mongoose';
import { InvoiceStatus } from '../../common/enums';
import { oid } from '../../common/object-id';
import { Order, OrderDocument } from '../order/schemas/order.schema';
import { TenantService } from '../tenant/tenant.service';
import { INVOICE_QUEUE } from './invoice.constants';
import { InvoiceJobData } from './invoice-job.types';
import { InvoiceStateService } from './invoice-state.service';
import { InstallmentPlan } from '../installment/schemas/installment-plan.schema';
import { nextDueOf, overdueOf, todayIn } from '../installment/calc/calculate-plan';
import { toMinor } from '../installment/calc/money';

// R2 types (only used when STORAGE_MODE=r2)
import { Readable } from 'node:stream';
import type { ReadableStream } from 'node:stream/web';

interface R2Bucket {
  get(key: string): Promise<{ body: ReadableStream; arrayBuffer(): Promise<ArrayBuffer> } | null>;
}

@Injectable()
export class InvoiceService {
  private readonly logger = new Logger(InvoiceService.name);
  private r2Bucket: R2Bucket | null = null;

  constructor(
    @InjectQueue(INVOICE_QUEUE) private readonly queue: Queue<InvoiceJobData>,
    @InjectModel(Order.name) private readonly orders: Model<Order>,
    @InjectModel(InstallmentPlan.name) private readonly plans: Model<InstallmentPlan>,
    private readonly tenants: TenantService,
    private readonly config: ConfigService,
    private readonly state: InvoiceStateService,
  ) {
    // Initialize R2 bucket if in R2 mode
    this.initR2Storage();
  }

  private initR2Storage() {
    const storageMode = this.config.get<string>('STORAGE_MODE', 'local');
    if (storageMode === 'r2') {
      // In Cloudflare Workers, the R2 bucket is injected via binding
      // For Node.js, we'd use @aws-sdk/client-s3 with R2 endpoint
      // This is a placeholder - actual implementation depends on deployment target
      this.logger.log('R2 storage mode enabled');
    }
  }

  /** Set R2 bucket (called from Worker entry point) */
  setR2Bucket(bucket: R2Bucket) {
    this.r2Bucket = bucket;
  }

  async purgeTenantInvoices(tenantId: string, requestPostgresPurge: () => Promise<void>): Promise<void> {
    if (!/^[a-f0-9]{24}$/.test(tenantId)) throw new Error('Invalid tenant identity');
    if (this.config.get<string>('STORAGE_MODE', 'local') !== 'local') {
      throw new Error('Remote invoice cleanup is unavailable');
    }

    if (await this.queue.isPaused()) throw new Error('Invoice cleanup will retry once the queue resumes');
    const states = ['waiting', 'active', 'delayed', 'prioritized', 'failed', 'completed', 'waiting-children'] as const;
    const size = 100;
    for (const state of states) {
      let offset = 0;
      for (;;) {
        const jobs = await this.queue.getJobs(state, offset, offset + size - 1, true);
        let retained = 0;
        for (const job of jobs) {
          if (job.data.tenant?.id === tenantId) await job.remove();
          else retained++;
        }
        if (jobs.length < size) break;
        offset += retained;
      }
    }

    const configured = this.config.get<string>('STORAGE_DIR', './storage/record of business');
    const roots = new Set([
      path.resolve(configured),
      path.resolve('storage', 'record of business'),
      path.resolve('storage', 'invoices'),
    ]);
    for (const root of roots) {
      const directory = path.join(root, tenantId);
      if (path.relative(root, directory) !== tenantId) throw new Error('Invalid invoice directory');
      await rm(directory, { recursive: true, force: true });
    }

    // PostgreSQL deletion is performed by the provisioner only after the trash sweep claims the business.
    const postgres = this.state.postgres;
    if (postgres) {
      await requestPostgresPurge();
      for (let attempt = 0; attempt < 10; attempt++) {
        if (await postgres.invoicesPurged(tenantId)) return;
        await delay(500);
      }
      throw new Error('Waiting for privileged invoice cleanup');
    }
  }

  /** Queue PDF generation. Never throws: a queue outage must not fail a completed sale. */
  async enqueue(order: OrderDocument): Promise<void> {
    let generation: string | undefined;
    try {
      generation = await this.state.postgres?.begin(order.tenantId.toString(), order.id);
      order.invoiceStatus = InvoiceStatus.Pending;
      const tenant = await this.tenants.findById(order.tenantId.toString());
      const plan = order.paymentMode === 'installment' ? await this.plans.findOne({ tenantId: order.tenantId, orderId: order._id }) : null;
      const data: InvoiceJobData = {
        orderId: order.id,
        ...(plan ? { installment: {
          cashPrice: plan.cashTotal, downPayment: plan.downPayment,
          principal: (toMinor(plan.cashTotal) - toMinor(plan.downPayment)) / 100,
          financedAmount: plan.financedAmount, charges: plan.markupAmount, count: plan.months,
          frequency: 'monthly', totalPayable: plan.totalPayable,
          paidToDate: plan.paidTotal, remaining: plan.balance,
          ...(() => { const overdue = overdueOf(plan.schedule, todayIn(tenant.timeZone || 'Asia/Karachi')); return { overdue: overdue.amount, overdueCount: overdue.count }; })(),
          nextDue: nextDueOf(plan.schedule), schedule: plan.schedule.map((s) => ({ no: s.no, dueDate: s.dueDate, amount: s.amount, paidAmount: s.paidAmount, status: s.status })),
          agreementId: plan.invoiceNo,
          status: plan.status, firstDueDate: plan.firstDueDate, monthlyAmount: plan.monthlyAmount, markupPercent: plan.markupPercent,
          payments: plan.payments.map((payment) => ({ receiptNo: payment.receiptNo, amount: payment.amount,
            paidAt: payment.paidAt.toISOString(), mode: payment.mode, receivedBy: payment.receivedBy, note: payment.note })),
          customer: { name: plan.customerName, phone: plan.customerPhone, cnic: plan.customerCnic, address: plan.customerAddress },
          guarantor: plan.guarantor?.name ? { name: plan.guarantor.name, phone: plan.guarantor.phone, cnic: plan.guarantor.cnic, address: plan.guarantor.address } : undefined,
        } } : {}),
        invoiceGeneration: generation,
        invoiceNo: order.invoiceNo,
        createdAt: ((order as unknown as { createdAt?: Date }).createdAt ?? new Date()).toISOString(),
        tenant: {
          id: tenant.id, name: tenant.name, address: tenant.address, taxRegNo: tenant.taxRegNo,
          currency: tenant.currency, logoUrl: tenant.logoUrl,
          invoicePaperSize: tenant.invoicePrintSettings?.paperSize,
          invoiceOrientation: tenant.invoicePrintSettings?.orientation,
          domainType: tenant.domainType,
          widthMm: tenant.invoicePrintSettings?.widthMm, heightMm: tenant.invoicePrintSettings?.heightMm,
          stamp: tenant.invoicePrintSettings?.stamp, watermark: tenant.invoicePrintSettings?.watermark,
          logoWatermark: tenant.invoicePrintSettings?.logoWatermark, footerText: tenant.invoicePrintSettings?.footerText,
        },
        cashierName: order.cashierName,
        // Installment invoices surface the full buyer snapshot (CNIC/address/guarantor) from the plan.
        customer: order.customer ? {
          name: order.customer.name,
          phone: order.customer.phone,
          ...(plan ? {
            cnic: plan.customerCnic,
            address: plan.customerAddress,
            guarantor: plan.guarantor?.name ? { name: plan.guarantor.name, phone: plan.guarantor.phone, cnic: plan.guarantor.cnic, address: plan.guarantor.address } : undefined,
          } : {}),
        } : undefined,
        paymentMode: order.paymentMode,
        payments: order.payments,
        items: order.items.map((i) => ({
          productId: i.productId.toString(), serialNo: i.serialNo,
          name: i.name, qty: i.qty, unitPrice: i.unitPrice, discountPercent: i.discountPercent,
          discountAmount: i.discountAmount, taxPercent: i.taxPercent, taxAmount: i.taxAmount, lineTotal: i.lineTotal,
        })),
        totals: {
          subtotal: order.subtotal, discountTotal: order.discountTotal, taxableTotal: order.taxableTotal,
          taxTotal: order.taxTotal, charges: order.charges.map((c) => ({ label: c.label, amount: c.amount })),
          chargesTotal: order.chargesTotal, grandTotal: order.grandTotal,
          taxBreakdown: order.taxBreakdown.map((t) => ({
            ratePercent: t.ratePercent, taxableAmount: t.taxableAmount, taxAmount: t.taxAmount,
          })),
        },
      };
      await this.queue.add('generate', data, {
        jobId: `${order.id}-${generation ?? randomUUID()}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 100,
        removeOnFail: 500,
      });
    } catch (err) {
      this.logger.error(`Could not queue invoice for order ${order.id}: ${(err as Error).message}`);
      order.invoiceStatus = InvoiceStatus.Failed;
      if (this.state.postgres) {
        if (generation) {
          try { await this.state.postgres.finish(order.tenantId.toString(), order.id, generation, 'failed'); }
          catch { this.logger.error('Could not persist PostgreSQL invoice failure'); }
        }
      } else await this.orders.updateOne({ _id: order.id, tenantId: order.tenantId }, { invoiceStatus: InvoiceStatus.Failed });
    }
  }

  async getOrder(tenantId: string, orderId: string, cashierId?: string): Promise<OrderDocument> {
    const order = await this.orders.findOne({ _id: orderId, tenantId: oid(tenantId), ...(cashierId ? { cashierId: oid(cashierId) } : {}) });
    if (!order) throw new NotFoundException('Order not found');
    await this.state.hydrate(tenantId, [order]);
    return order;
  }

  hydrate(tenantId: string, orders: OrderDocument[]) { return this.state.hydrate(tenantId, orders); }

  async regenerate(tenantId: string, orderId: string) {
    const order = await this.getOrder(tenantId, orderId);
    order.invoiceStatus = InvoiceStatus.Pending;
    if (!this.state.postgres) await order.save();
    await this.enqueue(order);
    return { status: order.invoiceStatus };
  }

  /** Get PDF stream - works with both local and R2 storage */
  async getPdfStream(order: OrderDocument): Promise<Readable | null> {
    if (order.invoiceStatus !== InvoiceStatus.Ready) {
      throw new ConflictException(order.invoiceStatus === InvoiceStatus.Failed ? 'Invoice generation failed. Request regeneration.' : 'Invoice PDF is being generated. Retry when it is ready.');
    }
    if (!order.invoicePdfPath) throw new ServiceUnavailableException('The generated invoice is unavailable. Request regeneration.');

    const storageMode = this.config.get<string>('STORAGE_MODE', 'local');
    
    if (storageMode === 'r2' && this.r2Bucket) {
      // R2 storage
      const object = await this.r2Bucket.get(order.invoicePdfPath);
      if (!object) {
        throw new ServiceUnavailableException('The generated invoice is unavailable. Request regeneration.');
      }
      return Readable.fromWeb(object.body);
    }

    // Local storage (original implementation)
    const rel = order.invoicePdfPath.replace(/^[/\\]+/, '');
    const configured = this.config.get<string>('STORAGE_DIR', './storage/record of business');
    const roots = [
      path.resolve(configured),
      path.resolve(process.cwd(), configured),
      path.resolve(configured, '..', 'invoices'),
      path.resolve(process.cwd(), configured, '..', 'invoices'),
      path.resolve(process.cwd(), 'storage', 'record of business'),
      path.resolve(process.cwd(), 'storage', 'invoices'),
    ];
    const seen = new Set<string>();
    for (const root of roots) {
      const key = root.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const file = path.resolve(root, rel);
      if (file !== root && !file.startsWith(root + path.sep)) continue;
      try { return (await open(file, 'r')).createReadStream(); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
    throw new ServiceUnavailableException('The generated invoice is unavailable. Request regeneration.');
  }

  /** Get PDF as ArrayBuffer - works with both local and R2 storage */
  async getPdfArrayBuffer(order: OrderDocument): Promise<ArrayBuffer | null> {
    if (order.invoiceStatus !== InvoiceStatus.Ready || !order.invoicePdfPath) {
      throw new NotFoundException('Invoice PDF is not ready yet');
    }

    const storageMode = this.config.get<string>('STORAGE_MODE', 'local');
    
    if (storageMode === 'r2' && this.r2Bucket) {
      const object = await this.r2Bucket.get(order.invoicePdfPath);
      if (!object) return null;
      return object.arrayBuffer();
    }

    // Local storage
    const rel = order.invoicePdfPath.replace(/^[/\\]+/, '');
    const configured = this.config.get<string>('STORAGE_DIR', './storage/record of business');
    const roots = [
      path.resolve(configured),
      path.resolve(process.cwd(), configured),
      path.resolve(configured, '..', 'invoices'),
      path.resolve(process.cwd(), configured, '..', 'invoices'),
      path.resolve(process.cwd(), 'storage', 'record of business'),
      path.resolve(process.cwd(), 'storage', 'invoices'),
    ];
    const seen = new Set<string>();
    for (const root of roots) {
      const key = root.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const file = path.resolve(root, rel);
      if (file !== root && !file.startsWith(root + path.sep)) continue;
      if (existsSync(file)) {
        const { readFile } = await import('fs/promises');
        const buffer = await readFile(file);
        return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
      }
    }
    return null;
  }

  /** @deprecated Use getPdfStream or getPdfArrayBuffer instead */
  resolvePdfPath(order: OrderDocument): string {
    if (order.invoiceStatus !== InvoiceStatus.Ready || !order.invoicePdfPath) {
      throw new NotFoundException('Invoice PDF is not ready yet');
    }
    const rel = order.invoicePdfPath.replace(/^[/\\]+/, '');
    const configured = this.config.get<string>('STORAGE_DIR', './storage/record of business');
    const roots = [
      path.resolve(configured),
      path.resolve(process.cwd(), configured),
      path.resolve(configured, '..', 'invoices'),
      path.resolve(process.cwd(), configured, '..', 'invoices'),
      path.resolve(process.cwd(), 'storage', 'record of business'),
      path.resolve(process.cwd(), 'storage', 'invoices'),
    ];
    const seen = new Set<string>();
    for (const root of roots) {
      const key = root.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const file = path.resolve(root, rel);
      if (file !== root && !file.startsWith(root + path.sep)) continue;
      if (existsSync(file)) return file;
    }
    throw new NotFoundException('Invoice PDF not found on disk');
  }
}
