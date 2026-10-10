import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuthUser } from '../../common/auth-user';
import { PaymentMode, PlanStatus } from '../../common/enums';
import { escapeRegex, oid } from '../../common/object-id';
import { CustomerDocument } from '../customer/schemas/customer.schema';
import { CustomerService } from '../customer/customer.service';
import { OrderDocument } from '../order/schemas/order.schema';
import {
  addMonths, allocatePayment, calculatePlan, nextDueOf, overdueOf, PlanInputError, PlanResult, ScheduleItem, todayIn,
} from './calc/calculate-plan';
import { InstallmentTermsDto, QueryInstallmentsDto, QuoteDto, RecordPaymentDto } from './dto/installment.dto';
import { InstallmentPlan, InstallmentPlanDocument } from './schemas/installment-plan.schema';

export interface PreparedPlan {
  customer: CustomerDocument;
  terms: InstallmentTermsDto;
  plan: PlanResult;
}

const minor = (n: number) => Math.round(n * 100);
const major = (n: number) => n / 100;

@Injectable()
export class InstallmentService {
  private readonly tz: string;

  constructor(
    @InjectModel(InstallmentPlan.name) private readonly model: Model<InstallmentPlan>,
    private readonly customers: CustomerService,
    config: ConfigService,
  ) {
    this.tz = config.get<string>('REPORT_TZ', 'UTC');
  }

  /** Price a plan without saving anything (used by the checkout screen). */
  quote(dto: QuoteDto): PlanResult {
    return this.calc({ ...dto, firstDueDate: dto.firstDueDate ?? this.defaultFirstDue() });
  }

  /** Validate customer + terms BEFORE stock is reserved, so a bad request changes nothing. */
  async prepare(tenantId: string, terms: InstallmentTermsDto, cashTotal: number): Promise<PreparedPlan> {
    const customer = await this.customers.findOne(tenantId, terms.customerId);
    const plan = this.calc({
      cashTotal, downPayment: terms.downPayment, months: terms.months, markupPercent: terms.markupPercent,
      firstDueDate: terms.firstDueDate ?? this.defaultFirstDue(),
    });
    return { customer, terms, plan };
  }

  async createForOrder(user: AuthUser, order: OrderDocument, prep: PreparedPlan): Promise<InstallmentPlanDocument> {
    const { customer, terms, plan } = prep;
    const guarantor = terms.guarantor ?? customer.guarantor;
    const payments = plan.downPayment > 0
      ? [{
          receiptNo: `${order.invoiceNo}-R01`, amount: plan.downPayment, paidAt: new Date(),
          mode: (terms.downPaymentMode ?? 'cash') as PaymentMode, receivedBy: user.name, note: 'Down payment',
        }]
      : [];
    return this.model.create({
      tenantId: order.tenantId, orderId: order._id, invoiceNo: order.invoiceNo,
      customerId: customer._id, customerName: customer.name, customerPhone: customer.phone,
      customerCnic: customer.cnic, customerAddress: customer.address,
      guarantor: guarantor ? { name: guarantor.name, phone: guarantor.phone, cnic: guarantor.cnic, address: guarantor.address } : undefined,
      items: order.items.map((i) => ({ name: i.name, qty: i.qty, serialNo: i.serialNo })),
      cashTotal: plan.cashTotal, downPayment: plan.downPayment, markupPercent: plan.markupPercent,
      markupAmount: plan.markupAmount, totalPayable: plan.totalPayable, financedAmount: plan.financedAmount,
      months: plan.months, monthlyAmount: plan.monthlyAmount, firstDueDate: plan.firstDueDate,
      schedule: plan.schedule.map((s) => ({ ...s, paidAmount: 0, status: 'pending' as const })),
      payments, paidTotal: plan.downPayment, balance: plan.financedAmount, status: PlanStatus.Active,
      createdByName: user.name,
    });
  }

  async list(tenantId: string, q: QueryInstallmentsDto) {
    const filter: Record<string, unknown> = { tenantId: oid(tenantId) };
    const mode = q.filter ?? 'active';
    if (mode === 'active' || mode === 'overdue') filter.status = PlanStatus.Active;
    if (mode === 'completed') filter.status = PlanStatus.Completed;
    if (q.customerId) filter.customerId = oid(q.customerId);
    if (q.q) {
      const rx = new RegExp(escapeRegex(q.q), 'i');
      filter.$or = [{ customerName: rx }, { customerPhone: rx }, { invoiceNo: rx }];
    }
    const today = todayIn(this.tz);
    // Shop-scale data: load, compute overdue in memory, then paginate.
    const plans = await this.model.find(filter).sort({ createdAt: -1 }).limit(2000);
    let views = plans.map((p) => this.view(p, today));
    if (mode === 'overdue') views = views.filter((v) => v.overdueAmount > 0);
    const page = q.page ?? 1;
    const limit = q.limit ?? 20;
    return { data: views.slice((page - 1) * limit, page * limit), total: views.length, page, limit };
  }

