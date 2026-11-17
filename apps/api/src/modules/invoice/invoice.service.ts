import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Queue } from 'bullmq';
import { existsSync } from 'fs';
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

@Injectable()
export class InvoiceService {
  private readonly logger = new Logger(InvoiceService.name);

  constructor(
    @InjectQueue(INVOICE_QUEUE) private readonly queue: Queue<InvoiceJobData>,
    @InjectModel(Order.name) private readonly orders: Model<Order>,
    @InjectModel(InstallmentPlan.name) private readonly plans: Model<InstallmentPlan>,
    private readonly tenants: TenantService,
    private readonly config: ConfigService,
    private readonly state: InvoiceStateService,
  ) {}

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
      // A timestamp in the job id lets "regenerate" re-run an order that already has a finished job.
      await this.queue.add('generate', data, {
        jobId: `${order.id}-${Date.now()}`,
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

  /** Absolute path of a finished PDF, guarded against path traversal. */
  resolvePdfPath(order: OrderDocument): string {
    if (order.invoiceStatus !== InvoiceStatus.Ready || !order.invoicePdfPath) {
      throw new NotFoundException('Invoice PDF is not ready yet');
    }
    const root = path.resolve(this.config.get<string>('STORAGE_DIR', './storage/record of business'));
    const file = path.resolve(root, order.invoicePdfPath);
    if (!file.startsWith(root + path.sep)) throw new NotFoundException('Invoice PDF not found');
    if (existsSync(file)) return file;

    const legacyRoot = path.resolve(root, '..', 'invoices');
    const legacyFile = path.resolve(legacyRoot, order.invoicePdfPath);
    if (!legacyFile.startsWith(legacyRoot + path.sep)) throw new NotFoundException('Invoice PDF not found');
    return legacyFile;
  }
}
