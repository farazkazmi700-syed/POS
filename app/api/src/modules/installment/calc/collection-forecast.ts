import { toMinor } from './money';

export interface ForecastPayment {
  dueDate: string;
  amount: number;
  paid: number;
}

const DAY_MS = 86_400_000;

export async function summarizeCollectionForecast(asOf: string, payments: AsyncIterable<ForecastPayment> | Iterable<ForecastPayment>) {
  const start = Date.parse(asOf + 'T00:00:00Z');
  const overdue = { amount: 0, count: 0 };
  const periods = Array.from({ length: 3 }, (_, index) => ({
    from: new Date(start + index * 30 * DAY_MS).toISOString().slice(0, 10),
    to: new Date(start + ((index + 1) * 30 - 1) * DAY_MS).toISOString().slice(0, 10),
    amount: 0,
    count: 0,
  }));

  for await (const payment of payments) {
    const days = (Date.parse(payment.dueDate + 'T00:00:00Z') - start) / DAY_MS;
    const bucket = days < 0 ? overdue : periods[Math.floor(days / 30)];
    if (!bucket) continue;

    const remaining = toMinor(payment.amount) - toMinor(payment.paid);
    if (remaining <= 0) continue;
    bucket.amount += remaining;
    bucket.count++;
  }

  return {
    asOf,
    overdue: { ...overdue, amount: overdue.amount / 100 },
    periods: periods.map((period) => ({ ...period, amount: period.amount / 100 })),
  };
}
