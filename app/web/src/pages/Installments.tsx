import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { installmentApi } from '../api';
import PageHeading from '../components/PageHeading';
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
    <div className="installment-shell space-y-5">
      <div className="hero-panel card">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <PageHeading eyebrow="Credit portfolio" title={customerId ? 'Customer installment plans' : 'Installment plans'} description="Monitor payment schedules, collections, and overdue balances." />
          <div className="flex flex-wrap items-center gap-2.5">
            <Link to="/customers" className="btn-secondary text-xs font-semibold">
              Customer ledger
            </Link>
            <Link to="/pos" className="btn-primary text-xs font-semibold">
              + New installment sale
            </Link>
          </div>
        </div>
      </div>

      <div className="module-stat-grid">
        <Stat
          label="Outstanding"
          value={money(s?.outstanding ?? 0)}
          sub={`${s?.activePlans ?? 0} active accounts`}
          accent="cyan"
        />
        <Stat
          label="Overdue"
          value={money(s?.overdueAmount ?? 0)}
          sub={`${s?.overduePlans ?? 0} overdue accounts`}
          tone={s && s.overdueAmount > 0 ? 'bad' : undefined}
          accent="red"
        />
        <Stat
          label="Collected Today"
          value={money(s?.collectedToday ?? 0)}
          sub="Today's receipts"
          accent="green"
        />
        <div className="metric-card metric-card--accent card">
          <div className="metric-card__eyebrow">Active portfolio</div>
          <div className="metric-card__value">{s?.activePlans ?? 0}</div>
          <div className="metric-card__meta">plans in motion</div>
          <Link to="/customers" className="metric-card__link">
            Manage credit →
          </Link>
        </div>
      </div>

      <div className="toolbar-row card">
        <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0 no-scrollbar">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => {
                setFilter(t.key);
                setPage(1);
              }}
              className={`pill-button ${filter === t.key ? 'is-active' : ''}`}
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
        <table className="data-table w-full">
          <thead>
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
          <tbody>
            {plans.map((p) => (
              <tr key={p._id}>
                <td className="td">
                  <div className="customer-cell">
                    <div className="customer-cell__avatar">{p.customerName.slice(0, 1).toUpperCase()}</div>
                    <div>
                      <div className="customer-cell__name">{p.customerName}</div>
                      <div className="customer-cell__meta">{p.customerPhone}</div>
                    </div>
                  </div>
                </td>
                <td className="td"><span className="invoice-chip">{p.invoiceNo}</span></td>
                <td className="td text-slate-600 dark:text-slate-300">{money(p.totalPayable)}</td>
                <td className="td text-emerald-600 dark:text-emerald-400 font-semibold">{money(p.paidTotal)}</td>
                <td className="td font-bold text-teal-700 dark:text-teal-300">{money(p.balance)}</td>
                <td className="td text-xs">
                  {p.nextDue ? (
                    <div className="due-stack">
                      <div className="due-stack__date">{fmtDate(p.nextDue.dueDate)}</div>
                      <div className="due-stack__amount">{money(p.nextDue.amount)}</div>
                    </div>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                <td className="td">
                  {p.status === 'completed' ? (
                    <Badge tone="good">Completed</Badge>
                  ) : p.overdueAmount > 0 ? (
                    <Badge tone="bad">Overdue {money(p.overdueAmount)}</Badge>
                  ) : (
                    <Badge tone={p.paidTotal > 0 ? 'partial' : 'pending'}>{p.paidTotal > 0 ? 'Partially paid' : 'Pending'}</Badge>
                  )}
                </td>
                <td className="td text-right">
                  <Link className="compact-link" to={`/installments/${p._id}`}>
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
                  <Badge tone={p.paidTotal > 0 ? 'partial' : 'pending'}>{p.paidTotal > 0 ? 'Partially paid' : 'Pending'}</Badge>
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
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'bad';
  accent?: 'cyan' | 'red' | 'green';
}) {
  const accentClass =
    accent === 'red'
      ? 'text-red-600 dark:text-red-400'
      : accent === 'green'
      ? 'text-emerald-600 dark:text-emerald-400'
      : 'text-teal-700 dark:text-teal-300';

  return (
    <div className="metric-card card">
      <div className="metric-card__eyebrow">{label}</div>
      <div className={`metric-card__value ${tone === 'bad' ? 'text-red-600 dark:text-red-400' : accentClass}`}>
        {value}
      </div>
      {sub && <div className="metric-card__meta">{sub}</div>}
    </div>
  );
}

function Badge({ children, tone }: { children: React.ReactNode; tone?: 'good' | 'bad' | 'partial' | 'pending' }) {
  const cls = tone === 'bad'
    ? 'status-badge status-badge--bad'
    : tone === 'good'
    ? 'status-badge status-badge--good'
    : 'status-badge status-badge--default';
  return <span className={cls} data-financial-status={tone === 'partial' || tone === 'pending' ? tone : undefined}>{children}</span>;
}
