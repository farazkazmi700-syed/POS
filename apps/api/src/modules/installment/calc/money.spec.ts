import { percentCharge, toMinor } from './money';
import { calculatePlan } from './calculate-plan';
describe('exact installment arithmetic', () => {
  it('parses decimal cents without binary multiplication', () => { expect(toMinor(0.29)).toBe(29); expect(toMinor(1.01)).toBe(101); });
  it.each([NaN, Infinity, -1, 1.005, 1e20])('rejects invalid or unsafe amount %s', (amount) => expect(() => toMinor(amount)).toThrow());
  it('rounds half cents explicitly upwards', () => { expect(percentCharge(101, 50)).toBe(51); expect(percentCharge(100, 0.5)).toBe(1); });
  it('rejects impossible calendar dates', () => expect(() => calculatePlan({ cashTotal: 100, downPayment: 1, months: 4, markupPercent: 5, firstDueDate: '2026-02-30' })).toThrow('Invalid calendar date'));
});
