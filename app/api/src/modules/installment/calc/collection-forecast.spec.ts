import { summarizeCollectionForecast } from './collection-forecast';

describe('installment collections forecast', () => {
  it('separates overdue amounts and three consecutive periods to the cent', async () => {
    const forecast = await summarizeCollectionForecast('2026-11-26', [
      { dueDate: '2026-11-25', amount: 100.55, paid: 25.20 },
      { dueDate: '2026-11-26', amount: 0.1, paid: 0 },
      { dueDate: '2026-12-25', amount: 0.2, paid: 0 },
      { dueDate: '2026-12-26', amount: 150, paid: 20 },
      { dueDate: '2027-01-25', amount: 500, paid: 0 },
      { dueDate: '2027-02-23', amount: 50, paid: 50 },
      { dueDate: '2027-02-24', amount: 1000, paid: 0 },
    ]);
    expect(forecast).toEqual({
      asOf: '2026-11-26',
      overdue: { amount: 75.35, count: 1 },
      periods: [
        { from: '2026-11-26', to: '2026-12-25', amount: 0.3, count: 2 },
        { from: '2026-12-26', to: '2027-01-24', amount: 130, count: 1 },
        { from: '2027-01-25', to: '2027-02-23', amount: 500, count: 1 },
      ],
    });
  });
});
