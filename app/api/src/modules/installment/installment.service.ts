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
import { matchPaymentRetry } from './calc/payment-idempotency';
import { toMinor, percentCharge } from './calc/money';
import {
  CreateInstallmentProductDto,
  CreateInstallmentSaleDto,
  QueryInstallmentProductsDto,
  QueryInstallmentSalesDto,
  QuoteDto,
  RecordInstallmentSalePaymentDto,
  RecordPaymentDto,
  UpdateInstallmentProductDto,
  QueryInstallmentsDto,
  InstallmentTermsDto,
} from './dto/installment.dto';
import { InstallmentPlan, InstallmentPlanDocument } from './schemas/installment-plan.schema';
import { InstallmentProduct, InstallmentProductDocument } from './schemas/installment-product.schema';
import { InstallmentSale, InstallmentSaleDocument } from './schemas/installment-sale.schema';

export interface PreparedPlan {
  customer: CustomerDocument;
  terms: InstallmentTermsDto;
  plan: PlanResult;
}

const minor = (n: number) => { try { return toMinor(n); } catch (error) { throw new BadRequestException((error as Error).message); } };
const major = (n: number) => n / 100;

@Injectable()
export class InstallmentService {
  private readonly tz: string;

  constructor(
    @InjectModel(InstallmentPlan.name) private readonly model: Model<InstallmentPlan>,
    @InjectModel(InstallmentProduct.name) private readonly productModel: Model<InstallmentProduct>,
    @InjectModel(InstallmentSale.name) private readonly saleModel: Model<InstallmentSale>,
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
      items: order.items.map((i) => ({ name: i.name, qty: i.qty, serialNo: i.serialNo, unitPrice: i.unitPrice, discountAmount: i.discountAmount, taxAmount: i.taxAmount, lineTotal: i.lineTotal })),
      cashTotal: plan.cashTotal, downPayment: plan.downPayment, markupPercent: plan.markupPercent,
      markupAmount: plan.markupAmount, totalPayable: plan.totalPayable, financedAmount: plan.financedAmount,
      months: plan.months, monthlyAmount: plan.monthlyAmount, firstDueDate: plan.firstDueDate,
      schedule: plan.schedule.map((s) => ({ ...s, paidAmount: 0, status: 'pending' as const })),
      payments, paidTotal: plan.downPayment, balance: plan.financedAmount, status: PlanStatus.Active,
      createdByName: user.name,
    });
  }

  async listProducts(tenantId: string, q: QueryInstallmentProductsDto) {
    const filter: Record<string, unknown> = { tenantId: oid(tenantId) };
    if (q.status) filter.status = q.status;
    if (q.q) {
      const rx = new RegExp(escapeRegex(q.q), 'i');
      filter.$or = [{ name: rx }, { brand: rx }, { model: rx }, { description: rx }, { installmentProductId: rx }];
    }
    const page = q.page ?? 1;
    const limit = q.limit ?? 20;
    const [data, total] = await Promise.all([
      this.productModel.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
      this.productModel.countDocuments(filter),
    ]);
    return { data, total, page, limit };
  }

  async createProduct(tenantId: string, dto: CreateInstallmentProductDto): Promise<InstallmentProductDocument> {
    const installmentProductId = this.makeId('IPD');
    const product = await this.productModel.create({
      ...dto,
      tenantId: oid(tenantId),
      installmentProductId,
      status: dto.status ?? 'active',
      isActive: true,
    });
    return product;
  }

  async findProduct(tenantId: string, id: string): Promise<InstallmentProductDocument> {
    const product = await this.productModel.findOne({ _id: id, tenantId: oid(tenantId) });
    if (!product) throw new NotFoundException('Installment product not found');
    return product;
  }

  async updateProduct(tenantId: string, id: string, dto: UpdateInstallmentProductDto): Promise<InstallmentProductDocument> {
    const productDoc = await this.productModel.findOne({ _id: id, tenantId: oid(tenantId) });
    if (!productDoc) throw new NotFoundException('Installment product not found');
    if (dto.status) productDoc.status = dto.status;
    if (dto.isActive !== undefined) productDoc.isActive = dto.isActive;
    if (dto.name !== undefined) productDoc.name = dto.name;
    if (dto.brand !== undefined) productDoc.brand = dto.brand;
    if (dto.model !== undefined) productDoc.set('model', dto.model);
    if (dto.category !== undefined) productDoc.category = dto.category;
    if (dto.description !== undefined) productDoc.description = dto.description;
    if (dto.imageUrl !== undefined) productDoc.imageUrl = dto.imageUrl;
    if (dto.actualPrice !== undefined) productDoc.actualPrice = dto.actualPrice;
    if (dto.defaultCommissionRate !== undefined) productDoc.defaultCommissionRate = dto.defaultCommissionRate;
    if (dto.metadata !== undefined) productDoc.set('metadata', dto.metadata);
    await productDoc.save();
    return productDoc;
  }

  async removeProduct(tenantId: string, id: string) {
    const product = await this.productModel.findOne({ _id: id, tenantId: oid(tenantId) });
    if (!product) throw new NotFoundException('Installment product not found');
    product.isActive = false;
    product.status = 'archived';
    await product.save();
    return { deleted: true };
  }

  async listSales(tenantId: string, q: QueryInstallmentSalesDto) {
    const filter: Record<string, unknown> = { tenantId: oid(tenantId) };
    const mode = q.filter ?? 'active';
    if (mode === 'active') filter.saleStatus = { $in: ['active', 'pending', 'overdue'] };
    if (mode === 'completed') filter.saleStatus = 'completed';
    if (mode === 'overdue') filter.saleStatus = 'overdue';
    if (q.customerId) filter.customerId = oid(q.customerId);
    if (q.q) {
      const rx = new RegExp(escapeRegex(q.q), 'i');
      filter.$or = [{ agreementId: rx }, { installmentSaleId: rx }, { 'metadata.name': rx }];
    }
    const page = q.page ?? 1;
    const limit = q.limit ?? 20;
    const [data, total] = await Promise.all([
      this.saleModel.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
      this.saleModel.countDocuments(filter),
    ]);
    return { data, total, page, limit };
  }

  async findSale(tenantId: string, id: string): Promise<InstallmentSaleDocument> {
    const sale = await this.saleModel.findOne({ _id: id, tenantId: oid(tenantId) });
    if (!sale) throw new NotFoundException('Installment sale not found');
    return sale;
  }

  async createSale(user: AuthUser, dto: CreateInstallmentSaleDto): Promise<InstallmentSaleDocument> {
    const product = await this.productModel.findOne({ _id: dto.installmentProductId, tenantId: oid(user.tenantId), isActive: true });
    if (!product) throw new NotFoundException('Installment product not found or inactive');
    await this.customers.findOne(user.tenantId, dto.customerId);
    const actualPrice = dto.actualPrice ?? product.actualPrice;
    if (actualPrice <= 0) throw new BadRequestException('Actual product price must be greater than zero');
    const advancePayment = dto.advancePayment ?? 0;
    const commissionRate = dto.commissionRate ?? product.defaultCommissionRate;
    if (advancePayment > actualPrice) throw new BadRequestException('Down payment cannot exceed the cash price');
    // Interest is charged only after a down payment is received; with nothing paid yet the
    // cash price is financed as-is and the whole balance is split over the installments.
    const commissionAmount = advancePayment > 0
      ? major(percentCharge(minor(actualPrice) - minor(advancePayment), commissionRate))
      : 0;
    const totalMinor = minor(actualPrice) + minor(commissionAmount);
    if (!Number.isSafeInteger(totalMinor)) throw new BadRequestException('Total exceeds supported precision');
    const totalInstallmentPrice = major(totalMinor);
    const remainingBalance = major(totalMinor - minor(advancePayment));
    if (remainingBalance < 0) throw new BadRequestException('Advance payment cannot exceed the invoice total');
    const duration = dto.installmentDuration ?? 12;
    if (!Number.isInteger(duration) || duration < 1 || duration > 120) {
      throw new BadRequestException('Installment duration must be a whole number between 1 and 120');
    }
    const paymentFrequency = dto.paymentFrequency ?? 'monthly';
    const saleDate = dto.saleDate ?? todayIn(this.tz);
    try { addMonths(saleDate, 0); } catch { throw new BadRequestException('Invalid sale date'); }

    const installmentIdPrefix = this.makeId('ISL');
    const schedule = Array.from({ length: duration }, (_, idx) => {
      const installmentId = `${installmentIdPrefix}-${idx + 1}`;
      const dueDate = this.nextDueDate(saleDate, idx + 1, paymentFrequency);
      const baseAmount = Math.floor(minor(remainingBalance) / duration);
      const expectedAmount = major(idx === duration - 1 ? minor(remainingBalance) - baseAmount * (duration - 1) : baseAmount);
      return {
        installmentId,
        dueDate,
        expectedAmount,
        amountPaid: 0,
        remainingAmount: expectedAmount,
        status: 'pending' as const,
      };
    });

    const paymentId = this.makeId('PMT');
    const receiptNo = `RCPT-${this.makeId('R')}`;
    // The down payment settles at the sale, so it is not attached to any installment row.
    const sale = await this.saleModel.create({
      tenantId: oid(user.tenantId),
      installmentSaleId: this.makeId('SAL'),
      agreementId: this.makeId('AGR'),
      customerId: oid(dto.customerId),
      installmentProductId: oid(dto.installmentProductId),
      saleDate,
      actualPrice,
      advancePayment,
      commissionRate,
      commissionAmount,
      totalInstallmentPrice,
      installmentDuration: duration,
      paymentFrequency,
      outstandingBalance: remainingBalance,
      totalPaid: advancePayment,
      saleStatus: remainingBalance > 0 ? 'active' : 'completed',
      schedule,
      payments: advancePayment > 0 ? [{
        paymentId,
        amount: advancePayment,
        paidAt: new Date(),
        mode: dto.advancePaymentMode ?? 'cash',
        note: 'Down payment',
        receiptNo,
        receivedBy: user.userId,
      }] : [],
      isActive: true,
      metadata: { productName: product.name, productBrand: product.brand ?? '', productModel: product.model ?? '' },
    });
    return sale;
  }

  async recordSalePayment(user: AuthUser, id: string, dto: RecordInstallmentSalePaymentDto): Promise<InstallmentSaleDocument> {
    const sale = await this.findSale(user.tenantId, id);
    const previous = matchPaymentRetry(sale.payments, dto);
    if (previous && ('conflict' in previous || previous.payment.requestedInstallmentId !== dto.installmentId)) throw new ConflictException('Payment request key already used with different details');
    if (previous) return sale;
    if (!sale.isActive || sale.saleStatus === 'cancelled') throw new BadRequestException('This installment sale is not active');
    const amount = minor(dto.amount);
    if (amount <= 0 || amount > minor(sale.outstandingBalance)) throw new BadRequestException('Payment must be positive and cannot exceed the remaining balance');
    const remaining = major(minor(sale.outstandingBalance) - amount);
    const paymentId = this.makeId('PMT');
    const receiptNo = `RCPT-${this.makeId('R')}`;
    const installmentId = dto.installmentId ?? sale.schedule.find((entry) => entry.status !== 'paid')?.installmentId;
    if (dto.installmentId && !sale.schedule.some((entry) => entry.installmentId === dto.installmentId)) throw new BadRequestException('Installment does not belong to this sale');

    let allocationLeft = amount;
    for (const entry of sale.schedule) {
      if (allocationLeft <= 0) break;
      if (entry.status === 'paid') continue;
      const payable = Math.min(allocationLeft, minor(entry.remainingAmount));
      entry.amountPaid = major(minor(entry.amountPaid) + payable);
      entry.remainingAmount = major(minor(entry.remainingAmount) - payable);
      entry.status = entry.remainingAmount <= 0 ? 'paid' : 'partial';
      allocationLeft -= payable;
    }

    if (allocationLeft !== 0) throw new ConflictException('Schedule and balance are inconsistent; payment was not posted');
    sale.totalPaid = major(minor(sale.totalPaid) + amount);
    sale.outstandingBalance = remaining;
    sale.saleStatus = sale.outstandingBalance <= 0 ? 'completed' : sale.schedule.some((entry) => entry.remainingAmount > 0 && entry.dueDate < todayIn(this.tz)) ? 'overdue' : 'active';
    const payment = {
      paymentId,
      installmentId,
      requestedInstallmentId: dto.installmentId,
      idempotencyKey: dto.idempotencyKey,
      receivedBy: user.userId,
      amount: dto.amount,
      paidAt: new Date(),
      mode: dto.mode,
      note: dto.note,
      receiptNo,
    };
    const filter: Record<string, unknown> = { _id: sale._id, tenantId: oid(user.tenantId), isActive: true, saleStatus: { $ne: 'cancelled' },
      ...(sale.paymentRevision ? { paymentRevision: sale.paymentRevision } : { $or: [{ paymentRevision: 0 }, { paymentRevision: { $exists: false } }] }) };
    if (dto.idempotencyKey) filter['payments.idempotencyKey'] = { $ne: dto.idempotencyKey };
    // Schedule, totals, actor-bearing immutable ledger append and revision commit in one MongoDB document transaction.
    const updated = await this.saleModel.findOneAndUpdate(filter, {
      $set: { schedule: sale.schedule, totalPaid: sale.totalPaid, outstandingBalance: remaining, saleStatus: sale.saleStatus },
      $push: { payments: payment }, $inc: { paymentRevision: 1 },
    }, { new: true, runValidators: true });
    if (updated) return updated;
    const latest = await this.findSale(user.tenantId, id);
    const repeated = matchPaymentRetry(latest.payments, dto);
    if (repeated && 'payment' in repeated && repeated.payment.requestedInstallmentId === dto.installmentId) return latest;
    throw new ConflictException('Payment changed concurrently or retry key conflicts; reload before retrying');
  }

  async dashboard(tenantId: string) {
    const [products, sales] = await Promise.all([
      this.productModel.find({ tenantId: oid(tenantId) }),
      this.saleModel.find({ tenantId: oid(tenantId) }),
    ]);
    const today = new Date();
    const stats = {
      totalProducts: products.length,
      totalSales: sales.length,
      contractValue: sales.reduce((sum, sale) => sum + Number(sale.totalInstallmentPrice || 0), 0),
      advancePayments: sales.reduce((sum, sale) => sum + Number(sale.advancePayment || 0), 0),
      installmentCollections: sales.reduce((sum, sale) => sum + sale.payments.reduce((inner, payment) => inner + Number(payment.amount || 0), 0), 0),
      outstandingReceivables: sales.reduce((sum, sale) => sum + Number(sale.outstandingBalance || 0), 0),
      overdueBalances: sales.reduce((sum, sale) => {
        const overdue = sale.schedule.filter((entry) => entry.status !== 'paid' && new Date(entry.dueDate) < today).reduce((acc, entry) => acc + Number(entry.remainingAmount || 0), 0);
        return sum + overdue;
      }, 0),
      upcomingInstallments: sales.reduce((sum, sale) => sum + sale.schedule.filter((entry) => entry.status !== 'paid' && new Date(entry.dueDate) >= today).length, 0),
      completedAgreements: sales.filter((sale) => sale.saleStatus === 'completed').length,
    };
    return stats;
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
    const previousPayment = matchPaymentRetry(plan.payments, dto);
    if (previousPayment && 'conflict' in previousPayment) {
        throw new ConflictException('This payment request key was already used with different details');
    }
    if (previousPayment) return { payment: previousPayment.payment, plan: this.view(plan, todayIn(this.tz)) };
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
      idempotencyKey: dto.idempotencyKey,
      amount: dto.amount, paidAt: new Date(), mode: dto.mode as PaymentMode, receivedBy: user.name, note: dto.note,
    };
    // Conditional on the old paidTotal: two cashiers collecting at the same moment cannot both win.
    const filter: Record<string, unknown> = {
      _id: plan._id, tenantId: oid(user.tenantId), paidTotal: plan.paidTotal,
    };
    if (dto.idempotencyKey) filter['payments.idempotencyKey'] = { $ne: dto.idempotencyKey };
    const res = await this.model.updateOne(
      filter,
      {
        $set: { schedule, paidTotal, balance, status: balance <= 0 ? PlanStatus.Completed : PlanStatus.Active },
        $push: { payments: payment },
      },
    );
    if (res.modifiedCount !== 1) {
      if (dto.idempotencyKey) {
        const latest = await this.findPlan(user.tenantId, id);
        const repeatedPayment = matchPaymentRetry(latest.payments, dto);
        if (repeatedPayment && 'conflict' in repeatedPayment) {
            throw new ConflictException('This payment request key was already used with different details');
        }
        if (repeatedPayment) return { payment: repeatedPayment.payment, plan: this.view(latest, todayIn(this.tz)) };
      }
      throw new ConflictException('This plan was just updated by someone else. Reload and try again.');
    }
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

  private makeId(prefix: string): string {
    const rand = Math.random().toString(36).slice(2, 10).toUpperCase();
    const stamp = Date.now().toString(36).toUpperCase();
    return `${prefix}-${stamp}-${rand}`;
  }

  private nextDueDate(date: string, offset: number, frequency: 'monthly' | 'weekly' | 'biweekly'): string {
    if (frequency === 'monthly') return addMonths(date, offset);
    const start = new Date(`${date}T12:00:00Z`);
    const days = frequency === 'weekly' ? 7 : frequency === 'biweekly' ? 14 : 30;
    const next = new Date(start);
    next.setUTCDate(start.getUTCDate() + (offset * days));
    return next.toISOString().slice(0, 10);
  }

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

  /** Snapshot of a plan ready for invoice rendering (includes remaining balance). */
  async invoiceView(tenantId: string, id: string) {
    const plan = await this.findOne(tenantId, id);
    const paidTotal = plan.paidTotal;
    const remaining = Math.max(0, Number((plan.totalPayable - paidTotal).toFixed(2)));
    return {
      ...plan,
      paidTotal,
      remainingBalance: remaining,
      isFullyPaid: remaining <= 0,
      paidPercent: plan.totalPayable > 0 ? Math.round((paidTotal / plan.totalPayable) * 100) : 0,
    };
  }
}
