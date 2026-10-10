import { ChargeType, TaxClass } from '../../../common/enums';

export interface CalcLineInput {
  productId: string;
  name: string;
  unitPrice: number;
  qty: number;
  discountPercent: number;
  taxClass: TaxClass;
}

export interface CalcTaxProfile {
  gstPercent: number;
  reducedGstPercent: number;
  serviceChargePercent: number;
  otherCharges: { label: string; type: ChargeType; value: number }[];
}

export interface CalcLineResult extends CalcLineInput {
  discountAmount: number;
  taxPercent: number;
  taxAmount: number;
  /** net of discount, including tax */
  lineTotal: number;
}

export interface CalcResult {
  lines: CalcLineResult[];
  /** sum of qty x price before any discount */
  subtotal: number;
  discountTotal: number;
  /** subtotal - discounts (the amount tax is charged on) */
  taxableTotal: number;
  taxTotal: number;
  charges: { label: string; amount: number }[];
  chargesTotal: number;
  grandTotal: number;
  taxBreakdown: { ratePercent: number; taxableAmount: number; taxAmount: number }[];
}

/**
 * All arithmetic is done in integer minor units (paisa / cents) and rounded
 * per line, which is how tax invoices are normally computed. This avoids
 * floating point drift such as 0.1 + 0.2 = 0.30000000000000004.
 *
 * Rules (adjust to local law if needed):
 *  - discount is a percentage of the line gross
 *  - tax is charged on the discounted line amount, per line
 *  - service charge / other percent charges apply to the discounted subtotal
 *  - charges are not taxed
 */
export function calculateTotals(lines: CalcLineInput[], profile: CalcTaxProfile): CalcResult {
  const toMinor = (n: number) => Math.round(n * 100);
  const toMajor = (n: number) => n / 100;
  const pct = (amountMinor: number, percent: number) => Math.round((amountMinor * percent) / 100);

  let subtotal = 0, discountTotal = 0, taxTotal = 0, taxableTotal = 0;
  const breakdown = new Map<number, { taxable: number; tax: number }>();

  const results: CalcLineResult[] = lines.map((line) => {
    const gross = Math.round(toMinor(line.unitPrice) * line.qty);
    const discount = pct(gross, line.discountPercent);
    const net = gross - discount;
    const rate = rateFor(line.taxClass, profile);
    const tax = pct(net, rate);

    subtotal += gross; discountTotal += discount; taxableTotal += net; taxTotal += tax;
    const row = breakdown.get(rate) ?? { taxable: 0, tax: 0 };
    row.taxable += net; row.tax += tax;
    breakdown.set(rate, row);

    return {
      ...line,
      discountAmount: toMajor(discount),
      taxPercent: rate,
      taxAmount: toMajor(tax),
      lineTotal: toMajor(net + tax),
    };
  });

  const charges: { label: string; amount: number }[] = [];
  let chargesTotal = 0;
  const addCharge = (label: string, minor: number) => {
    if (minor <= 0) return;
    charges.push({ label, amount: toMajor(minor) });
    chargesTotal += minor;
  };
  if (profile.serviceChargePercent > 0) {
    addCharge(`Service charge (${profile.serviceChargePercent}%)`, pct(taxableTotal, profile.serviceChargePercent));
  }
  for (const c of profile.otherCharges) {
    addCharge(c.label, c.type === ChargeType.Percent ? pct(taxableTotal, c.value) : toMinor(c.value));
  }

  return {
    lines: results,
    subtotal: toMajor(subtotal),
    discountTotal: toMajor(discountTotal),
    taxableTotal: toMajor(taxableTotal),
    taxTotal: toMajor(taxTotal),
    charges,
    chargesTotal: toMajor(chargesTotal),
    grandTotal: toMajor(taxableTotal + taxTotal + chargesTotal),
    taxBreakdown: [...breakdown.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([ratePercent, v]) => ({
        ratePercent, taxableAmount: toMajor(v.taxable), taxAmount: toMajor(v.tax),
      })),
  };
}

function rateFor(taxClass: TaxClass, profile: CalcTaxProfile): number {
  switch (taxClass) {
    case TaxClass.Standard: return profile.gstPercent;
    case TaxClass.Reduced: return profile.reducedGstPercent;
    default: return 0;
  }
}
