import axios from 'axios';

/** Turns an API / network error into one readable sentence. */
export function errorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const msg = err.response?.data?.message;
    if (Array.isArray(msg)) return msg.join(', ');
    if (typeof msg === 'string') return msg;
    if (!err.response) return 'Cannot reach the server';
  }
  return err instanceof Error ? err.message : 'Something went wrong';
}
