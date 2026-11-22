import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { createHash } from 'crypto';
import { AuthUser } from '../../common/auth-user';
import { InvoiceStatus, OrderStatus, PaymentMode } from '../../common/enums';
import { oid } from '../../common/object-id';
import { InstallmentService, PreparedPlan } from '../installment/installment.service';
import { InvoiceService } from '../invoice/invoice.service';
import { ProductService } from '../product/product.service';
import { TenantDocument } from '../tenant/schemas/tenant.schema';
import { TenantService } from '../tenant/tenant.service';
import { CalcLineInput, calculateTotals } from './calc/calculate-totals';
import { CreateOrderDto, OrderItemDto, PreviewOrderDto } from './dto/order.dto';
import { InvoiceCounter } from './schemas/invoice-counter.schema';
import { Order, OrderDocument } from './schemas/order.schema';
import { CheckoutRequest } from './schemas/checkout-request.schema';

type Line = CalcLineInput & { trackStock: boolean };

@Injectable()
export class OrderService {
  constructor(
    @InjectModel(Order.name) private readonly orders: Model<Order>,
    @InjectModel(InvoiceCounter.name) private readonly counters: Model<InvoiceCounter>,
    @InjectModel(CheckoutRequest.name) private readonly checkouts: Model<CheckoutRequest>,
    private readonly products: ProductService,
    private readonly tenants: TenantService,
    private readonly invoices: InvoiceService,
    private readonly installments: InstallmentService,
    private readonly config: ConfigService,
  ) {}

  /** Totals for the cart screen. Same code path as checkout, so the UI never disagrees with the receipt. */
  async preview(tenantId: string, dto: PreviewOrderDto) {
    const { tenant, lines } = await this.buildLines(tenantId, dto.items);
    return calculateTotals(lines, tenant.taxProfile);
  }

  async create(user: AuthUser, dto: CreateOrderDto): Promise<unknown> {
    if (!dto.idempotencyKey) return this.createOnce(user, dto);
    const filter = { tenantId: oid(user.tenantId), key: dto.idempotencyKey };
    const hash = createHash('sha256').update(JSON.stringify({ ...dto, idempotencyKey: undefined })).digest('hex');
    const previous = await this.checkouts.findOne(filter).lean();
    if (previous) {
      if (previous.hash !== hash) throw new ConflictException('Idempotency key was already used for a different checkout');
      if (previous.result) return previous.result;
      const saved = await this.orders.findOne({ tenantId: oid(user.tenantId), idempotencyKey: dto.idempotencyKey });
      if (saved) return saved;
      throw new ConflictException('Checkout is being processed. Retry with the same key.');
    }
    try { await this.checkouts.create({ ...filter, hash }); }
    catch (error) { if ((error as { code?: number }).code === 11000) throw new ConflictException('Checkout is being processed. Retry with the same key.'); throw error; }
    try {
      const result = await this.createOnce(user, dto);
      const response = typeof result.toObject === 'function' ? result.toObject() : result;
      await this.checkouts.updateOne(filter, { $set: { result: response } });
      return result;
    } catch (error) {
      if (!await this.orders.exists({ tenantId: oid(user.tenantId), idempotencyKey: dto.idempotencyKey })) await this.checkouts.deleteOne(filter);
      throw error;
    }
  }

