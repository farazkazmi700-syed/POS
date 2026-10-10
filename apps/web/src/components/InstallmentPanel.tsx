import type { Customer, InstallmentQuote } from '@pos/shared-types';
import { fmtDate } from '../utils/dates';
import { formatMoney } from '../utils/money';
import CustomerPicker from './CustomerPicker';

export interface InstallmentForm {
  customer: Customer | null;
  downPayment: string;
  downPaymentMode: 'cash' | 'card' | 'wallet';
  months: string;
  /** empty = use the shop's default markup */
  markupPercent: string;
  firstDueDate: string;
}

export const emptyInstallmentForm: InstallmentForm = {
  customer: null, downPayment: '', downPaymentMode: 'cash', months: '6', markupPercent: '', firstDueDate: '',
};

interface Props {
  value: InstallmentForm;
  onChange: (v: InstallmentForm) => void;
  defaultMarkup: number;
  currency: string;
  quote?: InstallmentQuote;
  quoteError?: string | null;
  loading: boolean;
}

export default function InstallmentPanel({ value, onChange, defaultMarkup, currency, quote, quoteError, loading }: Props) {
  const money = (n: number) => formatMoney(n, currency);
  const set = <K extends keyof InstallmentForm>(k: K, v: InstallmentForm[K]) => onChange({ ...value, [k]: v });

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="text-sm font-semibold">Installment terms</div>
      <CustomerPicker value={value.customer} onChange={(c) => set('customer', c)} />

      <div className="grid grid-cols-2 gap-2">
        <div><label className="label">Down payment</label>
          <input className="input" type="number" min={0} step="0.01" placeholder="0" value={value.downPayment} onChange={(e) => set('downPayment', e.target.value)} /></div>
        <div><label className="label">Paid by</label>
          <select className="input" value={value.downPaymentMode} onChange={(e) => set('downPaymentMode', e.target.value as InstallmentForm['downPaymentMode'])}>
            <option value="cash">Cash</option><option value="card">Card</option><option value="wallet">Wallet</option>
          </select></div>
        <div><label className="label">Months</label>
          <input className="input" type="number" min={1} max={60} step={1} value={value.months} onChange={(e) => set('months', e.target.value)} /></div>
        <div><label className="label">Markup % (default {defaultMarkup})</label>
          <input className="input" type="number" min={0} max={100} step="0.01" placeholder={String(defaultMarkup)} value={value.markupPercent} onChange={(e) => set('markupPercent', e.target.value)} /></div>
        <div className="col-span-2"><label className="label">First due date (blank = one month from today)</label>
          <input className="input" type="date" value={value.firstDueDate} onChange={(e) => set('firstDueDate', e.target.value)} /></div>
      </div>

      {quoteError && <p className="text-xs text-red-600">{quoteError}</p>}
      {quote && !quoteError && (
        <dl className="space-y-1 text-sm text-slate-600">
          <div className="flex justify-between"><dt>Cash price</dt><dd>{money(quote.cashTotal)}</dd></div>
          <div className="flex justify-between"><dt>Markup ({quote.markupPercent}%)</dt><dd>{money(quote.markupAmount)}</dd></div>
          <div className="flex justify-between"><dt>Installment price</dt><dd>{money(quote.totalPayable)}</dd></div>
          <div className="flex justify-between"><dt>Down payment</dt><dd>− {money(quote.downPayment)}</dd></div>
          <div className="flex justify-between border-t border-slate-200 pt-1 font-medium text-slate-900">
            <dt>To pay in {quote.months} months</dt><dd>{money(quote.financedAmount)}</dd>
          </div>
          <div className="flex justify-between text-base font-semibold text-indigo-700">
            <dt>Monthly</dt><dd>{money(quote.monthlyAmount)}</dd>
          </div>
          <div className="text-xs text-slate-500">
            First due {fmtDate(quote.firstDueDate)} · last {fmtDate(quote.schedule[quote.schedule.length - 1].dueDate)}
            {quote.schedule[quote.schedule.length - 1].amount !== quote.monthlyAmount && ` (last instalment ${money(quote.schedule[quote.schedule.length - 1].amount)})`}
          </div>
        </dl>
      )}
      {loading && !quote && <p className="text-xs text-slate-500">Calculating…</p>}
    </div>
  );
}
