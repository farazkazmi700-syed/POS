import type { Product, TaxClass } from '@pos/shared-types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { productApi, type ProductInput } from '../api';
import Modal from '../components/Modal';
import { useDebounce } from '../hooks/useDebounce';
import { useTenant } from '../hooks/useTenant';
import { errorMessage } from '../utils/errors';
import { formatMoney } from '../utils/money';

interface FormState {
  name: string; sku: string; category: string; unit: string; price: string; costPrice: string;
  stockQty: string; lowStockThreshold: string; trackStock: boolean; taxClass: TaxClass;
  attrs: { key: string; value: string }[];
}

const empty: FormState = {
  name: '', sku: '', category: '', unit: 'pcs', price: '', costPrice: '', stockQty: '0',
  lowStockThreshold: '5', trackStock: true, taxClass: 'standard', attrs: [],
};

const fromProduct = (p: Product): FormState => ({
  name: p.name, sku: p.sku ?? '', category: p.category ?? '', unit: p.unit, price: String(p.price),
  costPrice: String(p.costPrice), stockQty: String(p.stockQty), lowStockThreshold: String(p.lowStockThreshold),
  trackStock: p.trackStock, taxClass: p.taxClass,
  attrs: Object.entries(p.attributes ?? {}).map(([key, value]) => ({ key, value: String(value) })),
});

/** "12" -> 12, "true" -> true, anything else stays text. */
function parseAttr(v: string): string | number | boolean {
  if (v === 'true') return true;
  if (v === 'false') return false;
  return v.trim() !== '' && !Number.isNaN(Number(v)) ? Number(v) : v;
}

function toInput(f: FormState): ProductInput {
  return {
    name: f.name.trim(),
    sku: f.sku.trim() || undefined,
    category: f.category.trim() || undefined,
    unit: f.unit.trim() || 'pcs',
    price: Number(f.price),
    costPrice: Number(f.costPrice || 0),
    stockQty: Number(f.stockQty || 0),
    lowStockThreshold: Number(f.lowStockThreshold || 0),
    trackStock: f.trackStock,
    taxClass: f.taxClass,
    attributes: Object.fromEntries(f.attrs.filter((a) => a.key.trim()).map((a) => [a.key.trim(), parseAttr(a.value)])),
  };
}

