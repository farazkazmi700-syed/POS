import { useMutation, useQuery } from '@tanstack/react-query';
import { invoiceApi } from '../api';
import { errorMessage } from '../utils/errors';

/**
 * Checkout returns instantly; the PDF is rendered by a background worker.
 * This polls the invoice status every 1.5s until the receipt is ready.
 */
export default function ReceiptStatus({ orderId, invoiceNo, canRetry }: { orderId: string; invoiceNo: string; canRetry: boolean }) {
  const status = useQuery({
    queryKey: ['invoice', orderId],
    queryFn: () => invoiceApi.status(orderId),
    refetchInterval: (q) => (q.state.data?.status === 'pending' || !q.state.data ? 1500 : false),
  });
  const open = useMutation({ mutationFn: () => invoiceApi.openPdf(orderId, invoiceNo) });
  const retry = useMutation({ mutationFn: () => invoiceApi.regenerate(orderId), onSuccess: () => status.refetch() });

  const s = status.data?.status ?? 'pending';
  return (
    <div className="flex flex-wrap items-center gap-2">
      {s === 'pending' && <span className="text-sm text-amber-600">Generating receipt…</span>}
      {s === 'ready' && (
        <button className="btn-primary" disabled={open.isPending} onClick={() => open.mutate()}>
          {open.isPending ? 'Opening…' : 'Open receipt (PDF)'}
        </button>
      )}
      {s === 'failed' && (
        <>
          <span className="text-sm text-red-600">Receipt generation failed.</span>
          {canRetry && (
            <button className="btn-secondary" disabled={retry.isPending} onClick={() => retry.mutate()}>Retry</button>
          )}
        </>
      )}
      {open.isError && <span className="text-sm text-red-600">{errorMessage(open.error)}</span>}
    </div>
  );
}
