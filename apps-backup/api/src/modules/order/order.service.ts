import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuthUser } from '../../common/auth-user';
import { InvoiceStatus, OrderStatus } from '../../common/enums';
import { oid } from '../../common/object-id';
import { InvoiceService } from '../invoice/invoice.service';
import { ProductService } from '../product/product.service';
import { TenantDocument } from '../tenant/schemas/tenant.schema';
import { TenantService } from '../tenant/tenant.service';
import { CalcLineInput, calculateTotals } from './calc/calculate-totals';
import { CreateOrderDto, OrderItemDto, PreviewOrderDto } from './dto/order.dto';
import { InvoiceCounter } from './schemas/invoice-counter.schema';
import { Order, OrderDocument } from './schemas/order.schema';

type Line = CalcLineInput & { trackStock: boolean };

@Injectable()
export class OrderService {
  constructor(
    @InjectModel(Order.name) private readonly orders: Model<Order>,
    @InjectModel(InvoiceCounter.name) private readonly counters: Model<InvoiceCounter>,
    private readonly products: ProductService,
    private readonly tenants: TenantService,
    private readonly invoices: InvoiceService,
    private readonly config: ConfigService,
  ) {}

  /** Totals for the cart screen. Same code path as checkout, so the UI never disagrees with the receipt. */
  async preview(tenantId: string, dto: PreviewOrderDto) {
    const { tenant, lines } = await this.buildLines(tenantId, dto.items);
    return calculateTotals(lines, tenant.taxProfile);
  }

  async create(user: AuthUser, dto: CreateOrderDto): Promise<OrderDocument> {
    const { tenant, lines } = await this.buildLines(user.tenantId, dto.items);
    const calc = calculateTotals(lines, tenant.taxProfile);

    // 1. Reserve stock atomically. MongoDB multi-document transactions need a replica set,
    //    so we use conditional updates plus a compensating rollback instead.
    const reserved: { productId: string; qty: number }[] = [];
    let order: OrderDocument;
    try {
      for (const l of lines.filter((x) => x.trackStock)) {
        const ok = await this.products.decrementStock(user.tenantId, l.productId, l.qty);
        if (!ok) throw new ConflictException(`Not enough stock for "${l.name}"`);
        reserved.push({ productId: l.productId, qty: l.qty });
      }

      // 2. Save the order with its sequential invoice number.
      order = await this.orders.create({
        tenantId: oid(user.tenantId),
        cashierId: oid(user.userId),
        cashierName: user.name,
        invoiceNo: await this.nextInvoiceNo(tenant),
        items: calc.lines.map((l, i) => ({
          productId: oid(l.productId), name: l.name, qty: l.qty, unitPrice: l.unitPrice,
          discountPercent: l.discountPercent, discountAmount: l.discountAmount,
          taxPercent: l.taxPercent, taxAmount: l.taxAmount, lineTotal: l.lineTotal,
          stockTracked: lines[i].trackStock,
        })),
        subtotal: calc.subtotal, discountTotal: calc.discountTotal, taxableTotal: calc.taxableTotal,
        taxTotal: calc.taxTotal, charges: calc.charges, chargesTotal: calc.chargesTotal,
        grandTotal: calc.grandTotal, taxBreakdown: calc.taxBreakdown,
        paymentMode: dto.paymentMode, customer: dto.customer, note: dto.note,
      });
    } catch (err) {
      await Promise.all(reserved.map((r) => this.products.incrementStock(user.tenantId, r.productId, r.qty)));
      throw err;
    }

    // 3. Fire-and-forget: the cashier is not kept waiting for the PDF.
    await this.invoices.enqueue(order);
    return order;
  }

  async list(tenantId: string, page = 1, limit = 20) {
    const filter = { tenantId: oid(tenantId) };
    const [data, total] = await Promise.all([
      this.orders.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
      this.orders.countDocuments(filter),
    ]);
    return { data, total, page, limit };
  }

  async findOne(tenantId: string, id: string): Promise<OrderDocument> {
    const order = await this.orders.findOne({ _id: id, tenantId: oid(tenantId) });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  /** Cancels a completed sale and puts the stock back. */
  async voidOrder(tenantId: string, id: string): Promise<OrderDocument> {
    const order = await this.findOne(tenantId, id);
    if (order.status === OrderStatus.Voided) throw new BadRequestException('Order is already voided');
    order.status = OrderStatus.Voided;
    order.voidedAt = new Date();
    await order.save();
    await Promise.all(
      order.items.filter((i) => i.stockTracked)
        .map((i) => this.products.incrementStock(tenantId, i.productId.toString(), i.qty)),
    );
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