  private async createOnce(user: AuthUser, dto: CreateOrderDto): Promise<OrderDocument | (Record<string, unknown> & { installmentPlanId: string })> {
    const { tenant, lines } = await this.buildLines(user.tenantId, dto.items);
    const calc = calculateTotals(lines, tenant.taxProfile);
    if (dto.paymentMode === PaymentMode.Mixed) {
      const paid = Math.round((dto.payments ?? []).reduce((sum, payment) => sum + payment.amount, 0) * 100);
      if (!dto.payments || dto.payments.length < 2 || new Set(dto.payments.map((payment) => payment.mode)).size !== dto.payments.length || paid !== Math.round(calc.grandTotal * 100)) throw new BadRequestException('Mixed tender must contain distinct payment methods whose amounts equal the order total');
    } else if (dto.payments) throw new BadRequestException('Payment breakdown is only accepted for mixed tender');

    // Installment sale: validate the customer and the terms first, so a bad request changes nothing.
    let prepared: PreparedPlan | null = null;
    if (dto.paymentMode === PaymentMode.Installment) {
      if (tenant.featureFlags?.installments === false) {
        throw new ForbiddenException('The installments feature is disabled for this business');
      }
      if (!dto.installment) throw new BadRequestException('Installment terms are required');
      prepared = await this.installments.prepare(user.tenantId, dto.installment, calc.grandTotal);
    }

    // 1. Reserve stock atomically. MongoDB multi-document transactions need a replica set,
    //    so we use conditional updates plus a compensating rollback instead.
    const reserved: { productId: string; qty: number }[] = [];
    let order!: OrderDocument;
    let planId: string | undefined;
    try {
      for (const l of lines.filter((x) => x.trackStock)) {
        const ok = await this.products.decrementStock(user.tenantId, l.productId, l.qty);
        if (!ok) throw new ConflictException(`Not enough stock for "${l.name}"`);
        reserved.push({ productId: l.productId, qty: l.qty });
      }

      // 2. Save the order with its sequential invoice number.
      order = await this.orders.create({
        tenantId: oid(user.tenantId),
        idempotencyKey: dto.idempotencyKey, payments: dto.payments,
        cashierId: oid(user.userId),
        cashierName: user.name,
        invoiceNo: await this.nextInvoiceNo(tenant),
        items: calc.lines.map((l, i) => ({
          productId: oid(l.productId), name: l.name, qty: l.qty, unitPrice: l.unitPrice,
          discountPercent: l.discountPercent, discountAmount: l.discountAmount,
          taxPercent: l.taxPercent, taxAmount: l.taxAmount, lineTotal: l.lineTotal,
          stockTracked: lines[i].trackStock, serialNo: dto.items[i].serialNo,
        })),
        subtotal: calc.subtotal, discountTotal: calc.discountTotal, taxableTotal: calc.taxableTotal,
        taxTotal: calc.taxTotal, charges: calc.charges, chargesTotal: calc.chargesTotal,
        grandTotal: calc.grandTotal, taxBreakdown: calc.taxBreakdown,
        paymentMode: dto.paymentMode, customer: dto.customer, note: dto.note,
      });

      if (prepared) planId = (await this.installments.createForOrder(user, order, prepared)).id;
    } catch (err) {
      if (order?._id) await this.orders.deleteOne({ _id: order._id }); // plan failed: undo the sale too
      await Promise.all(reserved.map((r) => this.products.incrementStock(user.tenantId, r.productId, r.qty)));
      throw err;
    }

    // 3. Fire-and-forget: the cashier is not kept waiting for the PDF.
    try { await this.invoices.enqueue(order); }
    catch { await this.orders.updateOne({ _id: order._id }, { $set: { invoiceStatus: InvoiceStatus.Failed } }); order.invoiceStatus = InvoiceStatus.Failed; }
    return planId ? { ...order.toObject(), installmentPlanId: planId } : order;
  }

  async list(tenantId: string, page = 1, limit = 20, cashierId?: string) {
    const filter = { tenantId: oid(tenantId), ...(cashierId ? { cashierId: oid(cashierId) } : {}) };
    const [data, total] = await Promise.all([
      this.orders.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
      this.orders.countDocuments(filter),
    ]);
    await this.invoices.hydrate(tenantId, data);
    return { data, total, page, limit };
  }

