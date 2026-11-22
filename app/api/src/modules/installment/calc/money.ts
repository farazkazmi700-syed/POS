/** Decimal parsing before arithmetic avoids binary rounding (e.g. 1.005 * 100).
 * Public amounts remain numbers for compatibility; financial operations use bounded integer cents.
 */
export function toMinor(value: number): number {
  if (!Number.isFinite(value) || value < 0) throw new Error('Amount must be finite and nonnegative');
  const text = String(value);
  if (!/^\d+(\.\d{1,2})?$/.test(text)) throw new Error('Amount must have at most two decimal places');
  const [whole, fraction = ''] = text.split('.');
  const minor = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (minor > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Amount exceeds supported precision');
  return Number(minor);
}

export function percentCharge(principalMinor: number, percent: number): number {
  if (!Number.isSafeInteger(principalMinor) || principalMinor < 0 || percent > 100) throw new Error('Invalid principal or rate');
  const result = (BigInt(principalMinor) * BigInt(toMinor(percent)) + 5000n) / 10000n;
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Charge exceeds supported precision');
  return Number(result);
}
