export function formatMoney(amount: number, currency = 'PKR', fractionDigits?: number): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency', currency, currencyDisplay: 'code',
      minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits,
    })
      .format(amount)
      .replace(/\u00a0/g, ' ');
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}
