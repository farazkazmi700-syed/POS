import type { InstallmentPlan, PlanPayment } from '@pos/shared-types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { installmentApi } from '../api';
import { useTenant } from '../hooks/useTenant';
import { fmtDate, fmtDateTime, todayYmd } from '../utils/dates';
import { errorMessage } from '../utils/errors';
import { formatMoney } from '../utils/money';
import { urduClass } from '../utils/urdu';
import '../InvoicePaper.css';

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
  const paymentRequest = useRef<{ details: string; id: string } | null>(null);

  const plan = useQuery({ queryKey: ['installments', 'one', id], queryFn: () => installmentApi.get(id) });
  const p = plan.data;

  const pay = useMutation({
    mutationFn: () => {
      const details = JSON.stringify({ amount: Number(amount), mode, note: note.trim() || undefined });
      if (!paymentRequest.current || paymentRequest.current.details !== details) {
        paymentRequest.current = { details, id: createPaymentRequestId() };
      }
      return installmentApi.pay(id, {
        amount: Number(amount), mode, note: note.trim() || undefined,
        idempotencyKey: paymentRequest.current.id,
      });
    },
    onSuccess: (res) => {
      paymentRequest.current = null;
      setAmount(''); setNote('');
      queryClient.setQueryData(['installments', 'one', id], res.plan);
      queryClient.invalidateQueries({ queryKey: ['installments', 'list'] });
      queryClient.invalidateQueries({ queryKey: ['installments', 'stats'] });
      startPrint({ kind: 'receipt', payment: res.payment, balanceAfter: res.plan.balance });
    },
  });

  const startPrint = setJob;
  useEffect(() => {
    if (!job) return;
    let active = true;
    void Promise.allSettled([
      document.fonts.load('12px "Invoice Latin"', 'Receipt 0123456789'),
      document.fonts.load('12px "Invoice Urdu"', 'ادائیگی کی رسید'),
    ]).then(() => { if (active) window.print(); });
    return () => { active = false; };
  }, [job]);
  useEffect(() => {
    const clear = () => setJob(null);
    window.addEventListener('afterprint', clear);
    return () => window.removeEventListener('afterprint', clear);
  }, []);
  useEffect(() => { paymentRequest.current = null; }, [id]);

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
          <Link to="/installments" className="text-sm text-teal-600 hover:underline dark:text-teal-400">← Installments</Link>
          <h1 className={`page-title ${urduClass(p?.customerName ?? '')}`} dir={urduClass(p?.customerName) ? 'rtl' : undefined}>{p.customerName}</h1>
          <span className="text-sm text-slate-500">{p.invoiceNo}</span>
          {p.status === 'completed' ? <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">Completed</span>
            : p.overdueAmount > 0 ? <span className="rounded bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">Overdue {money(p.overdueAmount)}</span> : null}
          <button className="btn-secondary ml-auto" onClick={() => startPrint({ kind: 'agreement' })}>Print invoice / agreement</button>
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
          <form onSubmit={submit} className="card space-y-3">
            <h2 className="text-sm font-semibold">Collect Installment Payment</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
              <div>
                <label className="label">Amount received *</label>
                <input
                  className="input"
                  type="number"
                  min={0.01}
                  max={p.balance}
                  step="0.01"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
              <div>
                <label className="label">Paid by</label>
                <select className="input" value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                  <option value="wallet">Wallet</option>
                </select>
              </div>
              <div className="sm:col-span-2 lg:col-span-2">
                <label className="label">Note (optional)</label>
                <input
                  className="input"
                  placeholder="e.g. Paid in full / partial"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100 dark:border-teal-950">
              {suggested > 0 && (
                <button
                  type="button"
                  className="btn-secondary text-xs"
                  onClick={() => setAmount(String(suggested))}
                >
                  Pay next due ({money(suggested)})
                </button>
              )}
              <div className="flex items-center gap-2 ml-auto">
                <button
                  className="btn-primary text-xs font-semibold"
                  disabled={pay.isPending}
                >
                  {pay.isPending ? 'Processing…' : 'Collect & print receipt'}
                </button>
              </div>
            </div>
            {pay.isError && <p className="text-sm text-red-600">{errorMessage(pay.error)}</p>}
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
        {job?.kind === 'agreement' && tenant && <Agreement plan={p} business={tenant.name} address={tenant.address} taxRegNo={tenant.taxRegNo} logoUrl={tenant.logoUrl || '/kazmion-logo.jpg'} money={money} />}
        {job?.kind === 'receipt' && tenant && <Receipt plan={p} payment={job.payment} balanceAfter={job.balanceAfter} business={tenant.name} address={tenant.address} logoUrl={tenant.logoUrl || '/kazmion-logo.jpg'} money={money} />}
      </div>
    </>
  );
}

function createPaymentRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