  async findOne(tenantId: string, id: string) {
    return this.view(await this.findPlan(tenantId, id), todayIn(this.tz));
  }

  async recordPayment(user: AuthUser, id: string, dto: RecordPaymentDto) {
    const plan = await this.findPlan(user.tenantId, id);
    if (plan.status === PlanStatus.Completed) throw new BadRequestException('This plan is already fully paid');

    let schedule: ScheduleItem[];
    try {
      schedule = allocatePayment(this.items(plan), dto.amount);
    } catch (e) {
      if (e instanceof PlanInputError) throw new BadRequestException(e.message);
      throw e;
    }
    const paidTotal = major(minor(plan.paidTotal) + minor(dto.amount));
    const balance = major(minor(plan.totalPayable) - minor(paidTotal));
    const payment = {
      receiptNo: `${plan.invoiceNo}-R${String(plan.payments.length + 1).padStart(2, '0')}`,
      amount: dto.amount, paidAt: new Date(), mode: dto.mode as PaymentMode, receivedBy: user.name, note: dto.note,
    };
    // Conditional on the old paidTotal: two cashiers collecting at the same moment cannot both win.
    const res = await this.model.updateOne(
      { _id: plan._id, tenantId: oid(user.tenantId), paidTotal: plan.paidTotal },
      {
        $set: { schedule, paidTotal, balance, status: balance <= 0 ? PlanStatus.Completed : PlanStatus.Active },
        $push: { payments: payment },
      },
    );
    if (res.modifiedCount !== 1) throw new ConflictException('This plan was just updated by someone else. Reload and try again.');
    return { payment, plan: await this.findOne(user.tenantId, id) };
  }

  async stats(tenantId: string) {
    const today = todayIn(this.tz);
    const active = await this.model.find({ tenantId: oid(tenantId), status: PlanStatus.Active }).limit(5000);
    let outstanding = 0;
    let overdue = 0;
    let overduePlans = 0;
    for (const p of active) {
      outstanding += minor(p.balance);
      const o = overdueOf(this.items(p), today);
      if (o.amount > 0) { overdue += minor(o.amount); overduePlans++; }
    }
    const since = new Date(Date.now() - 36 * 3600 * 1000); // cheap pre-filter, exact check below
    const recent = await this.model.find({ tenantId: oid(tenantId), 'payments.paidAt': { $gte: since } });
    let collectedToday = 0;
    for (const p of recent) {
      for (const pay of p.payments) {
        if (todayIn(this.tz, pay.paidAt) === today) collectedToday += minor(pay.amount);
      }
    }
    return {
      activePlans: active.length, outstanding: major(outstanding), overdueAmount: major(overdue),
      overduePlans, collectedToday: major(collectedToday),
    };
  }

  // ---------- helpers ----------

  private async findPlan(tenantId: string, id: string): Promise<InstallmentPlanDocument> {
    const plan = await this.model.findOne({ _id: id, tenantId: oid(tenantId) });
    if (!plan) throw new NotFoundException('Installment plan not found');
    return plan;
  }

  private items(plan: InstallmentPlanDocument): ScheduleItem[] {
    return plan.schedule.map((s) => ({
      no: s.no, dueDate: s.dueDate, amount: s.amount, paidAmount: s.paidAmount, status: s.status,
    }));
  }

  private view(plan: InstallmentPlanDocument, today: string) {
    const o = overdueOf(this.items(plan), today);
    return {
      ...plan.toObject(),
      overdueAmount: o.amount,
      overdueCount: o.count,
      nextDue: plan.status === PlanStatus.Active ? nextDueOf(this.items(plan)) : null,
    };
  }

  private calc(input: Parameters<typeof calculatePlan>[0]): PlanResult {
    try {
      return calculatePlan(input);
    } catch (e) {
      if (e instanceof PlanInputError) throw new BadRequestException(e.message);
      throw e;
    }
  }

  private defaultFirstDue(): string {
    return addMonths(todayIn(this.tz), 1);
  }
}
