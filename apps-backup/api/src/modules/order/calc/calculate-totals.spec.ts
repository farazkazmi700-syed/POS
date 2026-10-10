import { ChargeType, TaxClass } from '../../../common/enums';
import { calculateTotals, CalcLineInput, CalcTaxProfile } from './calculate-totals';

const profile: CalcTaxProfile = { gstPercent: 18, reducedGstPercent: 5, serviceChargePercent: 0, otherCharges: [] };
const line = (over: Partial<CalcLineInput> = {}): CalcLineInput => ({
  productId: 'p1', name: 'Item', unitPrice: 100, qty: 1, discountPercent: 0, taxClass: TaxClass.Standard, ...over,
});

describe('calculateTotals', () => {
  it('applies discount first, then tax (the receipt mock-up scenario)', () => {
    const r = calculateTotals(
      [line({ unitPrice: 1800, discountPercent: 5 }), line({ productId: 'p2', unitPrice: 220, qty: 2, discountPercent: 5 })],
      profile,
    );
    expect(r.subtotal).toBe(2240);
    expect(r.discountTotal).toBe(112);
    expect(r.taxableTotal).toBe(2128);
    expect(r.taxTotal).toBe(383.04);
    expect(r.grandTotal).toBe(2511.04);
  });

  it('does not suffer from floating point drift', () => {
    const r = calculateTotals([line({ unitPrice: 0.1, qty: 3 })], { ...profile, gstPercent: 0 });
    expect(r.grandTotal).toBe(0.3);
  });

  it('uses the right rate per tax class and groups the breakdown by rate', () => {
    const r = calculateTotals(
      [line({ unitPrice: 1000 }), line({ productId: 'b', unitPrice: 1000, taxClass: TaxClass.Reduced }),
       line({ productId: 'c', unitPrice: 1000, taxClass: TaxClass.Exempt })],
      profile,
    );
    expect(r.taxTotal).toBe(230); // 180 + 50 + 0
    expect(r.taxBreakdown).toEqual([
      { ratePercent: 18, taxableAmount: 1000, taxAmount: 180 },
      { ratePercent: 5, taxableAmount: 1000, taxAmount: 50 },
      { ratePercent: 0, taxableAmount: 1000, taxAmount: 0 },
    ]);
  });

  it('adds service charge (percent) and other charges (flat + percent) to the grand total', () => {
    const r = calculateTotals([line({ unitPrice: 1000, taxClass: TaxClass.Exempt })], {
      ...profile, serviceChargePercent: 10,
      otherCharges: [{ label: 'Packaging', type: ChargeType.Flat, value: 20 }, { label: 'Levy', type: ChargeType.Percent, value: 1 }],
    });
    expect(r.charges.map((c) => c.amount)).toEqual([100, 20, 10]);
    expect(r.chargesTotal).toBe(130);
    expect(r.grandTotal).toBe(1130);
  });

  it('supports fractional quantities (e.g. kilograms)', () => {
    const r = calculateTotals([line({ unitPrice: 240, qty: 1.5, taxClass: TaxClass.Exempt })], profile);
    expect(r.grandTotal).toBe(360);
  });
});
