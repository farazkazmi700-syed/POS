import { addMonths, allocatePayment, calculatePlan, nextDueOf, overdueOf, PlanInputError, ScheduleItem } from './calculate-plan';

const base = { cashTotal: 60000, downPayment: 10000, months: 6, markupPercent: 10, firstDueDate: '2026-11-10' };

describe('calculatePlan', () => {
  it('adds markup to the cash price, subtracts the down payment, splits over the months', () => {
    const p = calculatePlan(base);
    expect(p.markupAmount).toBe(6000);
    expect(p.totalPayable).toBe(66000);
    expect(p.financedAmount).toBe(56000);
    expect(p.monthlyAmount).toBe(9334); // rounded up to a whole rupee
    expect(p.schedule).toHaveLength(6);
    expect(p.schedule[5].amount).toBe(9330); // last instalment absorbs the difference
  });

  it('schedule always adds up to the financed amount', () => {
    for (const months of [1, 2, 3, 5, 7, 11, 12, 18, 24]) {
      const p = calculatePlan({ ...base, cashTotal: 123457.89, downPayment: 20000.5, months, markupPercent: 12.5 });
      const sum = Math.round(p.schedule.reduce((a, r) => a + Math.round(r.amount * 100), 0));
      expect(sum).toBe(Math.round(p.financedAmount * 100));
      expect(p.schedule.every((r) => r.amount > 0)).toBe(true);
    }
  });

  it('zero markup and zero down payment are allowed', () => {
    const p = calculatePlan({ ...base, downPayment: 0, markupPercent: 0, months: 3 });
    expect(p.financedAmount).toBe(60000);
    expect(p.monthlyAmount).toBe(20000);
  });

  it('due dates keep the day of month and clamp to short months', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2026-11-10', 3)).toBe('2027-02-10');
    const p = calculatePlan({ ...base, firstDueDate: '2026-01-31', months: 4 });
    expect(p.schedule.map((r) => r.dueDate)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
  });

  it('rejects impossible terms', () => {
    expect(() => calculatePlan({ ...base, downPayment: 60000 })).toThrow(PlanInputError);
    expect(() => calculatePlan({ ...base, months: 0 })).toThrow(PlanInputError);
    expect(() => calculatePlan({ ...base, months: 61 })).toThrow(PlanInputError);
    expect(() => calculatePlan({ ...base, markupPercent: -1 })).toThrow(PlanInputError);
    expect(() => calculatePlan({ ...base, downPayment: -5 })).toThrow(PlanInputError);
  });
});

describe('collecting payments', () => {
  const schedule: ScheduleItem[] = [
    { no: 1, dueDate: '2026-11-10', amount: 1000, paidAmount: 0, status: 'pending' },
    { no: 2, dueDate: '2026-12-10', amount: 1000, paidAmount: 0, status: 'pending' },
    { no: 3, dueDate: '2027-01-10', amount: 500, paidAmount: 0, status: 'pending' },
  ];

  it('pays the oldest instalments first, partial amounts included', () => {
    const a = allocatePayment(schedule, 1300);
    expect(a.map((s) => [s.paidAmount, s.status])).toEqual([[1000, 'paid'], [300, 'partial'], [0, 'pending']]);
    const b = allocatePayment(a, 700);
    expect(b.map((s) => s.status)).toEqual(['paid', 'paid', 'pending']);
    const c = allocatePayment(b, 200);
    expect(c.map((s) => [s.paidAmount, s.status])).toEqual([[1000, 'paid'], [1000, 'paid'], [200, 'partial']]);
  });

  it('can clear the whole balance and refuses overpayment', () => {
    const done = allocatePayment(schedule, 2500);
    expect(done.every((s) => s.status === 'paid')).toBe(true);
    expect(() => allocatePayment(schedule, 2500.01)).toThrow(PlanInputError);
    expect(() => allocatePayment(schedule, 0)).toThrow(PlanInputError);
  });

  it('computes overdue amounts and the next due instalment', () => {
    const partial = allocatePayment(schedule, 1300);
    expect(overdueOf(partial, '2026-12-11')).toEqual({ amount: 700, count: 1 });
    expect(overdueOf(partial, '2026-11-10')).toEqual({ amount: 0, count: 0 }); // due today is not overdue yet
    expect(nextDueOf(partial)).toEqual({ dueDate: '2026-12-10', amount: 700 });
    expect(nextDueOf(allocatePayment(schedule, 2500))).toBeNull();
  });
});
