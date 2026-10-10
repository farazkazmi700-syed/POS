export function formatMoney(amount: number, currency = 'PKR'): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, currencyDisplay: 'code' })
      .format(amount)
      .replace(/\u00a0/g, ' ');
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}
