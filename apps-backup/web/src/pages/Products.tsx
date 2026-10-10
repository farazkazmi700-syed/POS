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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">Products</h1>
        <input className="input !w-64" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} /> Low stock only
        </label>
        <button className="btn-primary ml-auto" onClick={() => { save.reset(); setEditing({ form: empty }); }}>+ Add product</button>
      </div>

      <div className="card overflow-x-auto !p-0">
        <table className="w-full">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr><th className="th">Name</th><th className="th">SKU</th><th className="th">Category</th><th className="th">Price</th><th className="th">Stock</th><th className="th">Tax</th><th className="th" /></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {list.data?.data.map((p) => {
              const low = p.trackStock && p.stockQty <= p.lowStockThreshold;
              return (
                <tr key={p._id}>
                  <td className="td font-medium">{p.name}</td>
                  <td className="td text-slate-500">{p.sku ?? '—'}</td>
                  <td className="td text-slate-500">{p.category ?? '—'}</td>
                  <td className="td">{formatMoney(p.price, currency)}</td>
                  <td className={`td ${low ? 'font-medium text-red-600' : ''}`}>{p.trackStock ? `${p.stockQty} ${p.unit}` : 'n/a'}</td>
                  <td className="td capitalize text-slate-500">{p.taxClass}</td>
                  <td className="td space-x-2 text-right">
                    <button className="btn-secondary !px-2.5 !py-1" onClick={() => { save.reset(); setEditing({ id: p._id, form: fromProduct(p) }); }}>Edit</button>
                    <button
                      className="btn-danger" disabled={remove.isPending}
                      onClick={() => { if (confirm(`Remove "${p.name}"? Past sales keep their record.`)) remove.mutate(p._id); }}
                    >Remove</button>
                  </td>
                </tr>
              );
            })}
            {list.data?.data.length === 0 && <tr><td className="td text-slate-500" colSpan={7}>No products yet.</td></tr>}
          </tbody>
        </table>
      </div>

      {editing && (
        <Modal title={editing.id ? 'Edit product' : 'Add product'} onClose={() => setEditing(null)}>
          <form onSubmit={submit} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2"><label className="label">Name</label>
                <input className="input" required value={editing.form.name} onChange={(e) => setField('name', e.target.value)} /></div>
              <div><label className="label">SKU / barcode</label>
                <input className="input" value={editing.form.sku} onChange={(e) => setField('sku', e.target.value)} /></div>
              <div><label className="label">Category</label>
                <input className="input" value={editing.form.category} onChange={(e) => setField('category', e.target.value)} /></div>
              <div><label className="label">Selling price</label>
                <input className="input" type="number" min={0} step="0.01" required value={editing.form.price} onChange={(e) => setField('price', e.target.value)} /></div>
              <div><label className="label">Cost price</label>
                <input className="input" type="number" min={0} step="0.01" value={editing.form.costPrice} onChange={(e) => setField('costPrice', e.target.value)} /></div>
              <div><label className="label">Unit (pcs, kg, plate, hour…)</label>
                <input className="input" value={editing.form.unit} onChange={(e) => setField('unit', e.target.value)} /></div>
              <div><label className="label">Tax class</label>
                <select className="input" value={editing.form.taxClass} onChange={(e) => setField('taxClass', e.target.value as TaxClass)}>
                  <option value="standard">Standard rate</option><option value="reduced">Reduced rate</option><option value="exempt">Exempt</option>
                </select></div>
              <div className="flex items-end"><label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={editing.form.trackStock} onChange={(e) => setField('trackStock', e.target.checked)} />
                Track stock (untick for services)</label></div>
              {editing.form.trackStock && (<>
                <div><label className="label">Stock on hand</label>
                  <input className="input" type="number" min={0} step="any" value={editing.form.stockQty} onChange={(e) => setField('stockQty', e.target.value)} /></div>
                <div><label className="label">Low-stock alert at</label>
                  <input className="input" type="number" min={0} step="any" value={editing.form.lowStockThreshold} onChange={(e) => setField('lowStockThreshold', e.target.value)} /></div>
              </>)}
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="label !mb-0">Custom fields (batch no, expiry, spice level…)</label>
                <button type="button" className="text-xs font-medium text-indigo-600" onClick={() => setField('attrs', [...editing.form.attrs, { key: '', value: '' }])}>+ Add field</button>
              </div>
              {editing.form.attrs.map((a, idx) => (
                <div key={idx} className="mb-1.5 flex gap-2">
                  <input className="input" placeholder="Field name" value={a.key}
                    onChange={(e) => setField('attrs', editing.form.attrs.map((x, i) => (i === idx ? { ...x, key: e.target.value } : x)))} />
                  <input className="input" placeholder="Value" value={a.value}
                    onChange={(e) => setField('attrs', editing.form.attrs.map((x, i) => (i === idx ? { ...x, value: e.target.value } : x)))} />
                  <button type="button" className="px-2 text-slate-400 hover:text-red-600" onClick={() => setField('attrs', editing.form.attrs.filter((_, i) => i !== idx))}>×</button>
                </div>
              ))}
            </div>

            {save.isError && <p className="text-sm text-red-600">{errorMessage(save.error)}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn-primary" disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save product'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
