import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { installmentApi } from '../api';
import { useDebounce } from '../hooks/useDebounce';
import { useTenant } from '../hooks/useTenant';
import { fmtDate } from '../utils/dates';
import { formatMoney } from '../utils/money';

type Filter = 'active' | 'overdue' | 'completed' | 'all';
const TABS: { key: Filter; label: string }[] = [
  { key: 'active', label: 'Active' }, { key: 'overdue', label: 'Overdue' }, { key: 'completed', label: 'Completed' }, { key: 'all', label: 'All' },
];

export default function Installments() {
  const { currency } = useTenant();
  const [params] = useSearchParams();
  const customerId = params.get('customerId') ?? undefined;
  const [filter, setFilter] = useState<Filter>(customerId ? 'all' : 'active');
  const [search, setSearch] = useState('');
  const q = useDebounce(search);
  const [page, setPage] = useState(1);
  const limit = 20;
  const money = (n: number) => formatMoney(n, currency);

  const stats = useQuery({ queryKey: ['installments', 'stats'], queryFn: installmentApi.stats, refetchInterval: 30_000 });
  const list = useQuery({
    queryKey: ['installments', 'list', filter, q, customerId, page],
    queryFn: () => installmentApi.list({ filter, q: q || undefined, customerId, page, limit }),
  });
  const pages = Math.max(1, Math.ceil((list.data?.total ?? 0) / limit));
  const s = stats.data;

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold">Installments {customerId && <span className="text-sm font-normal text-slate-500">· one customer</span>}</h1>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Outstanding" value={money(s?.outstanding ?? 0)} sub={`${s?.activePlans ?? 0} active plans`} />
        <Stat label="Overdue" value={money(s?.overdueAmount ?? 0)} sub={`${s?.overduePlans ?? 0} customers late`} tone={s && s.overdueAmount > 0 ? 'bad' : undefined} />
        <Stat label="Collected today" value={money(s?.collectedToday ?? 0)} />
        <Link to="/pos" className="card flex items-center justify-center text-sm font-medium text-indigo-700 hover:border-indigo-400">+ New installment sale (POS)</Link>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => { setFilter(t.key); setPage(1); }}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${filter === t.key ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-100'}`}>
            {t.label}
          </button>
        ))}
        <input className="input !w-72 ml-auto" placeholder="Search customer, phone or invoice…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
      </div>

      <div className="card overflow-x-auto !p-0">
        <table className="w-full">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr><th className="th">Customer</th><th className="th">Invoice</th><th className="th">Total</th><th className="th">Paid</th><th className="th">Balance</th><th className="th">Next due</th><th className="th">Status</th><th className="th" /></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {list.data?.data.map((p) => (
              <tr key={p._id}>
                <td className="td"><div className="font-medium">{p.customerName}</div><div className="text-xs text-slate-500">{p.customerPhone}</div></td>
                <td className="td">{p.invoiceNo}</td>
                <td className="td">{money(p.totalPayable)}</td>
                <td className="td">{money(p.paidTotal)}</td>
                <td className="td font-medium">{money(p.balance)}</td>
                <td className="td">{p.nextDue ? <>{fmtDate(p.nextDue.dueDate)}<div className="text-xs text-slate-500">{money(p.nextDue.amount)}</div></> : '—'}</td>
                <td className="td">
                  {p.status === 'completed' ? <Badge tone="good">Completed</Badge>
                    : p.overdueAmount > 0 ? <Badge tone="bad">Overdue {money(p.overdueAmount)}</Badge>
                    : <Badge>On track</Badge>}
                </td>
                <td className="td text-right"><Link className="btn-secondary !px-2.5 !py-1" to={`/installments/${p._id}`}>Open</Link></td>
              </tr>
            ))}
            {list.data?.data.length === 0 && <tr><td className="td text-slate-500" colSpan={8}>Nothing here.</td></tr>}
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

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'bad' }) {
  return (
    <div className="card">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-xl font-semibold ${tone === 'bad' ? 'text-red-600' : ''}`}>{value}</div>
      {sub && <div className="text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

function Badge({ children, tone }: { children: React.ReactNode; tone?: 'good' | 'bad' }) {
  const cls = tone === 'bad' ? 'bg-red-50 text-red-700' : tone === 'good' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-700';
  return <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${cls}`}>{children}</span>;
}
