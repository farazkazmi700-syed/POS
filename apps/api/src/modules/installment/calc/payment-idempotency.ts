export interface PaymentRetryInput {
  idempotencyKey?: string;
  amount: number;
  mode: string;
  note?: string;
}

export type PaymentRetryMatch<T> = { payment: T } | { conflict: true } | null;

export function matchPaymentRetry<T extends PaymentRetryInput>(
  payments: readonly T[],
  input: PaymentRetryInput,
): PaymentRetryMatch<T> {
  if (!input.idempotencyKey) return null;
  const payment = payments.find((entry) => entry.idempotencyKey === input.idempotencyKey);
  if (!payment) return null;
  if (payment.amount !== input.amount || payment.mode !== input.mode || payment.note !== input.note) {
    return { conflict: true };
  }
  return { payment };
}