import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { orderApi } from '../api';
import { useTenant } from '../hooks/useTenant';
import { formatMoney } from '../utils/money';

export default function Dashboard() {
  const { currency } = useTenant();
  const [days, setDays] = useState(7);
  const summary = useQuery({ queryKey: ['summary', days], queryFn: () => orderApi.summary(days) });
  const s = summary.data;
  const money = (n: number) => formatMoney(n, currency);
  const maxRevenue = Math.max(1, ...(s?.daily.map((d) => d.revenue) ?? [1]));

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <select className="input !w-auto" value={days} onChange={(e) => setDays(Number(e.target.value))}>
          <option value={1}>Today</option><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option>
        </select>
      </div>

      {summary.isError && <p className="text-sm text-red-600">Could not load the sales summary.</p>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Revenue" value={money(s?.revenue ?? 0)} />
        <Stat label="Orders" value={String(s?.orders ?? 0)} />
        <Stat label="Average order" value={money(s && s.orders ? s.revenue / s.orders : 0)} />
        <Stat label="Tax collected" value={money(s?.tax ?? 0)} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card">
          <h2 className="mb-3 text-sm font-semibold">Revenue by day</h2>
          {s?.daily.length === 0 && <p className="text-sm text-slate-500">No sales in this period.</p>}
          <ul className="space-y-2">
            {s?.daily.map((d) => (
              <li key={d.date} className="flex items-center gap-3 text-sm">
                <span className="w-24 shrink-0 text-slate-500">{d.date}</span>
                <div className="h-5 flex-1 rounded bg-slate-100">
                  <div className="h-5 rounded bg-indigo-500" style={{ width: `${(d.revenue / maxRevenue) * 100}%` }} />
                </div>
                <span className="w-28 shrink-0 text-right">{money(d.revenue)}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="card">
          <h2 className="mb-3 text-sm font-semibold">Top products</h2>
          {s?.topProducts.length === 0 && <p className="text-sm text-slate-500">No sales in this period.</p>}
          <ol className="divide-y divide-slate-100">
            {s?.topProducts.map((p, i) => (
              <li key={p.productId} className="flex items-center justify-between py-2 text-sm">
                <span><span className="mr-2 text-slate-400">{i + 1}.</span>{p.name}</span>
                <span className="text-slate-600">{p.qty} sold · {money(p.revenue)}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
    </div>
  );
}