export default function Products() {
  const queryClient = useQueryClient();
  const { currency } = useTenant();
  const [search, setSearch] = useState('');
  const [lowOnly, setLowOnly] = useState(false);
  const q = useDebounce(search);
  const [editing, setEditing] = useState<{ id?: string; form: FormState } | null>(null);

  const list = useQuery({
    queryKey: ['products', 'manage', q, lowOnly],
    queryFn: () => productApi.list({ q: q || undefined, lowStock: lowOnly || undefined, limit: 100 }),
  });

  const save = useMutation({
    mutationFn: (v: { id?: string; form: FormState }) =>
      v.id ? productApi.update(v.id, toInput(v.form)) : productApi.create(toInput(v.form)),
    onSuccess: () => { setEditing(null); queryClient.invalidateQueries({ queryKey: ['products'] }); },
  });
  const remove = useMutation({
    mutationFn: productApi.remove,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['products'] }),
  });

  const submit = (e: FormEvent) => { e.preventDefault(); if (editing) save.mutate(editing); };
  const setField = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setEditing((s) => (s ? { ...s, form: { ...s.form, [k]: v } } : s));

  const productsList = list.data?.data ?? [];

  return (
    <div className="space-y-4">
      {/* ─────────────── Controls Header ─────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Products & Inventory</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {productsList.length} items in catalog
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <input
            className="input !w-full sm:!w-64"
            placeholder="Search name, SKU, category…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <label className="flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300 cursor-pointer select-none rounded-xl border border-slate-200 dark:border-teal-950 px-3 py-2 bg-slate-50 dark:bg-slate-800/40">
            <input
              type="checkbox"
              className="accent-teal-600"
              checked={lowOnly}
              onChange={(e) => setLowOnly(e.target.checked)}
            />
            <span>Low stock only</span>
          </label>
          <button
            className="btn-primary w-full sm:w-auto"
            onClick={() => { save.reset(); setEditing({ form: empty }); }}
          >
            + Add product
          </button>
        </div>
      </div>

      {/* ─────────────── Desktop Table (hidden on mobile) ─────────────── */}
      <div className="card overflow-x-auto !p-0 hidden md:block">
        <table className="w-full">
          <thead className="border-b border-slate-200 bg-slate-50 dark:border-teal-950 dark:bg-slate-800/40">
            <tr>
              <th className="th">Name</th>
              <th className="th">SKU</th>
              <th className="th">Category</th>
              <th className="th">Selling Price</th>
              <th className="th">Stock</th>
              <th className="th">Tax</th>
              <th className="th text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-teal-950">
            {productsList.map((p) => {
              const low = p.trackStock && p.stockQty <= p.lowStockThreshold;
              return (
                <tr key={p._id}>
                  <td className="td font-semibold text-slate-900 dark:text-slate-100">{p.name}</td>
                  <td className="td text-xs text-slate-500">{p.sku ?? '—'}</td>
                  <td className="td">
                    {p.category ? (
                      <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 text-xs text-slate-600 dark:text-slate-300">
                        {p.category}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="td font-bold text-teal-700 dark:text-teal-400">{formatMoney(p.price, currency)}</td>
                  <td className="td">
                    {p.trackStock ? (
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          low
                            ? 'bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400'
                            : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                        }`}
                      >
                        {p.stockQty} {p.unit}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">Untracked</span>
                    )}
                  </td>
                  <td className="td capitalize text-xs text-slate-500">{p.taxClass}</td>
                  <td className="td space-x-2 text-right">
                    <button
                      className="btn-secondary !px-2.5 !py-1 text-xs"
                      onClick={() => { save.reset(); setEditing({ id: p._id, form: fromProduct(p) }); }}
                    >
                      Edit
                    </button>
                    <button
                      className="btn-danger !px-2.5 !py-1 text-xs"
                      disabled={remove.isPending}
                      onClick={() => {
                        if (confirm(`Remove "${p.name}"? Past sales keep their record.`)) remove.mutate(p._id);
                      }}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              );
            })}
            {productsList.length === 0 && (
              <tr>
                <td className="td text-center text-slate-500 py-8" colSpan={7}>
                  No products found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ─────────────── Mobile Cards View (visible on < md) ─────────────── */}
      <div className="space-y-3 block md:hidden">
        {productsList.map((p) => {
          const low = p.trackStock && p.stockQty <= p.lowStockThreshold;
          return (
            <div key={p._id} className="card space-y-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                    {p.name}
                  </h3>
                  {p.sku && (
                    <p className="text-[11px] text-slate-400">SKU: {p.sku}</p>
                  )}
                </div>
                <div className="text-right">
                  <span className="text-base font-bold text-teal-700 dark:text-teal-400">
                    {formatMoney(p.price, currency)}
                  </span>
                  {p.category && (
                    <span className="block mt-0.5 text-[10px] text-slate-500">
                      {p.category}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-slate-100 dark:border-teal-950 pt-2 text-xs">
                <div>
                  <span className="text-slate-500 dark:text-slate-400">Stock: </span>
                  {p.trackStock ? (
                    <span
                      className={`font-semibold ${
                        low ? 'text-red-600' : 'text-emerald-600 dark:text-emerald-400'
                      }`}
                    >
                      {p.stockQty} {p.unit} {low && '(Low stock)'}
                    </span>
                  ) : (
                    <span className="text-slate-400">Service / Untracked</span>
                  )}
                </div>
                <div className="text-slate-500">
                  Tax: <span className="capitalize font-medium text-slate-700 dark:text-slate-300">{p.taxClass}</span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-100 dark:border-teal-950">
                <button
                  className="btn-secondary flex-1 !py-2 text-xs font-semibold"
                  onClick={() => { save.reset(); setEditing({ id: p._id, form: fromProduct(p) }); }}
                >
                  Edit Product
                </button>
                <button
                  className="btn-danger !py-2 px-3 text-xs"
                  disabled={remove.isPending}
                  onClick={() => {
                    if (confirm(`Remove "${p.name}"? Past sales keep their record.`)) remove.mutate(p._id);
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          );
        })}

        {productsList.length === 0 && (
          <div className="card text-center py-8 text-sm text-slate-500">
            No products found.
          </div>
        )}
      </div>

      {/* ─────────────── Add / Edit Modal ─────────────── */}
      {editing && (
        <Modal title={editing.id ? 'Edit Product' : 'Add New Product'} onClose={() => setEditing(null)}>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="label">Product Name *</label>
                <input
                  className="input"
                  required
                  placeholder="e.g. Wireless Mouse or Espresso"
                  value={editing.form.name}
                  onChange={(e) => setField('name', e.target.value)}
                />
              </div>
              <div>
                <label className="label">SKU / Barcode</label>
                <input
                  className="input"
                  placeholder="Optional code"
                  value={editing.form.sku}
                  onChange={(e) => setField('sku', e.target.value)}
                />
              </div>
              <div>
                <label className="label">Category</label>
                <input
                  className="input"
                  placeholder="e.g. Electronics, Beverages"
                  value={editing.form.category}
                  onChange={(e) => setField('category', e.target.value)}
                />
              </div>
              <div>
                <label className="label">Selling Price *</label>
                <input
                  className="input"
                  type="number"
                  min={0}
                  step="0.01"
                  required
                  placeholder="0.00"
                  value={editing.form.price}
                  onChange={(e) => setField('price', e.target.value)}
                />
              </div>
              <div>
                <label className="label">Cost Price</label>
                <input
                  className="input"
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="0.00"
                  value={editing.form.costPrice}
                  onChange={(e) => setField('costPrice', e.target.value)}
                />
              </div>
              <div>
                <label className="label">Unit</label>
                <input
                  className="input"
                  placeholder="pcs, kg, box, plate…"
                  value={editing.form.unit}
                  onChange={(e) => setField('unit', e.target.value)}
                />
              </div>
              <div>
                <label className="label">Tax Class</label>
                <select
                  className="input"
                  value={editing.form.taxClass}
                  onChange={(e) => setField('taxClass', e.target.value as TaxClass)}
                >
                  <option value="standard">Standard rate</option>
                  <option value="reduced">Reduced rate</option>
                  <option value="exempt">Exempt</option>
                </select>
              </div>

              <div className="sm:col-span-2 rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3 border border-slate-200 dark:border-teal-950">
                <label className="flex items-center gap-2.5 text-xs font-semibold cursor-pointer select-none">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-teal-600 rounded"
                    checked={editing.form.trackStock}
                    onChange={(e) => setField('trackStock', e.target.checked)}
                  />
                  <span>Track Inventory for this Product (untick for services or unlimited stock)</span>
                </label>

                {editing.form.trackStock && (
                  <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-slate-200 dark:border-teal-900/40">
                    <div>
                      <label className="label">Stock on Hand</label>
                      <input
                        className="input"
                        type="number"
                        min={0}
                        step="any"
                        value={editing.form.stockQty}
                        onChange={(e) => setField('stockQty', e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="label">Low Stock Alert Limit</label>
                      <input
                        className="input"
                        type="number"
                        min={0}
                        step="any"
                        value={editing.form.lowStockThreshold}
                        onChange={(e) => setField('lowStockThreshold', e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Custom attributes */}
            <div className="pt-2 border-t border-slate-100 dark:border-teal-950">
              <div className="mb-2 flex items-center justify-between">
                <label className="label !mb-0">Custom Attributes (IMEI, batch no, warranty…)</label>
                <button
                  type="button"
                  className="text-xs font-semibold text-teal-600 hover:underline dark:text-teal-400"
                  onClick={() => setField('attrs', [...editing.form.attrs, { key: '', value: '' }])}
                >
                  + Add attribute
                </button>
              </div>
              {editing.form.attrs.map((a, idx) => (
                <div key={idx} className="mb-2 flex gap-2 items-center">
                  <input
                    className="input text-xs"
                    placeholder="Field label"
                    value={a.key}
                    onChange={(e) =>
                      setField('attrs', editing.form.attrs.map((x, i) => (i === idx ? { ...x, key: e.target.value } : x)))
                    }
                  />
                  <input
                    className="input text-xs"
                    placeholder="Field value"
                    value={a.value}
                    onChange={(e) =>
                      setField('attrs', editing.form.attrs.map((x, i) => (i === idx ? { ...x, value: e.target.value } : x)))
                    }
                  />
                  <button
                    type="button"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:text-red-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                    onClick={() => setField('attrs', editing.form.attrs.filter((_, i) => i !== idx))}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            {save.isError && (
              <p className="rounded-lg bg-red-50 p-2.5 text-xs text-red-600 dark:bg-red-950/40 dark:text-red-400">
                {errorMessage(save.error)}
              </p>
            )}

            <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-teal-950">
              <button type="button" className="btn-secondary" onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button className="btn-primary" disabled={save.isPending}>
                {save.isPending ? 'Saving product…' : 'Save product'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