function Box({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="card">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 ${strong ? 'text-xl font-semibold' : 'text-base font-medium'}`}>{value}</div>
    </div>
  );
}

const cell = { borderBottom: '1px solid #e2e8f0', padding: '4px 6px', fontSize: 11 } as const;

function Agreement({ plan: p, business, address, taxRegNo, logoUrl, money }: { plan: InstallmentPlan; business: string; address?: string; taxRegNo?: string; logoUrl?: string; money: (n: number) => string }) {
  const table = { borderCollapse: 'collapse', width: '100%', marginBottom: 14 } as const;
  const headCell = { ...cell, background: '#f8fafc', textAlign: 'left' as const };
  const remainingFor = (amount: number, paid: number) => Math.max(0, amount - paid);

  return (
    <div className="invoice-paper" style={{ padding: 20, position: 'relative' }}>
      {logoUrl && (
        <div style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%, -50%) rotate(-20deg)', opacity: 0.07, pointerEvents: 'none' }}>
          <img src={logoUrl} alt="" style={{ width: 380, height: 380, objectFit: 'contain', filter: 'grayscale(100%)' }} />
        </div>
      )}
      <div style={{ position: 'relative' }}>
        {logoUrl && <div style={{ textAlign: 'center', marginBottom: 8 }}><img src={logoUrl} alt="" style={{ maxHeight: 50, maxWidth: 160, objectFit: 'contain' }} /></div>}
        <h1 style={{ textAlign: 'center', fontSize: 18, fontWeight: 700, margin: 0 }}>Installment Invoice &amp; Agreement</h1>
        <p style={{ textAlign: 'center', margin: '4px 0 16px' }}><bdi>{business}</bdi>{address && <> · <bdi>{address}</bdi></>}{taxRegNo ? ` · NTN ${taxRegNo}` : ''}</p>

        <table style={table}><tbody>
          <tr><td style={cell}>Invoice / plan no.</td><td style={cell}><b>{p.invoiceNo}</b></td><td style={cell}>Plan date</td><td style={cell}>{fmtDate(p.createdAt)}</td></tr>
          <tr><td style={cell}>Plan status</td><td style={cell}>{p.status.toUpperCase()}</td><td style={cell}>Created by</td><td style={cell}>{p.createdByName}</td></tr>
        </tbody></table>

        <h3>Customer &amp; guarantor</h3>
        <table style={table}><tbody>
          <tr><td style={cell}>Customer</td><td style={cell}><b className={`${urduClass(p.customerName)}`} style={{ direction: urduClass(p.customerName) ? 'rtl' : undefined }}>{p.customerName}</b></td><td style={cell}>Phone</td><td style={cell}>{p.customerPhone || '—'}</td></tr>
          <tr><td style={cell}>CNIC</td><td style={cell}>{p.customerCnic || '—'}</td><td style={cell}>Address</td><td style={cell}>{p.customerAddress || '—'}</td></tr>
          <tr><td style={cell}>Guarantor</td><td className={`${urduClass(p.guarantor?.name ?? '')}`} style={{ ...cell, direction: urduClass(p.guarantor?.name) ? 'rtl' : undefined }}>{p.guarantor?.name || '—'}</td><td style={cell}>Phone / CNIC</td><td style={cell}>{[p.guarantor?.phone, p.guarantor?.cnic].filter(Boolean).join(' · ') || '—'}</td></tr>
          <tr><td style={cell}>Guarantor address</td><td style={cell} colSpan={3}>{p.guarantor?.address || '—'}</td></tr>
        </tbody></table>

        <h3>Goods / items</h3>
        <table style={table}>
          <thead><tr><th style={headCell}>Item</th><th style={headCell}>Qty</th><th style={headCell}>IMEI / serial no.</th><th style={{ ...headCell, textAlign: 'right' }}>Unit price</th><th style={{ ...headCell, textAlign: 'right' }}>Discount</th><th style={{ ...headCell, textAlign: 'right' }}>Tax</th><th style={{ ...headCell, textAlign: 'right' }}>Line total</th></tr></thead>
          <tbody>{p.items.map((i, k) => <tr key={k}><td style={cell}>{i.name}</td><td style={cell}>{i.qty}</td><td style={cell}>{i.serialNo || '—'}</td><td style={{ ...cell, textAlign: 'right' }}>{i.unitPrice != null ? money(i.unitPrice) : '—'}</td><td style={{ ...cell, textAlign: 'right' }}>{i.discountAmount != null ? money(i.discountAmount) : '—'}</td><td style={{ ...cell, textAlign: 'right' }}>{i.taxAmount != null ? money(i.taxAmount) : '—'}</td><td style={{ ...cell, textAlign: 'right' }}>{i.lineTotal != null ? money(i.lineTotal) : '—'}</td></tr>)}</tbody>
        </table>

        <h3>Plan price &amp; current account</h3>
        <table style={table}><tbody>
          {[
            ['Cash price', money(p.cashTotal)],
            [`Markup (${p.markupPercent}%)`, money(p.markupAmount)],
            ['Total installment price', money(p.totalPayable)],
            ['Down payment received at sale', money(p.downPayment)],
            ['Amount financed at start', money(p.financedAmount)],
            ['Total paid to date (including down payment)', money(p.paidTotal)],
            ['Remaining amount due', money(p.balance)],
            ['Installment amount', money(p.monthlyAmount)],
            ['Number of installments', String(p.months)],
            ['First due date', fmtDate(p.firstDueDate)],
          ].map(([label, amount]) => <tr key={label}><td style={cell}>{label}</td><td style={{ ...cell, textAlign: 'right', fontWeight: label === 'Remaining amount due' ? 'bold' : 'normal' }}>{amount}</td></tr>)}
        </tbody></table>

        <h3>Installment schedule</h3>
        <table style={table}>
          <thead><tr><th style={headCell}>#</th><th style={headCell}>Due date</th><th style={{ ...headCell, textAlign: 'right' }}>Amount due</th><th style={{ ...headCell, textAlign: 'right' }}>Paid</th><th style={{ ...headCell, textAlign: 'right' }}>Remaining</th><th style={headCell}>Status</th></tr></thead>
          <tbody>{p.schedule.map((s) => <tr key={s.no}><td style={cell}>{s.no}</td><td style={cell}>{fmtDate(s.dueDate)}</td><td style={{ ...cell, textAlign: 'right' }}>{money(s.amount)}</td><td style={{ ...cell, textAlign: 'right' }}>{money(s.paidAmount)}</td><td style={{ ...cell, textAlign: 'right' }}>{money(remainingFor(s.amount, s.paidAmount))}</td><td style={cell}>{s.status.toUpperCase()}</td></tr>)}</tbody>
        </table>

        <h3>Payments received</h3>
        <table style={table}>
          <thead><tr><th style={headCell}>Receipt no.</th><th style={headCell}>Date</th><th style={headCell}>Method</th><th style={{ ...headCell, textAlign: 'right' }}>Amount paid</th><th style={headCell}>Received by / note</th></tr></thead>
          <tbody>
            {p.payments.map((payment) => <tr key={payment.receiptNo}><td style={cell}>{payment.receiptNo}</td><td style={cell}>{fmtDateTime(payment.paidAt)}</td><td style={cell}>{payment.mode.toUpperCase()}</td><td style={{ ...cell, textAlign: 'right' }}>{money(payment.amount)}</td><td style={cell}>{[payment.receivedBy, payment.note].filter(Boolean).join(' · ') || '—'}</td></tr>)}
            {p.payments.length === 0 && <tr><td style={cell} colSpan={5}>No payments recorded.</td></tr>}
          </tbody>
        </table>

        <p style={{ marginTop: 16 }}>The buyer confirms receiving the goods listed above and agrees to pay the remaining amount according to this schedule. The customer and guarantor acknowledge the plan details stated on this invoice.</p>
        <p>Other terms (late payment, default, returns): ____________________________________________<br />______________________________________________________________________________</p>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 48, fontSize: 12 }}>
          {['Buyer', 'Guarantor', 'Seller', 'Witness'].map((role) => <div key={role} style={{ width: '22%', borderTop: '1px solid #000', paddingTop: 4, textAlign: 'center' }}>{role}</div>)}
        </div>
      </div>
    </div>
  );
}

function Receipt({ plan: p, payment, balanceAfter, business, address, logoUrl, money }: { plan: InstallmentPlan; payment: PlanPayment; balanceAfter: number; business: string; address?: string; logoUrl?: string; money: (n: number) => string }) {
  return (
    <article className="invoice-paper invoice-payment">
      <header>
        {logoUrl && <img src={logoUrl} alt="" />}
        <h2><bdi>{business}</bdi></h2>
        {address && <p><bdi>{address}</bdi></p>}
        <h1 className="mt-2">Payment receipt</h1>
        <p lang="ur"><bdi dir="rtl">ادائیگی کی رسید</bdi></p>
      </header>
      <dl>
        <div><dt>Receipt no.</dt><dd><bdi dir="ltr">{payment.receiptNo}</bdi></dd></div>
        <div><dt>Date</dt><dd>{fmtDateTime(payment.paidAt)}</dd></div>
        <div><dt>Received from</dt><dd><bdi>{p.customerName}</bdi>{p.customerPhone && <> · <bdi dir="ltr">{p.customerPhone}</bdi></>}</dd></div>
        <div><dt>Invoice no.</dt><dd><bdi dir="ltr">{p.invoiceNo}</bdi></dd></div>
        <div className="invoice-payment-total"><dt>Amount received</dt><dd>{money(payment.amount)}</dd></div>
        <div><dt>Payment method</dt><dd className="capitalize">{payment.mode}</dd></div>
        {payment.note && <div><dt>Note</dt><dd><bdi>{payment.note}</bdi></dd></div>}
        <div><dt>Received by</dt><dd><bdi>{payment.receivedBy}</bdi></dd></div>
        <div><dt>Total payable</dt><dd>{money(p.totalPayable)}</dd></div>
        <div><dt>Remaining balance</dt><dd className="font-semibold">{money(balanceAfter)}</dd></div>
      </dl>
      <footer>Keep this receipt as proof of payment.</footer>
    </article>
  );
}
