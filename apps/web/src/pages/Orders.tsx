import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { invoiceApi, orderApi } from '../api';
import { useTenant } from '../hooks/useTenant';
import { useAuth } from '../store/auth';
import { errorMessage } from '../utils/errors';
import { formatMoney } from '../utils/money';

export default function Orders() {
  const queryClient = useQueryClient();
  const { currency } = useTenant();
  const role = useAuth((s) => s.user?.role);
  const canManage = role !== 'cashier';
  const [page, setPage] = useState(1);
  const limit = 15;

  const list = useQuery({ queryKey: ['orders', page], queryFn: () => orderApi.list(page, limit), refetchInterval: 5000 });
  const voidOrder = useMutation({
    mutationFn: orderApi.void,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['orders'] }); queryClient.invalidateQueries({ queryKey: ['products'] }); },
  });
  const openPdf = useMutation({ mutationFn: (v: { id: string; no: string }) => invoiceApi.openPdf(v.id, v.no) });

  const pages = Math.max(1, Math.ceil((list.data?.total ?? 0) / limit));

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Orders</h1>
      {voidOrder.isError && <p className="text-sm text-red-600">{errorMessage(voidOrder.error)}</p>}
      {openPdf.isError && <p className="text-sm text-red-600">{errorMessage(openPdf.error)}</p>}

      <div className="card overflow-x-auto !p-0">
        <table className="w-full">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr><th className="th">Invoice</th><th className="th">Date</th><th className="th">Cashier</th><th className="th">Items</th><th className="th">Payment</th><th className="th">Total</th><th className="th">Status</th><th className="th" /></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {list.data?.data.map((o) => (
              <tr key={o._id} className={o.status === 'voided' ? 'text-slate-400 line-through' : ''}>
                <td className="td font-medium">{o.invoiceNo}</td>
                <td className="td">{new Date(o.createdAt).toLocaleString()}</td>
                <td className="td">{o.cashierName}</td>
                <td className="td">{o.items.length}</td>
                <td className="td capitalize">{o.paymentMode}</td>
                <td className="td">{formatMoney(o.grandTotal, currency)}</td>
                <td className="td no-underline">
                  <span className={`rounded px-1.5 py-0.5 text-xs capitalize ${o.status === 'voided' ? 'bg-slate-100' : 'bg-emerald-50 text-emerald-700'}`}>{o.status}</span>
                </td>
                <td className="td space-x-2 text-right">
                  {o.invoiceStatus === 'ready' && (
                    <button className="btn-secondary !px-2.5 !py-1" onClick={() => openPdf.mutate({ id: o._id, no: o.invoiceNo })}>Receipt</button>
                  )}
                  {o.invoiceStatus === 'pending' && <span className="text-xs text-amber-600">PDF generating…</span>}
                  {o.invoiceStatus === 'failed' && <span className="text-xs text-red-600">PDF failed</span>}
                  {canManage && o.status === 'completed' && (
                    <button
                      className="btn-danger" disabled={voidOrder.isPending}
                      onClick={() => { if (confirm(`Void ${o.invoiceNo}? Stock will be restored.`)) voidOrder.mutate(o._id); }}
                    >Void</button>
                  )}
                </td>
              </tr>
            ))}
            {list.data?.data.length === 0 && <tr><td className="td text-slate-500" colSpan={8}>No sales yet.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-end gap-3 text-sm">
        <button className="btn-secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
        <span>Page {page} of {pages}</span>
        <button className="btn-secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
      </div>
    </div>
  );
}
