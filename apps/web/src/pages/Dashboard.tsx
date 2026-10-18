import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { orderApi } from '../api';
import { useTenant } from '../hooks/useTenant';
import { fmtDate } from '../utils/dates';
import { formatMoney } from '../utils/money';

export default function Dashboard() {
  const { currency, tenant } = useTenant();
  const [days, setDays] = useState(7);
  const summary = useQuery({
    queryKey: ['summary', days],
    queryFn: () => orderApi.summary(days),
    refetchInterval: 30_000,
  });
  const s = summary.data;
  const money = (n: number) => formatMoney(n, currency);
  const maxRevenue = Math.max(1, ...(s?.daily.map((d) => d.revenue) ?? [1]));

  return (
    <div className="space-y-5">
      {/* ─────────────── Dashboard Header ─────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Business Overview</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Real-time analytics & performance metrics for {tenant?.name ?? 'your business'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Quick Period Buttons */}
          <div className="flex items-center rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
            {[
              { val: 1, label: 'Today' },
              { val: 7, label: '7 Days' },
              { val: 30, label: '30 Days' },
            ].map((p) => (
              <button
                key={p.val}
                type="button"
                onClick={() => setDays(p.val)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  days === p.val
                    ? 'bg-white text-teal-700 shadow-sm dark:bg-[#002228] dark:text-teal-400'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <Link
            to="/pos"
            className="btn-primary hidden sm:inline-flex text-xs font-bold"
          >
            Terminal (POS) →
          </Link>
        </div>
      </div>

      {summary.isError && (
        <div className="rounded-xl bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950/40 dark:text-red-400">
          Could not load the sales summary. Please check your network connection.
        </div>
      )}

      {/* ─────────────── Stat Cards Grid ─────────────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Total Revenue"
          value={money(s?.revenue ?? 0)}
          sub={`Past ${days === 1 ? '24 hours' : `${days} days`}`}
          highlight
        />
        <StatCard
          label="Orders Completed"
          value={String(s?.orders ?? 0)}
          sub="Successful sales"
        />
        <StatCard
          label="Average Ticket"
          value={money(s && s.orders ? s.revenue / s.orders : 0)}
          sub="Revenue per order"
        />
        <StatCard
          label="Tax Collected"
          value={money(s?.tax ?? 0)}
          sub="GST / Sales tax"
        />
      </div>

      {/* ─────────────── Charts & Analytics ─────────────── */}
      <div className="grid gap-5 lg:grid-cols-2">
        {/* Daily Sales Chart */}
        <section className="card space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-teal-950 pb-3">
            <div>
              <h2 className="text-sm font-bold tracking-tight">Revenue Breakdown by Day</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Sales distribution over period</p>
            </div>
            <span className="text-xs font-semibold text-teal-700 dark:text-teal-400">
              Peak: {money(maxRevenue)}
            </span>
          </div>

          {summary.isLoading ? (
            <p className="py-8 text-center text-xs text-slate-400">Loading daily trend…</p>
          ) : s?.daily.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">No sales recorded in this period.</p>
          ) : (
            <ul className="space-y-2.5">
              {s?.daily.map((d) => {
                const pct = maxRevenue > 0 ? (d.revenue / maxRevenue) * 100 : 0;
                return (
                  <li key={d.date} className="flex items-center gap-2 sm:gap-3 text-xs">
                    <span className="w-20 shrink-0 font-medium text-slate-500 dark:text-slate-400">
                      {fmtDate(d.date)}
                    </span>
                    <div className="h-5 flex-1 rounded-md bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full rounded-md bg-gradient-to-r from-teal-500 to-teal-600 transition-all duration-500"
                        style={{ width: `${Math.max(2, pct)}%` }}
                      />
                    </div>
                    <span className="w-24 shrink-0 text-right font-bold text-slate-800 dark:text-slate-200">
                      {money(d.revenue)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Top Products */}
        <section className="card space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-teal-950 pb-3">
            <div>
              <h2 className="text-sm font-bold tracking-tight">Top Performing Products</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Highest grossing items</p>
            </div>
            <Link to="/products" className="text-xs font-semibold text-teal-700 dark:text-teal-400 hover:underline">
              Inventory →
            </Link>
          </div>

          {summary.isLoading ? (
            <p className="py-8 text-center text-xs text-slate-400">Loading top items…</p>
          ) : s?.topProducts.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">No sales recorded in this period.</p>
          ) : (
            <ol className="divide-y divide-slate-100 dark:divide-teal-950">
              {s?.topProducts.map((p, i) => (
                <li key={p.productId} className="flex items-center justify-between py-2.5 text-xs">
                  <div className="flex items-center gap-2.5 min-w-0 pr-2">
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                        i === 0
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200'
                          : i === 1
                          ? 'bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-200'
                          : i === 2
                          ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                          : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                      }`}
                    >
                      {i + 1}
                    </span>
                    <span className="truncate font-medium text-slate-800 dark:text-slate-200">
                      {p.name}
                    </span>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="font-bold text-teal-700 dark:text-teal-400 block">
                      {money(p.revenue)}
                    </span>
                    <span className="text-[10px] text-slate-400">{p.qty} sold</span>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  highlight = false,
}: {
  label: string;
  value: string;
  sub: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`card p-3.5 sm:p-4 flex flex-col justify-between transition-all ${
        highlight
          ? 'border-teal-500/40 bg-gradient-to-br from-teal-500/5 to-teal-700/10 dark:border-teal-500/30'
          : ''
      }`}
    >
      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        {label}
      </span>
      <div className="mt-2 text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
        {value}
      </div>
      <div className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">{sub}</div>
    </div>
  );
}
