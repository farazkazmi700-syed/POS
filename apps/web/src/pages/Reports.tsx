import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { reportApi } from '../api';
import { useTenant } from '../hooks/useTenant';
import { fmtDate } from '../utils/dates';
import { errorMessage } from '../utils/errors';
import { formatMoney } from '../utils/money';

type Preset = 'today' | '7' | '30' | 'month' | 'custom';
type Range = { from: string; to: string };

const toYmd = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const shiftDays = (d: Date, days: number): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);

function windowFor(preset: Exclude<Preset, 'custom'>): Range {
  const now = new Date();
  const today = toYmd(now);
  switch (preset) {
    case 'today':
      return { from: today, to: today };
    case '30':
      return { from: toYmd(shiftDays(now, -29)), to: today };
    case 'month':
      return { from: toYmd(new Date(now.getFullYear(), now.getMonth(), 1)), to: today };
    case '7':
    default:
      return { from: toYmd(shiftDays(now, -6)), to: today };
  }
}

const PRESET_LABELS: { value: Preset; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: 'month', label: 'This month' },
  { value: 'custom', label: 'Custom range' },
];

export default function Reports() {
  const { currency, tenant } = useTenant();
  const [preset, setPreset] = useState<Preset>('7');
  const [from, setFrom] = useState(() => windowFor('7').from);
  const [to, setTo] = useState(() => windowFor('7').to);
  const [range, setRange] = useState<Range>(() => windowFor('7'));

  const report = useQuery({ queryKey: ['report', 'sales', range], queryFn: () => reportApi.sales(range) });
  const r = report.data;
  const money = (n: number) => formatMoney(n, currency);
  const maxRevenue = Math.max(1, ...(r?.daily.map((d) => d.revenue) ?? [1]));
  const invalidRange = !from || !to || from > to;

  const choosePreset = (p: Preset) => {
    setPreset(p);
    if (p !== 'custom') {
      const w = windowFor(p);
      setFrom(w.from);
      setTo(w.to);
    }
  };

  const editDate = (field: 'from' | 'to', value: string) => {
    setPreset('custom');
    if (field === 'from') setFrom(value);
    else setTo(value);
  };

  const generate = () => {
    if (!invalidRange) setRange({ from, to });
  };

  const exportCsv = () => {
    if (!r) return;
    const cell = (v: string | number) => {
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows: (string | number)[][] = [
      ['Sales report', `${r.from} to ${r.to}`],
      ['Business', tenant?.name ?? ''],
      [],
      ['Metric', 'Value'],
      ['Revenue', r.revenue],
      ['Orders', r.orders],
      ['Average order', r.averageOrder],
      ['Tax collected', r.tax],
      ['Discounts', r.discounts],
      ['Items sold', r.itemsSold],
      [],
      ['Date', 'Revenue', 'Orders'],
      ...r.daily.map((d) => [d.date, d.revenue, d.orders]),
      [],
      ['Product', 'Qty sold', 'Revenue'],
      ...r.topProducts.map((p) => [p.name, p.qty, p.revenue]),
      [],
      ['Payment mode', 'Orders', 'Revenue'],
      ...r.paymentModes.map((m) => [m.mode, m.orders, m.revenue]),
    ];
    const csv = rows.map((row) => row.map(cell).join(',')).join('\r\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `sales-report_${r.from}_${r.to}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  return (
    <div className="space-y-5">
      {r && (
        <div className="print-only">
          <h1 className="text-lg font-semibold">Sales report</h1>
          <p className="text-sm">
            {tenant?.name ? `${tenant.name} · ` : ''}
            {fmtDate(r.from)} – {fmtDate(r.to)}
          </p>
        </div>
      )}

      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Reports</h1>
        <div className="flex items-center gap-2">
          <button className="btn-secondary" disabled={!r} onClick={exportCsv}>Export CSV</button>
          <button className="btn-secondary" disabled={!r} onClick={() => window.print()}>Print</button>
        </div>
      </div>

      <section className="card no-print">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-40 flex-col gap-1 text-sm">
            Period
            <select className="input" value={preset} onChange={(e) => choosePreset(e.target.value as Preset)}>
              {PRESET_LABELS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            From
            <input className="input" type="date" value={from} max={to || undefined} onChange={(e) => editDate('from', e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            To
            <input className="input" type="date" value={to} min={from || undefined} onChange={(e) => editDate('to', e.target.value)} />
          </label>
          <button className="btn-primary" disabled={invalidRange || report.isFetching} onClick={generate}>
            {report.isFetching ? 'Generating…' : 'Generate report'}
          </button>
        </div>
        {invalidRange && <p className="mt-2 text-sm text-red-600">Pick a valid range: “from” must not be after “to”.</p>}
        {report.isError && <p className="mt-2 text-sm text-red-600">Could not generate the report: {errorMessage(report.error)}</p>}
      </section>

      {report.isLoading && <p className="text-sm text-slate-500">Generating report…</p>}

      {r && !report.isLoading && (
        <>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Period: {fmtDate(r.from)} – {fmtDate(r.to)}
          </p>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Stat label="Revenue" value={money(r.revenue)} />
            <Stat label="Orders" value={String(r.orders)} />
            <Stat label="Average order" value={money(r.averageOrder)} />
            <Stat label="Tax collected" value={money(r.tax)} />
            <Stat label="Discounts" value={money(r.discounts)} />
            <Stat label="Items sold" value={String(r.itemsSold)} />
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <section className="card">
              <h2 className="mb-3 text-sm font-semibold">Revenue by day</h2>
              {r.daily.length === 0 && <p className="text-sm text-slate-500">No sales in this period.</p>}
              <ul className="space-y-2">
                {r.daily.map((d) => (
                  <li key={d.date} className="flex items-center gap-3 text-sm">
                    <span className="w-24 shrink-0 text-slate-500">{fmtDate(d.date)}</span>
                    <div className="h-5 flex-1 rounded bg-slate-100 dark:bg-slate-800">
                      <div className="h-5 rounded bg-indigo-500" style={{ width: `${(d.revenue / maxRevenue) * 100}%` }} />
                    </div>
                    <span className="w-28 shrink-0 text-right">{money(d.revenue)}</span>
                  </li>
                ))}
              </ul>
            </section>

            <div className="space-y-5">
              <section className="card">
                <h2 className="mb-3 text-sm font-semibold">Top products</h2>
                {r.topProducts.length === 0 && <p className="text-sm text-slate-500">No sales in this period.</p>}
                <ol className="divide-y divide-slate-100 dark:divide-slate-800">
                  {r.topProducts.map((p, i) => (
                    <li key={p.productId} className="flex items-center justify-between py-2 text-sm">
                      <span><span className="mr-2 text-slate-400">{i + 1}.</span>{p.name}</span>
                      <span className="text-slate-600 dark:text-slate-300">{p.qty} sold · {money(p.revenue)}</span>
                    </li>
                  ))}
                </ol>
              </section>

              <section className="card">
                <h2 className="mb-3 text-sm font-semibold">Payment modes</h2>
                {r.paymentModes.length === 0 && <p className="text-sm text-slate-500">No sales in this period.</p>}
                <ul className="space-y-2">
                  {r.paymentModes.map((m) => (
                    <li key={m.mode} className="flex items-center gap-3 text-sm">
                      <span className="w-24 shrink-0 capitalize text-slate-500">{m.mode}</span>
                      <div className="h-5 flex-1 rounded bg-slate-100 dark:bg-slate-800">
                        <div
                          className="h-5 rounded bg-emerald-500"
                          style={{ width: `${r.revenue ? (m.revenue / r.revenue) * 100 : 0}%` }}
                        />
                      </div>
                      <span className="w-32 shrink-0 text-right">{m.orders} · {money(m.revenue)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          </div>
        </>
      )}
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