  async findOne(tenantId: string, id: string, cashierId?: string): Promise<OrderDocument> {
    const order = await this.orders.findOne({ _id: id, tenantId: oid(tenantId), ...(cashierId ? { cashierId: oid(cashierId) } : {}) });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  /** Cancels a completed sale and puts the stock back. */
  async voidOrder(tenantId: string, id: string): Promise<OrderDocument> {
    let order = await this.findOne(tenantId, id);
    if (order.paymentMode === PaymentMode.Installment) {
      throw new BadRequestException('Installment sales cannot be voided here. Handle returns manually with the owner.');
    }
    if (order.status === OrderStatus.Refunded) throw new ConflictException('Refunded orders cannot be voided');
    order = await this.orders.findOneAndUpdate({ _id: id, tenantId: oid(tenantId), status: { $in: [OrderStatus.Completed, OrderStatus.Voided] } }, { $set: { status: OrderStatus.Voided, voidedAt: order.voidedAt ?? new Date() } }, { new: true }) as OrderDocument;
    if (!order) throw new ConflictException('Order status changed');
    await Promise.all(
      order.items.filter((i) => i.stockTracked)
        .map((i, index) => this.products.restoreSaleStockOnce(tenantId, i.productId.toString(), i.qty, `reverse:${order.id}:${index}`)),
    );
    return order;
  }

  async refund(user: AuthUser, id: string, reason: string) {
    let order = await this.findOne(user.tenantId, id);
    if (order.paymentMode === PaymentMode.Installment) throw new BadRequestException('Installment returns require an agreement settlement');
    if (order.status === OrderStatus.Voided) throw new ConflictException('Voided orders cannot be refunded');
    order = await this.orders.findOneAndUpdate({ _id: id, tenantId: oid(user.tenantId), status: OrderStatus.Completed }, { $set: { status: OrderStatus.Refunded, refund: { reason: reason.trim(), amount: order.grandTotal, approvedBy: user.userId, refundedAt: new Date() } } }, { new: true }) ?? await this.findOne(user.tenantId, id);
    if (order.status !== OrderStatus.Refunded) throw new ConflictException('Order status changed');
    await Promise.all(order.items.filter((item) => item.stockTracked).map((item, index) => this.products.restoreSaleStockOnce(user.tenantId, item.productId.toString(), item.qty, `reverse:${order.id}:${index}`)));
    return order;
  }

  async summary(tenantId: string, days = 7) {
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - (days - 1));
    const match = { tenantId: oid(tenantId), status: OrderStatus.Completed, createdAt: { $gte: since } };
    const timezone = this.config.get<string>('REPORT_TZ', 'UTC');

    const [totals, daily, top] = await Promise.all([
      this.orders.aggregate([
        { $match: match },
        { $group: { _id: null, revenue: { $sum: '$grandTotal' }, orders: { $sum: 1 }, tax: { $sum: '$taxTotal' }, discounts: { $sum: '$discountTotal' } } },
      ]),
      this.orders.aggregate([
        { $match: match },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone } }, revenue: { $sum: '$grandTotal' }, orders: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      this.orders.aggregate([
        { $match: match },
        { $unwind: '$items' },
        { $group: { _id: '$items.productId', name: { $first: '$items.name' }, qty: { $sum: '$items.qty' }, revenue: { $sum: '$items.lineTotal' } } },
        { $sort: { revenue: -1 } },
        { $limit: 5 },
      ]),
    ]);

    const round = (n: number) => Math.round(n * 100) / 100;
    const t = totals[0] ?? { revenue: 0, orders: 0, tax: 0, discounts: 0 };
    return {
      days,
      revenue: round(t.revenue), orders: t.orders, tax: round(t.tax), discounts: round(t.discounts),
      daily: daily.map((d) => ({ date: d._id as string, revenue: round(d.revenue), orders: d.orders as number })),
      topProducts: top.map((p) => ({ productId: String(p._id), name: p.name as string, qty: p.qty as number, revenue: round(p.revenue) })),
    };
  }

  // ---------- helpers ----------

  private async buildLines(tenantId: string, items: OrderItemDto[]): Promise<{ tenant: TenantDocument; lines: Line[] }> {
    const tenant = await this.tenants.findById(tenantId);
    const found = await this.products.findManyByIds(tenantId, [...new Set(items.map((i) => i.productId))]);
    const byId = new Map(found.map((p) => [p.id, p]));
    const lines = items.map((item): Line => {
      const p = byId.get(item.productId);
      if (!p || !p.isActive) throw new BadRequestException(`Product ${item.productId} is unavailable`);
      return {
        productId: p.id, name: p.name, unitPrice: p.price, qty: item.qty,
        discountPercent: item.discountPercent ?? 0, taxClass: p.taxClass, trackStock: p.trackStock,
      };
    });
    return { tenant, lines };
  }

  private async nextInvoiceNo(tenant: TenantDocument): Promise<string> {
    const year = new Date().getFullYear();
    const counter = await this.counters.findOneAndUpdate(
      { tenantId: tenant._id, year },
      { $inc: { lastNumber: 1 } },
      { upsert: true, new: true },
    );
    return `${tenant.invoicePrefix}-${year}-${String(counter.lastNumber).padStart(6, '0')}`;
  }
}

export { InvoiceStatus };
