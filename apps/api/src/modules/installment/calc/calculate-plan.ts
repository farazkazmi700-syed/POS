export class PlanInputError extends Error {}

export interface PlanInput {
  cashTotal: number;
  downPayment: number;
  months: number;
  markupPercent: number;
  /** YYYY-MM-DD */
  firstDueDate: string;
}
export interface PlanScheduleRow { no: number; dueDate: string; amount: number }
export interface PlanResult {
  cashTotal: number;
  downPayment: number;
  markupPercent: number;
  markupAmount: number;
  totalPayable: number;
  financedAmount: number;
  months: number;
  monthlyAmount: number;
  firstDueDate: string;
  schedule: PlanScheduleRow[];
}

const toMinor = (n: number) => Math.round(n * 100);
const toMajor = (n: number) => n / 100;

/**
 * Installment price = cash price + markup% (on the whole cash price).
 * financed = installment price - down payment, split over `months`.
 * The monthly amount is rounded UP to a whole currency unit (easier to collect);
 * the last instalment absorbs the difference so the schedule always adds up exactly.
 * To use a different pricing rule, change this function only.
 */
export function calculatePlan(i: PlanInput): PlanResult {
  if (!Number.isInteger(i.months) || i.months < 1 || i.months > 60) {
    throw new PlanInputError('Months must be a whole number between 1 and 60');
  }
  if (i.downPayment < 0) throw new PlanInputError('Down payment cannot be negative');
  if (i.markupPercent < 0 || i.markupPercent > 100) throw new PlanInputError('Markup must be between 0 and 100 percent');

  const cash = toMinor(i.cashTotal);
  const down = toMinor(i.downPayment);
  if (cash <= 0) throw new PlanInputError('The cart total must be above zero');
  if (down >= cash) throw new PlanInputError('Down payment must be less than the cash price');

  const markup = Math.round((cash * i.markupPercent) / 100);
  const total = cash + markup;
  const financed = total - down;

  let base: number;
  let last: number;
  if (i.months === 1) {
    base = financed;
    last = financed;
  } else {
    base = Math.ceil(financed / i.months / 100) * 100;
    last = financed - base * (i.months - 1);
    if (last <= 0) { // tiny balance over many months: fall back to exact division
      base = Math.floor(financed / i.months);
      last = financed - base * (i.months - 1);
    }
    if (base <= 0) throw new PlanInputError('The financed amount is too small for this many months');
  }

  const schedule: PlanScheduleRow[] = [];
  for (let n = 1; n <= i.months; n++) {
    schedule.push({ no: n, dueDate: addMonths(i.firstDueDate, n - 1), amount: toMajor(n === i.months ? last : base) });
  }

  return {
    cashTotal: toMajor(cash), downPayment: toMajor(down), markupPercent: i.markupPercent,
    markupAmount: toMajor(markup), totalPayable: toMajor(total), financedAmount: toMajor(financed),
    months: i.months, monthlyAmount: toMajor(base), firstDueDate: i.firstDueDate, schedule,
  };
}

/** Adds calendar months to a YYYY-MM-DD date, clamping to the end of shorter months (31 Jan + 1 = 28/29 Feb). */
export function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

// ---------- collecting payments ----------

export type ScheduleStatus = 'pending' | 'partial' | 'paid';
export interface ScheduleItem { no: number; dueDate: string; amount: number; paidAmount: number; status: ScheduleStatus }

/** Applies a payment to the oldest unpaid instalments first. Throws if it exceeds what is owed. */
export function allocatePayment(schedule: ScheduleItem[], amount: number): ScheduleItem[] {
  let left = toMinor(amount);
  if (left <= 0) throw new PlanInputError('Payment must be above zero');
  const out = schedule.map((s) => ({ ...s }));
  for (const s of out) {
    const remaining = toMinor(s.amount) - toMinor(s.paidAmount);
    if (remaining <= 0) continue;
    const pay = Math.min(left, remaining);
    const paid = toMinor(s.paidAmount) + pay;
    s.paidAmount = toMajor(paid);
    s.status = paid >= toMinor(s.amount) ? 'paid' : 'partial';
    left -= pay;
    if (left === 0) break;
  }
  if (left > 0) throw new PlanInputError('Payment is more than the remaining balance');
  return out;
}

/** Today as YYYY-MM-DD in the shop's timezone. */
export function todayIn(timeZone: string, now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function overdueOf(schedule: ScheduleItem[], today: string): { amount: number; count: number } {
  let minor = 0;
  let count = 0;
  for (const s of schedule) {
    const remaining = toMinor(s.amount) - toMinor(s.paidAmount);
    if (remaining > 0 && s.dueDate < today) { minor += remaining; count++; }
  }
  return { amount: toMajor(minor), count };
}

export function nextDueOf(schedule: ScheduleItem[]): { dueDate: string; amount: number } | null {
  const s = schedule.find((x) => toMinor(x.amount) - toMinor(x.paidAmount) > 0);
  return s ? { dueDate: s.dueDate, amount: toMajor(toMinor(s.amount) - toMinor(s.paidAmount)) } : null;
}
