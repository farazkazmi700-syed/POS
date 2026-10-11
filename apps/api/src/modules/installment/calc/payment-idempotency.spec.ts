import { matchPaymentRetry } from './payment-idempotency';

describe('payment retry matching', () => {
  const payment = {
    receiptNo: 'INV-2026-000001-R02',
    idempotencyKey: 'payment-request-2026-0001',
    amount: 40,
    mode: 'cash',
    note: 'May payment',
  };

  it('matches an identical retry to its original receipt', () => {
    expect(matchPaymentRetry([payment], payment)).toEqual({ payment });
  });

  it('rejects reusing a key with different payment details', () => {
    expect(matchPaymentRetry([payment], { ...payment, amount: 45 })).toEqual({ conflict: true });
  });

  it('does not match a different key or legacy payment without a key', () => {
    expect(matchPaymentRetry([payment], { ...payment, idempotencyKey: 'another-payment-request' })).toBeNull();
    expect(matchPaymentRetry([payment], { ...payment, idempotencyKey: undefined })).toBeNull();
  });
});