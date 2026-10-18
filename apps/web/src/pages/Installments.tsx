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
  { key: 'active', label: 'Active' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'completed', label: 'Completed' },
  { key: 'all', label: 'All plans' },
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

  const stats = useQuery({
    queryKey: ['installments', 'stats'],
    queryFn: installmentApi.stats,
    refetchInterval: 30_000,
  });
  const list = useQuery({
    queryKey: ['installments', 'list', filter, q, customerId, page],
    queryFn: () => installmentApi.list({ filter, q: q || undefined, customerId, page, limit }),
  });
  const pages = Math.max(1, Math.ceil((list.data?.total ?? 0) / limit));
  const s = stats.data;
  const plans = list.data?.data ?? [];

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">
            Installment Plans {customerId && <span className="text-sm font-normal text-slate-500">· Filtered by Customer</span>}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Monitor payment schedules, collections, and overdue receivables
          </p>
        </div>
        <Link
          to="/pos"
          className="btn-primary self-start sm:self-auto text-xs font-semibold"
        >
          + New installment sale
        </Link>
      </div>

      {/* ─────────────── Stat Grid ─────────────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Outstanding"
          value={money(s?.outstanding ?? 0)}
          sub={`${s?.activePlans ?? 0} active accounts`}
        />
        <Stat
          label="Overdue"
          value={money(s?.overdueAmount ?? 0)}
          sub={`${s?.overduePlans ?? 0} overdue accounts`}
          tone={s && s.overdueAmount > 0 ? 'bad' : undefined}
        />
        <Stat
          label="Collected Today"
          value={money(s?.collectedToday ?? 0)}
          sub="Today's receipts"
        />
        <div className="card flex flex-col justify-between p-3.5 bg-gradient-to-br from-teal-500/10 to-teal-700/10 border-teal-500/30">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-teal-800 dark:text-teal-300">
              Active Portfolio
            </div>
            <div className="mt-1 text-xl font-bold text-teal-900 dark:text-teal-100">
              {s?.activePlans ?? 0} Plans
            </div>
          </div>
          <Link
            to="/customers"
            className="mt-2 text-xs font-semibold text-teal-700 hover:underline dark:text-teal-400"
          >
            Manage customer credit →
          </Link>
        </div>
      </div>

      {/* ─────────────── Filters & Search ─────────────── */}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0 no-scrollbar">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => {
                setFilter(t.key);
                setPage(1);
              }}
              className={`shrink-0 rounded-xl px-3.5 py-1.5 text-xs font-semibold transition ${
                filter === t.key
                  ? 'bg-teal-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <input
          className="input !w-full sm:!w-72"
          placeholder="Search customer, phone or invoice…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
      </div>

      {/* ─────────────── Desktop Table (hidden on mobile) ─────────────── */}
      <div className="card overflow-x-auto !p-0 hidden md:block">
        <table className="w-full">
          <thead className="border-b border-slate-200 bg-slate-50 dark:border-teal-950 dark:bg-slate-800/40">
            <tr>
              <th className="th">Customer</th>
              <th className="th">Invoice</th>
              <th className="th">Total</th>
              <th className="th">Paid</th>
              <th className="th">Remaining Balance</th>
              <th className="th">Next Due</th>
              <th className="th">Status</th>
              <th className="th text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-teal-950">
            {plans.map((p) => (
              <tr key={p._id}>
                <td className="td">
                  <div className="font-semibold text-slate-900 dark:text-slate-100">{p.customerName}</div>
                  <div className="text-xs text-slate-500">{p.customerPhone}</div>
                </td>
                <td className="td font-mono text-xs text-slate-600 dark:text-slate-400">{p.invoiceNo}</td>
                <td className="td text-xs text-slate-500">{money(p.totalPayable)}</td>
                <td className="td text-xs text-emerald-600 dark:text-emerald-400">{money(p.paidTotal)}</td>
                <td className="td font-bold text-teal-700 dark:text-teal-400">{money(p.balance)}</td>
                <td className="td text-xs">
                  {p.nextDue ? (
                    <>
                      <div className="font-medium text-slate-800 dark:text-slate-200">{fmtDate(p.nextDue.dueDate)}</div>
                      <div className="text-slate-500">{money(p.nextDue.amount)}</div>
                    </>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="td">
                  {p.status === 'completed' ? (
                    <Badge tone="good">Completed</Badge>
                  ) : p.overdueAmount > 0 ? (
                    <Badge tone="bad">Overdue {money(p.overdueAmount)}</Badge>
                  ) : (
                    <Badge>On track</Badge>
                  )}
                </td>
                <td className="td text-right">
                  <Link className="btn-secondary !px-3 !py-1 text-xs font-semibold" to={`/installments/${p._id}`}>
                    Open
                  </Link>
                </td>
              </tr>
            ))}
            {plans.length === 0 && (
              <tr>
                <td className="td text-center text-slate-500 py-8" colSpan={8}>
                  No installment plans found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ─────────────── Mobile Cards View (visible on < md) ─────────────── */}
      <div className="space-y-3 block md:hidden">
        {plans.map((p) => (
          <div key={p._id} className="card space-y-3 p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                  {p.customerName}
                </h3>
                <span className="text-xs text-slate-500">{p.customerPhone}</span>
              </div>
              <div>
                {p.status === 'completed' ? (
                  <Badge tone="good">Completed</Badge>
                ) : p.overdueAmount > 0 ? (
                  <Badge tone="bad">Overdue {money(p.overdueAmount)}</Badge>
                ) : (
                  <Badge>On track</Badge>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs border-y border-slate-100 dark:border-teal-950 py-2.5">
              <div>
                <span className="text-slate-500 dark:text-slate-400">Balance: </span>
                <span className="font-bold text-teal-700 dark:text-teal-400 text-sm block">
                  {money(p.balance)}
                </span>
              </div>
              <div className="text-right">
                <span className="text-slate-500 dark:text-slate-400">Total Price: </span>
                <span className="font-medium text-slate-800 dark:text-slate-200 block">
                  {money(p.totalPayable)}
                </span>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400">Paid: </span>
                <span className="font-medium text-emerald-600 dark:text-emerald-400 block">
                  {money(p.paidTotal)}
                </span>
              </div>
              <div className="text-right">
                <span className="text-slate-500 dark:text-slate-400">Next Due: </span>
                <span className="font-medium text-slate-800 dark:text-slate-200 block">
                  {p.nextDue ? `${fmtDate(p.nextDue.dueDate)} (${money(p.nextDue.amount)})` : 'None'}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] font-mono text-slate-400">
                {p.invoiceNo}
              </span>
              <Link
                className="btn-primary !py-1.5 !px-4 text-xs font-bold"
                to={`/installments/${p._id}`}
              >
                Open Plan Details →
              </Link>
            </div>
          </div>
        ))}

        {plans.length === 0 && (
          <div className="card text-center py-8 text-sm text-slate-500">
            No installment plans found.
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

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'bad';
}) {
  return (
    <div className="card p-3.5 flex flex-col justify-between">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        {label}
      </div>
      <div className={`mt-1 text-xl font-bold ${tone === 'bad' ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-slate-100'}`}>
        {value}
      </div>
      {sub && <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{sub}</div>}
    </div>
  );
}

function Badge({ children, tone }: { children: React.ReactNode; tone?: 'good' | 'bad' }) {
  const cls =
    tone === 'bad'
      ? 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400'
      : tone === 'good'
      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
      : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>{children}</span>;
}
