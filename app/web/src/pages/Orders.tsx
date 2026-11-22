import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import PageHeading from '../components/PageHeading';
import { invoiceApi, orderApi } from '../api';
import { useTenant } from '../hooks/useTenant';
import { useAuth } from '../store/auth';
import { errorMessage } from '../utils/errors';
import { formatMoney } from '../utils/money';
import { urduClass } from '../utils/urdu';

export default function Orders() {
  const queryClient = useQueryClient();
  const { currency } = useTenant();
  const role = useAuth((s) => s.user?.role);
  const canManage = role !== 'cashier';
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'voided'>('all');
  const refund = useMutation({ mutationFn: ({ id, reason }: { id: string; reason: string }) => orderApi.refund(id, reason), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['orders'] }); queryClient.invalidateQueries({ queryKey: ['products'] }); } });
  const limit = 15;

  const list = useQuery({
    queryKey: ['orders', page],
    queryFn: () => orderApi.list(page, limit),
    refetchInterval: 5000,
  });

  const voidOrder = useMutation({
    mutationFn: orderApi.void,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });

  const openPdf = useMutation({ mutationFn: (v: { id: string; no: string }) => invoiceApi.openPdf(v.id, v.no) });
  const downloadPdf = useMutation({ mutationFn: (v: { id: string; no: string }) => invoiceApi.downloadPdf(v.id, v.no) });

  const rawOrders = list.data?.data ?? [];
  const filteredOrders = rawOrders.filter((o) => {
    if (statusFilter === 'all') return true;
    return o.status === statusFilter;
  });

  const pages = Math.max(1, Math.ceil((list.data?.total ?? 0) / limit));

  return (
    <div className="space-y-4">
      <div className="page-header">
        <PageHeading eyebrow="Sales activity" title="Orders & invoices" description={`${list.data?.total ?? 0} orders. Review transactions and download customer invoices.`} />

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 self-start sm:self-auto rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
          {(['all', 'completed', 'voided'] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`rounded-lg px-3 py-1 text-xs font-semibold capitalize transition ${
                statusFilter === st
                  ? 'bg-white text-teal-700 shadow-sm dark:bg-[#002228] dark:text-teal-400'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {voidOrder.isError && <p className="text-sm text-red-600">{errorMessage(voidOrder.error)}</p>}
      {refund.isError && <p role="alert" className="text-sm text-red-600">{errorMessage(refund.error)}</p>}
      {canManage && <div className="card"><label className="label" htmlFor="refund-order">Full-order refund</label><div className="flex flex-wrap gap-2"><select id="refund-order" className="input flex-1" defaultValue="" onChange={(event) => { const id = event.target.value; if (!id) return; const reason = window.prompt('Reason for the full refund (at least 3 characters). Stock will be restored once.'); if (reason && reason.trim().length >= 3) refund.mutate({ id, reason }); event.target.value = ''; }} disabled={refund.isPending}><option value="">Choose a completed cash/card/wallet sale…</option>{rawOrders.filter((order) => order.status === 'completed' && order.paymentMode !== 'installment').map((order) => <option key={order._id} value={order._id}>{order.invoiceNo} · {formatMoney(order.grandTotal, currency)}</option>)}</select><p className="text-xs text-slate-500">Installment agreements require a separate settlement.</p></div></div>}
      {openPdf.isError && <p className="text-sm text-red-600">{errorMessage(openPdf.error)}</p>}
      {downloadPdf.isError && <p className="text-sm text-red-600">{errorMessage(downloadPdf.error)}</p>}

      {/* ─────────────── Desktop Table (hidden on mobile) ─────────────── */}
      <div className="card overflow-x-auto !p-0 hidden md:block">
        <table className="w-full">
          <thead className="border-b border-slate-200 bg-slate-50 dark:border-teal-950 dark:bg-slate-800/40">
            <tr>
              <th className="th">Invoice</th>
              <th className="th">Date</th>
              <th className="th">Cashier</th>
              <th className="th">Items</th>
              <th className="th">Payment</th>
              <th className="th">Total</th>
              <th className="th">Status</th>
              <th className="th text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-teal-950">
            {filteredOrders.map((o) => (
              <tr key={o._id} className={o.status === 'voided' ? 'opacity-60 line-through' : ''}>
                <td className="td font-bold text-teal-800 dark:text-teal-300">{o.invoiceNo}</td>
                <td className="td text-xs text-slate-500">{new Date(o.createdAt).toLocaleString()}</td>
                <td className={`td ${urduClass(o.cashierName)}`} dir={urduClass(o.cashierName) ? 'rtl' : undefined}>{o.cashierName}</td>
                <td className="td">{o.items.length}</td>
                <td className="td capitalize">{o.paymentMode}</td>
                <td className="td font-bold">{formatMoney(o.grandTotal, currency)}</td>
                <td className="td no-underline">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${
                      o.status === 'voided'
                        ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                        : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
                    }`}
                  >
                    {o.status}
                  </span>
                </td>
                <td className="td space-x-2 text-right no-underline">
                  {o.invoiceStatus === 'ready' && (
                    <>
                      <button
                        className="btn-secondary !px-2.5 !py-1 text-xs"
                        onClick={() => openPdf.mutate({ id: o._id, no: o.invoiceNo })}
                      >
                        Receipt
                      </button>
                      <button
                        className="btn-secondary !px-2.5 !py-1 text-xs"
                        disabled={downloadPdf.isPending}
                        onClick={() => downloadPdf.mutate({ id: o._id, no: o.invoiceNo })}
                      >
                        PDF
                      </button>
                    </>
                  )}
                  {o.invoiceStatus === 'pending' && <span className="text-xs text-amber-600">Generating…</span>}
                  {o.invoiceStatus === 'failed' && <span className="text-xs text-red-600">PDF failed</span>}
                  {canManage && o.status === 'completed' && (
                    <button
                      className="btn-danger !px-2.5 !py-1 text-xs"
                      disabled={voidOrder.isPending}
                      onClick={() => {
                        if (confirm(`Void ${o.invoiceNo}? Stock will be restored.`)) voidOrder.mutate(o._id);
                      }}
                    >
                      Void
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {filteredOrders.length === 0 && (
              <tr>
                <td className="td text-center text-slate-500 py-8" colSpan={8}>
                  No orders found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ─────────────── Mobile Responsive Cards (visible only on < md) ─────────────── */}
      <div className="space-y-3 block md:hidden">
        {filteredOrders.map((o) => (
          <div
            key={o._id}
            className={`card space-y-3 p-4 ${
              o.status === 'voided' ? 'opacity-60 bg-slate-50/50 dark:bg-slate-900/30' : ''
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="font-bold text-teal-800 dark:text-teal-300 text-base">
                  {o.invoiceNo}
                </span>
                <span className="block text-[11px] text-slate-400">
                  {new Date(o.createdAt).toLocaleString()}
                </span>
              </div>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${
                  o.status === 'voided'
                    ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                    : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
                }`}
              >
                {o.status}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs border-y border-slate-100 dark:border-teal-950 py-2">
              <div>
                <span className="text-slate-500 dark:text-slate-400">Total: </span>
                <span className="font-bold text-teal-700 dark:text-teal-400 text-sm">
                  {formatMoney(o.grandTotal, currency)}
                </span>
              </div>
              <div className="text-right">
                <span className="text-slate-500 dark:text-slate-400">Payment: </span>
                <span className="font-semibold capitalize text-slate-800 dark:text-slate-200">
                  {o.paymentMode}
                </span>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400">Cashier: </span>
                <span className={`text-slate-800 dark:text-slate-200 ${urduClass(o.cashierName)}`} dir={urduClass(o.cashierName) ? 'rtl' : undefined}>{o.cashierName}</span>
              </div>
              <div className="text-right">
                <span className="text-slate-500 dark:text-slate-400">Items: </span>
                <span className="font-medium text-slate-800 dark:text-slate-200">{o.items.length}</span>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center justify-end gap-2 pt-1">
              {o.invoiceStatus === 'ready' && (
                <>
                  <button
                    className="btn-secondary flex-1 !py-2 text-xs"
                    onClick={() => openPdf.mutate({ id: o._id, no: o.invoiceNo })}
                  >
                    View Receipt
                  </button>
                  <button
                    className="btn-secondary !py-2 text-xs"
                    disabled={downloadPdf.isPending}
                    onClick={() => downloadPdf.mutate({ id: o._id, no: o.invoiceNo })}
                  >
                    PDF
                  </button>
                </>
              )}
              {o.invoiceStatus === 'pending' && (
                <span className="text-xs text-amber-600">Generating receipt…</span>
              )}
              {canManage && o.status === 'completed' && (
                <button
                  className="btn-danger !py-2 text-xs"
                  disabled={voidOrder.isPending}
                  onClick={() => {
                    if (confirm(`Void ${o.invoiceNo}? Stock will be restored.`)) voidOrder.mutate(o._id);
                  }}
                >
                  Void
                </button>
              )}
            </div>
          </div>
        ))}

        {filteredOrders.length === 0 && (
          <div className="card text-center py-8 text-sm text-slate-500">
            No orders found.
          </div>
        )}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between gap-3 text-sm pt-2">
        <span className="text-xs text-slate-500">
          Page {page} of {pages}
        </span>
        <div className="flex items-center gap-2">
          <button
            className="btn-secondary !px-3 !py-1.5 text-xs"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            ← Previous
          </button>
          <button
            className="btn-secondary !px-3 !py-1.5 text-xs"
            disabled={page >= pages}
            onClick={() => setPage(page + 1)}
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}
