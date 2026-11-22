import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { OrderStatus, PaymentMode } from '../../common/enums';
import { oid } from '../../common/object-id';
import { Order, OrderDocument } from '../order/schemas/order.schema';

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_RANGE_DAYS = 366;

const parseYmd = (ymd: string, endOfDay = false): Date => {
  const [y, m, d] = ymd.split('-').map(Number);
  return endOfDay ? new Date(y, m - 1, d, 23, 59, 59, 999) : new Date(y, m - 1, d, 0, 0, 0, 0);
};

const toYmd = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const round = (n: number): number => Math.round(n * 100) / 100;

/** Sales report over an explicit calendar range (revenue, daily trend, top products, payment modes). */
@Injectable()
export class ReportService {
  constructor(
    @InjectModel(Order.name) private readonly orders: Model<OrderDocument>,
    private readonly config: ConfigService,
  ) {}

  async salesReport(tenantId: string, from?: string, to?: string) {
    const timezone = this.config.get<string>('REPORT_TZ', 'UTC');
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const endYmd = to ?? toYmd(today);
    const end = parseYmd(endYmd, true);
    // default window: the 7 calendar days ending on "to"
    const startDay = from ? parseYmd(from) : new Date(end.getFullYear(), end.getMonth(), end.getDate() - 6, 0, 0, 0, 0);

    if (Number.isNaN(startDay.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException('from/to must be valid YYYY-MM-DD dates');
    }
    if (startDay.getTime() > end.getTime()) throw new BadRequestException('"from" must not be after "to"');
    if ((end.getTime() - startDay.getTime()) / DAY_MS + 1 > MAX_RANGE_DAYS) {
      throw new BadRequestException(`Report range must not exceed ${MAX_RANGE_DAYS} days`);
    }

    const match = {
      tenantId: oid(tenantId),
      status: OrderStatus.Completed,
      createdAt: { $gte: startDay, $lte: end },
    };

    const [totals, daily, top, modes] = await Promise.all([
      this.orders.aggregate([
        { $match: match },
        {
          $group: {
            _id: null,
            revenue: { $sum: '$grandTotal' },
            orders: { $sum: 1 },
            tax: { $sum: '$taxTotal' },
            discounts: { $sum: '$discountTotal' },
            itemsSold: { $sum: { $sum: '$items.qty' } },
          },
        },
      ]),
      this.orders.aggregate([
        { $match: match },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone } },
            revenue: { $sum: '$grandTotal' },
            orders: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      this.orders.aggregate([
        { $match: match },
        { $unwind: '$items' },
        {
          $group: {
            _id: '$items.productId',
            name: { $first: '$items.name' },
            qty: { $sum: '$items.qty' },
            revenue: { $sum: '$items.lineTotal' },
          },
        },
        { $sort: { revenue: -1 } },
        { $limit: 10 },
      ]),
      this.orders.aggregate([
        { $match: match },
        { $group: { _id: '$paymentMode', orders: { $sum: 1 }, revenue: { $sum: '$grandTotal' } } },
        { $sort: { revenue: -1 } },
      ]),
    ]);

    const t = totals[0] ?? { revenue: 0, orders: 0, tax: 0, discounts: 0, itemsSold: 0 };
    const revenue = round(t.revenue);
    const orders = t.orders as number;
    return {
      from: toYmd(startDay),
      to: toYmd(end),
      revenue,
      orders,
      tax: round(t.tax),
      discounts: round(t.discounts),
      itemsSold: t.itemsSold as number,
      averageOrder: orders ? round(revenue / orders) : 0,
      daily: daily.map((d) => ({ date: d._id as string, revenue: round(d.revenue), orders: d.orders as number })),
      topProducts: top.map((p) => ({
        productId: String(p._id), name: p.name as string, qty: p.qty as number, revenue: round(p.revenue),
      })),
      paymentModes: modes.map((m) => ({
        mode: m._id as PaymentMode, orders: m.orders as number, revenue: round(m.revenue),
      })),
    };
  }
}