import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Queue } from 'bullmq';
import * as path from 'path';
import { Model } from 'mongoose';
import { InvoiceStatus } from '../../common/enums';
import { oid } from '../../common/object-id';
import { Order, OrderDocument } from '../order/schemas/order.schema';
import { TenantService } from '../tenant/tenant.service';
import { INVOICE_QUEUE } from './invoice.constants';
import { InvoiceJobData } from './invoice-job.types';

@Injectable()
export class InvoiceService {
  private readonly logger = new Logger(InvoiceService.name);

  constructor(
    @InjectQueue(INVOICE_QUEUE) private readonly queue: Queue<InvoiceJobData>,
    @InjectModel(Order.name) private readonly orders: Model<Order>,
    private readonly tenants: TenantService,
    private readonly config: ConfigService,
  ) {}

  /** Queue PDF generation. Never throws: a queue outage must not fail a completed sale. */
  async enqueue(order: OrderDocument): Promise<void> {
    try {
      const tenant = await this.tenants.findById(order.tenantId.toString());
      const data: InvoiceJobData = {
        orderId: order.id,
        invoiceNo: order.invoiceNo,
        createdAt: ((order as unknown as { createdAt?: Date }).createdAt ?? new Date()).toISOString(),
        tenant: {
          id: tenant.id, name: tenant.name, address: tenant.address, taxRegNo: tenant.taxRegNo,
          currency: tenant.currency, logoUrl: tenant.logoUrl,
        },
        cashierName: order.cashierName,
        customer: order.customer ? { name: order.customer.name, phone: order.customer.phone } : undefined,
        paymentMode: order.paymentMode,
        items: order.items.map((i) => ({
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
      await this.orders.updateOne({ _id: order.id }, { invoiceStatus: InvoiceStatus.Failed });
    }
  }

  async getOrder(tenantId: string, orderId: string): Promise<OrderDocument> {
    const order = await this.orders.findOne({ _id: orderId, tenantId: oid(tenantId) });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  async regenerate(tenantId: string, orderId: string) {
    const order = await this.getOrder(tenantId, orderId);
    order.invoiceStatus = InvoiceStatus.Pending;
    await order.save();
    await this.enqueue(order);
    return { status: order.invoiceStatus };
  }

  /** Absolute path of a finished PDF, guarded against path traversal. */
  resolvePdfPath(order: OrderDocument): string {
    if (order.invoiceStatus !== InvoiceStatus.Ready || !order.invoicePdfPath) {
      throw new NotFoundException('Invoice PDF is not ready yet');
    }
    const root = path.resolve(this.config.get<string>('STORAGE_DIR', './storage/invoices'));
    const file = path.resolve(root, order.invoicePdfPath);
    if (!file.startsWith(root + path.sep)) throw new NotFoundException('Invoice PDF not found');
    return file;
  }
}
