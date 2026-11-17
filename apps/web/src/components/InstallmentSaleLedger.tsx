import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { installmentSaleApi } from '../api';
import { useTenant } from '../hooks/useTenant';
import { errorMessage } from '../utils/errors';
import { formatMoney } from '../utils/money';
import type { InstallmentSale, InvoicePrintSettings } from '@pos/shared-types';

function paperSize(settings?: InvoicePrintSettings) {
  const sizes: Record<string, [number, number]> = { A4: [210, 297], A5: [148, 210], A6: [105, 148], '80mm': [80, 200], '58mm': [58, 200], Receipt: [80, 200] };
  const width = Math.min(420, Math.max(40, Number(settings?.widthMm) || 80));
  const height = Math.min(1000, Math.max(40, Number(settings?.heightMm) || 200));
  let [w, h] = settings?.paperSize === 'custom' ? [width, height] : sizes[settings?.paperSize ?? 'A4'] ?? sizes.A4;
  if (['80mm', '58mm', 'Receipt'].includes(settings?.paperSize ?? '')) h = height;
  else if (settings?.orientation === 'landscape') [w, h] = [h, w];
  return { w, h };
}

export default function InstallmentSaleLedger({ collect = false }: { collect?: boolean }) {
  const { tenant, currency } = useTenant();
  const cache = useQueryClient();
  const [page, setPage] = useState(1);
  const [selectedId, select] = useState('');
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState<'cash' | 'card' | 'wallet'>('cash');
  const [preview, setPreview] = useState(false);
  const key = useRef<{ details: string; key: string } | null>(null);
  const list = useQuery({ queryKey: ['installments', 'sales', page], queryFn: () => installmentSaleApi.list({ filter: 'all', page, limit: 20 }) });
  const selected = useQuery({ queryKey: ['installments', 'sale', selectedId], queryFn: () => installmentSaleApi.get(selectedId), enabled: !!selectedId });
  const sale = selected.data;
  const money = (n: number) => formatMoney(n, currency);
  const pay = useMutation({ mutationFn: () => {
    const details = JSON.stringify({ selectedId, amount, mode });
    if (key.current?.details !== details) key.current = { details, key: crypto.randomUUID() };
    return installmentSaleApi.pay(selectedId, { amount: Number(amount), mode, idempotencyKey: key.current.key });
  }, onSuccess: (data) => { key.current = null; setAmount(''); cache.setQueryData(['installments', 'sale', selectedId], data); void cache.invalidateQueries({ queryKey: ['installments'] }); } });
  const size = paperSize(tenant?.invoicePrintSettings);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: tenant?.timeZone ?? 'Asia/Karachi', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const summary = (s: InstallmentSale) => {
    const next = s.schedule.find((r) => r.remainingAmount > 0);
    const overdue = s.schedule.filter((r) => r.dueDate < today).reduce((n, r) => n + Math.round(r.remainingAmount * 100), 0) / 100;
    return <>
      <h2 className="text-lg font-bold">{tenant?.name} — Installment agreement</h2><p>{s.agreementId}</p><p>Customer reference: {s.customerId}</p>
      <dl className="grid grid-cols-2 gap-2 my-4">
        {Object.entries({ 'Cash price': money(s.actualPrice), 'Down payment': money(s.advancePayment), Principal: money((Math.round(s.actualPrice * 100) - Math.round(s.advancePayment * 100)) / 100), Charges: money(s.commissionAmount), 'Total payable': money(s.totalInstallmentPrice), 'Paid to date': money(s.totalPaid), Remaining: money(s.outstandingBalance), Overdue: money(overdue), Frequency: `${s.installmentDuration} ${s.paymentFrequency}`, 'Next due': next ? `${next.dueDate}: ${money(next.remainingAmount)}` : 'Settled' }).map(([label, value]) => <div key={label}><dt className="text-xs">{label}</dt><dd className="font-semibold">{value}</dd></div>)}
      </dl>
      <h3 className="font-semibold">Full payment schedule</h3><table className="w-full text-xs"><thead><tr><th>Due date</th><th>Expected</th><th>Paid</th><th>Remaining</th></tr></thead><tbody>
        {s.schedule.map((r) => <tr key={r.installmentId}><td>{r.dueDate}</td><td>{money(r.expectedAmount)}</td><td>{money(r.amountPaid)}</td><td>{money(r.remainingAmount)}</td></tr>)}
      </tbody></table>
      <h3 className="font-semibold mt-4">Payment ledger</h3><table className="w-full text-xs"><thead><tr><th>Receipt / date</th><th>Mode</th><th>Received</th></tr></thead><tbody>
        {s.payments.map((p) => <tr key={p.paymentId}><td>{p.receiptNo}<br />{new Date(p.paidAt).toLocaleDateString()}</td><td>{p.mode}</td><td>{money(p.amount)}</td></tr>)}
      </tbody></table>
      {tenant?.invoicePrintSettings?.stamp && <p className="border p-2 mt-4">{tenant.invoicePrintSettings.stamp}</p>}
      <p className="text-xs mt-4">{tenant?.invoicePrintSettings?.footerText} · Powered by KazmiOn</p>
    </>;
  };
  return <section className="card space-y-4">
    <h2 className="text-lg font-semibold">Independent installment agreements</h2>
    {list.isPending ? <p>Loading agreements…</p> : list.isError ? <p role="alert">{errorMessage(list.error)}</p> : <>
      <label className="label">Agreement<select className="input" value={selectedId} onChange={(e) => { select(e.target.value); pay.reset(); key.current = null; }}><option value="">Select an agreement</option>{list.data.data.map((s) => <option key={s._id} value={s._id}>{s.agreementId} — {money(s.outstandingBalance)}</option>)}</select></label>
      {!list.data.total && <p>No installment agreements yet.</p>}
      <div className="flex gap-2"><button className="btn-secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page}</span><button className="btn-secondary" disabled={page * 20 >= list.data.total} onClick={() => setPage(page + 1)}>Next</button></div>
    </>}
    {selected.isFetching && selectedId && <p>Loading agreement…</p>}
    {selected.isError && <p role="alert">{errorMessage(selected.error)}</p>}
    {sale && <><div className="overflow-x-auto">{summary(sale)}</div><button className="btn-secondary" onClick={() => setPreview(true)}>Print preview / PDF</button>
      {collect && sale.outstandingBalance > 0 && <form className="flex flex-wrap gap-3 items-end" onSubmit={(e) => { e.preventDefault(); if (!pay.isPending) pay.mutate(); }}>
        <label className="label">Amount<input className="input" type="number" min="0.01" max={sale.outstandingBalance} step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
        <label className="label">Payment mode<select className="input" value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}><option value="cash">Cash</option><option value="card">Card</option><option value="wallet">Wallet</option></select></label>
        <button className="btn-primary" disabled={pay.isPending}>{pay.isPending ? 'Posting…' : 'Collect payment'}</button>
      </form>}
      {pay.isError && <p role="alert">{errorMessage(pay.error)}</p>}{pay.isSuccess && <p role="status">Payment posted to the ledger.</p>}
    </>}
    {preview && sale && createPortal(<div id="agreement-preview" role="dialog" aria-modal="true" aria-label="Installment print preview" className="fixed inset-0 z-[100] overflow-auto bg-slate-100 p-6 text-black">
      <style>{`@page { size: ${size.w}mm ${size.h}mm; margin: 4mm; } #agreement-preview td,#agreement-preview th{padding:4px;overflow-wrap:anywhere;text-align:left} #agreement-preview table{table-layout:fixed} @media print{body > :not(#agreement-preview){display:none!important} #agreement-preview{position:static;padding:0;background:white;overflow:visible} #agreement-preview article{width:auto!important;box-shadow:none;padding:0} #agreement-preview tr{break-inside:avoid}}`}</style>
      <div className="no-print flex gap-3 mb-4"><button className="btn-primary" onClick={() => window.print()}>Print / Save as PDF</button><button className="btn-secondary" onClick={() => setPreview(false)}>Close preview</button></div>
      <article className="mx-auto bg-white p-4 shadow" style={{ width: `${size.w - 8}mm` }}>{summary(sale)}</article>
    </div>, document.body)}
  </section>;
}
