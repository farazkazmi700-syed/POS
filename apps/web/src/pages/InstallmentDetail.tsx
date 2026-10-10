import type { InstallmentPlan, PlanPayment } from '@pos/shared-types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { installmentApi } from '../api';
import { useTenant } from '../hooks/useTenant';
import { fmtDate, fmtDateTime, todayYmd } from '../utils/dates';
import { errorMessage } from '../utils/errors';
import { formatMoney } from '../utils/money';

type PrintJob = { kind: 'agreement' } | { kind: 'receipt'; payment: PlanPayment; balanceAfter: number };

export default function InstallmentDetail() {
  const { id = '' } = useParams();
  const queryClient = useQueryClient();
  const { tenant, currency } = useTenant();
  const money = (n: number) => formatMoney(n, currency);
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState<'cash' | 'card' | 'wallet'>('cash');
  const [note, setNote] = useState('');
  const [job, setJob] = useState<PrintJob | null>(null);

  const plan = useQuery({ queryKey: ['installments', 'one', id], queryFn: () => installmentApi.get(id) });
  const p = plan.data;

  const pay = useMutation({
    mutationFn: () => installmentApi.pay(id, { amount: Number(amount), mode, note: note.trim() || undefined }),
    onSuccess: (res) => {
      setAmount(''); setNote('');
      queryClient.setQueryData(['installments', 'one', id], res.plan);
      queryClient.invalidateQueries({ queryKey: ['installments', 'list'] });
      queryClient.invalidateQueries({ queryKey: ['installments', 'stats'] });
      startPrint({ kind: 'receipt', payment: res.payment, balanceAfter: res.plan.balance });
    },
  });

  // Print: render the print-only block, then open the browser's print dialog.
  const startPrint = (j: PrintJob) => { setJob(j); setTimeout(() => window.print(), 150); };
  useEffect(() => {
    const clear = () => setJob(null);
    window.addEventListener('afterprint', clear);
    return () => window.removeEventListener('afterprint', clear);
  }, []);

  if (plan.isLoading) return <p className="text-sm text-slate-500">Loading…</p>;
  if (plan.isError || !p) return <p className="text-sm text-red-600">{errorMessage(plan.error)}</p>;

  const today = todayYmd();
  const submit = (e: FormEvent) => { e.preventDefault(); pay.mutate(); };
  const balanceAfterPayment = (idx: number) => p.totalPayable - p.payments.slice(0, idx + 1).reduce((a, x) => a + x.amount, 0);
  const suggested = p.nextDue ? p.nextDue.amount : 0;

  return (
    <>
      <div className="no-print space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          <Link to="/installments" className="text-sm text-indigo-600">← Installments</Link>
          <h1 className="text-xl font-semibold">{p.customerName}</h1>
          <span className="text-sm text-slate-500">{p.invoiceNo}</span>
          {p.status === 'completed' ? <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">Completed</span>
            : p.overdueAmount > 0 ? <span className="rounded bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">Overdue {money(p.overdueAmount)}</span> : null}
          <button className="btn-secondary ml-auto" onClick={() => startPrint({ kind: 'agreement' })}>Print agreement</button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Box label="Cash price" value={money(p.cashTotal)} />
          <Box label={`Markup (${p.markupPercent}%)`} value={money(p.markupAmount)} />
          <Box label="Installment price" value={money(p.totalPayable)} />
          <Box label="Monthly" value={`${money(p.monthlyAmount)} × ${p.months}`} />
          <Box label="Paid so far" value={money(p.paidTotal)} />
          <Box label="Balance" value={money(p.balance)} strong />
          <Box label="Next due" value={p.nextDue ? `${fmtDate(p.nextDue.dueDate)} · ${money(p.nextDue.amount)}` : '—'} />
          <Box label="Phone" value={p.customerPhone} />
        </div>

        {p.status === 'active' && (
          <form onSubmit={submit} className="card flex flex-wrap items-end gap-3">
            <div><label className="label">Amount received</label>
              <input className="input !w-40" type="number" min={0.01} max={p.balance} step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
            <div><label className="label">Paid by</label>
              <select className="input" value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
                <option value="cash">Cash</option><option value="card">Card</option><option value="wallet">Wallet</option>
              </select></div>
            <div className="min-w-48 flex-1"><label className="label">Note (optional)</label>
              <input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></div>
            {suggested > 0 && <button type="button" className="btn-secondary" onClick={() => setAmount(String(suggested))}>Next due {money(suggested)}</button>}
            <button className="btn-primary" disabled={pay.isPending}>{pay.isPending ? 'Saving…' : 'Collect and print receipt'}</button>
            {pay.isError && <p className="w-full text-sm text-red-600">{errorMessage(pay.error)}</p>}
          </form>
        )}

        <div className="grid gap-5 lg:grid-cols-2">
          <section className="card !p-0 overflow-x-auto">
            <h2 className="px-4 pt-4 text-sm font-semibold">Schedule</h2>
            <table className="mt-2 w-full">
              <thead className="border-y border-slate-200 bg-slate-50"><tr><th className="th">#</th><th className="th">Due</th><th className="th">Amount</th><th className="th">Paid</th><th className="th">Status</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {p.schedule.map((s) => {
                  const late = s.status !== 'paid' && s.dueDate < today;
                  return (
                    <tr key={s.no} className={late ? 'bg-red-50/60' : ''}>
                      <td className="td">{s.no}</td><td className="td">{fmtDate(s.dueDate)}</td>
                      <td className="td">{money(s.amount)}</td><td className="td">{money(s.paidAmount)}</td>
                      <td className="td capitalize">{late ? <span className="font-medium text-red-700">Overdue</span> : s.status}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          <section className="space-y-5">
            <div className="card !p-0 overflow-x-auto">
              <h2 className="px-4 pt-4 text-sm font-semibold">Payments received</h2>
              <table className="mt-2 w-full">
                <thead className="border-y border-slate-200 bg-slate-50"><tr><th className="th">Receipt</th><th className="th">Date</th><th className="th">Amount</th><th className="th">By</th><th className="th" /></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {p.payments.map((x, idx) => (
                    <tr key={x.receiptNo}>
                      <td className="td">{x.receiptNo}{x.note && <div className="text-xs text-slate-500">{x.note}</div>}</td>
                      <td className="td">{fmtDateTime(x.paidAt)}</td>
                      <td className="td">{money(x.amount)}<div className="text-xs capitalize text-slate-500">{x.mode}</div></td>
                      <td className="td">{x.receivedBy}</td>
                      <td className="td text-right"><button className="btn-secondary !px-2.5 !py-1" onClick={() => startPrint({ kind: 'receipt', payment: x, balanceAfter: balanceAfterPayment(idx) })}>Print</button></td>
                    </tr>
                  ))}
                  {p.payments.length === 0 && <tr><td className="td text-slate-500" colSpan={5}>No payments yet.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="card text-sm">
              <h2 className="mb-2 text-sm font-semibold">Goods</h2>
              {p.items.map((i, k) => (
                <div key={k} className="flex justify-between border-t border-slate-100 py-1.5 first:border-0">
                  <span>{i.name} × {i.qty}</span><span className="text-slate-500">{i.serialNo ? `S/N ${i.serialNo}` : 'no serial recorded'}</span>
                </div>
              ))}
              {p.guarantor?.name && <p className="mt-3 text-slate-600"><b>Guarantor:</b> {p.guarantor.name}{p.guarantor.phone ? ` · ${p.guarantor.phone}` : ''}{p.guarantor.cnic ? ` · CNIC ${p.guarantor.cnic}` : ''}</p>}
            </div>
          </section>
        </div>
      </div>

      {/* ---------- paper output ---------- */}
      <div className="print-only">
        {job?.kind === 'agreement' && tenant && <Agreement plan={p} business={tenant.name} address={tenant.address} taxRegNo={tenant.taxRegNo} money={money} />}
        {job?.kind === 'receipt' && tenant && <Receipt plan={p} payment={job.payment} balanceAfter={job.balanceAfter} business={tenant.name} address={tenant.address} money={money} />}
      </div>
    </>
  );
}

function Box({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="card">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 ${strong ? 'text-xl font-semibold' : 'text-base font-medium'}`}>{value}</div>
    </div>
  );
}

const cell = { border: '1px solid #999', padding: '4px 8px', fontSize: 12 } as const;

function Agreement({ plan: p, business, address, taxRegNo, money }: { plan: InstallmentPlan; business: string; address?: string; taxRegNo?: string; money: (n: number) => string }) {
  return (
    <div style={{ fontFamily: 'Arial, sans-serif', fontSize: 13, color: '#000', padding: 24 }}>
      <h1 style={{ textAlign: 'center', fontSize: 22, margin: 0 }}>INSTALLMENT SALE AGREEMENT</h1>
      <p style={{ textAlign: 'center', margin: '4px 0 16px' }}>{business}{address ? ` · ${address}` : ''}{taxRegNo ? ` · NTN ${taxRegNo}` : ''}</p>
      <p>Date: <b>{fmtDate(todayYmd())}</b> &nbsp; Invoice: <b>{p.invoiceNo}</b></p>

      <h3>Buyer</h3>
      <p>Name: <b>{p.customerName}</b> &nbsp; Phone: {p.customerPhone}<br />CNIC: {p.customerCnic ?? '____________________'}<br />Address: {p.customerAddress ?? '________________________________________'}</p>
      <h3>Guarantor</h3>
      <p>Name: <b>{p.guarantor?.name ?? '____________________'}</b> &nbsp; Phone: {p.guarantor?.phone ?? '______________'}<br />CNIC: {p.guarantor?.cnic ?? '____________________'}<br />Address: {p.guarantor?.address ?? '________________________________________'}</p>

      <h3>Goods sold</h3>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead><tr><th style={cell}>Item</th><th style={cell}>Qty</th><th style={cell}>IMEI / serial no.</th></tr></thead>
        <tbody>{p.items.map((i, k) => <tr key={k}><td style={cell}>{i.name}</td><td style={cell}>{i.qty}</td><td style={cell}>{i.serialNo ?? ''}</td></tr>)}</tbody>
      </table>

      <h3>Price and payment</h3>
      <table style={{ borderCollapse: 'collapse', width: '60%' }}>
        <tbody>
          {[['Cash price', money(p.cashTotal)], [`Markup (${p.markupPercent}%)`, money(p.markupAmount)], ['Installment price', money(p.totalPayable)],
            ['Down payment received', money(p.downPayment)], ['Balance to be paid', money(p.financedAmount)], ['Number of installments', String(p.months)],
          ].map(([k, v]) => <tr key={k}><td style={cell}>{k}</td><td style={{ ...cell, textAlign: 'right' }}>{v}</td></tr>)}
        </tbody>
      </table>

      <h3>Installment schedule</h3>
      <table style={{ borderCollapse: 'collapse', width: '60%' }}>
        <thead><tr><th style={cell}>#</th><th style={cell}>Due date</th><th style={cell}>Amount</th></tr></thead>
        <tbody>{p.schedule.map((s) => <tr key={s.no}><td style={cell}>{s.no}</td><td style={cell}>{fmtDate(s.dueDate)}</td><td style={{ ...cell, textAlign: 'right' }}>{money(s.amount)}</td></tr>)}</tbody>
      </table>

      <p style={{ marginTop: 16 }}>The buyer confirms receiving the goods listed above and agrees to pay the installments on the dates shown. The guarantor confirms that they stand guarantee for these payments.</p>
      <p>Other terms (late payment, default, returns): ____________________________________________<br />______________________________________________________________________________</p>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 48, fontSize: 12 }}>
        {['Buyer', 'Guarantor', 'Seller', 'Witness'].map((r) => <div key={r} style={{ width: '22%', borderTop: '1px solid #000', paddingTop: 4, textAlign: 'center' }}>{r}</div>)}
      </div>
    </div>
  );
}

function Receipt({ plan: p, payment, balanceAfter, business, address, money }: { plan: InstallmentPlan; payment: PlanPayment; balanceAfter: number; business: string; address?: string; money: (n: number) => string }) {
  return (
    <div style={{ fontFamily: 'Arial, sans-serif', fontSize: 13, color: '#000', padding: 24, maxWidth: 420 }}>
      <h2 style={{ textAlign: 'center', margin: 0 }}>{business}</h2>
      {address && <p style={{ textAlign: 'center', margin: '2px 0' }}>{address}</p>}
      <h3 style={{ textAlign: 'center', letterSpacing: 2 }}>PAYMENT RECEIPT</h3>
      <hr />
      <p>Receipt no: <b>{payment.receiptNo}</b><br />Date: {fmtDateTime(payment.paidAt)}<br />Received from: <b>{p.customerName}</b> ({p.customerPhone})<br />Against invoice: {p.invoiceNo}</p>
      <hr />
      <p style={{ fontSize: 18 }}>Amount received: <b>{money(payment.amount)}</b></p>
      <p>Paid by: {payment.mode.toUpperCase()}{payment.note ? ` · ${payment.note}` : ''}<br />Received by: {payment.receivedBy}</p>
      <hr />
      <p>Total installment price: {money(p.totalPayable)}<br />Balance remaining: <b>{money(balanceAfter)}</b></p>
      <p style={{ textAlign: 'center', marginTop: 24, fontSize: 11 }}>Thank you. Keep this receipt as proof of payment.</p>
    </div>
  );
}
