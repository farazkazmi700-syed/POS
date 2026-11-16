import { useMemo, useState, type ChangeEvent } from 'react';
import { Link } from 'react-router-dom';
import { IconBox, IconPlus, IconEdit, IconTrash2, IconAlertCircle } from '../components/Icons';

interface SparePart {
  id: string;
  sku: string;
  name: string;
  category: string;
  stockQty: number;
  reorderLevel: number;
  unitPrice: number;
  supplier: string;
  location: string;
  isActive: boolean;
}

const seedParts: SparePart[] = [
  { id: 'sp-1', sku: 'SP-1001', name: 'Thermal Receipt Printer Head', category: 'Printer', stockQty: 4, reorderLevel: 5, unitPrice: 4200, supplier: 'PosTech Supplies', location: 'A-12', isActive: true },
  { id: 'sp-2', sku: 'SP-1002', name: 'Barcode Scanner (USB)', category: 'Scanner', stockQty: 18, reorderLevel: 6, unitPrice: 3100, supplier: 'ScanFast', location: 'B-04', isActive: true },
  { id: 'sp-3', sku: 'SP-1003', name: 'Cash Drawer Lock & Key', category: 'Cash Drawer', stockQty: 0, reorderLevel: 3, unitPrice: 950, supplier: 'Vault Parts', location: 'C-01', isActive: true },
  { id: 'sp-4', sku: 'SP-1004', name: 'Card Reader Terminal', category: 'Payments', stockQty: 7, reorderLevel: 4, unitPrice: 8500, supplier: 'PayLink', location: 'A-07', isActive: true },
  { id: 'sp-5', sku: 'SP-1005', name: 'Label Roll 4x6 (pack)', category: 'Consumable', stockQty: 22, reorderLevel: 10, unitPrice: 620, supplier: 'LabelCo', location: 'D-09', isActive: true },
  { id: 'sp-6', sku: 'SP-1006', name: 'Power Adapter 12V', category: 'Power', stockQty: 2, reorderLevel: 4, unitPrice: 1100, supplier: 'PowerHub', location: 'B-02', isActive: true },
  { id: 'sp-7', sku: 'SP-1007', name: 'Customer Display Screen', category: 'Display', stockQty: 3, reorderLevel: 3, unitPrice: 5400, supplier: 'ViewPos', location: 'A-03', isActive: false },
];

export default function Spare() {
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [editing, setEditing] = useState<SparePart | null>(null);
  const [parts, setParts] = useState<SparePart[]>(() => seedParts);

  const categories = useMemo(
    () => ['all', ...Array.from(new Set(parts.map((p) => p.category)))],
    [parts]
  );

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return parts.filter(
      (p) =>
        p.isActive &&
        (categoryFilter === 'all' || p.category === categoryFilter) &&
        (p.sku.toLowerCase().includes(q) || p.name.toLowerCase().includes(q) || p.supplier.toLowerCase().includes(q))
    );
  }, [parts, query, categoryFilter]);

  const lowStock = filtered.filter((p) => p.stockQty <= p.reorderLevel);
  const totalValue = filtered.reduce((sum, p) => sum + p.stockQty * p.unitPrice, 0);

  const handleDelete = (id: string) => {
    if (!window.confirm('Remove this spare part?')) return;
    setParts(parts.filter((p) => p.id !== id));
  };

  const handleAdjust = (id: string, delta: number) => {
    // No backend spare-parts API exists yet; stock changes live in this session only.
    setParts(
      parts.map((p) => (p.id === id ? { ...p, stockQty: Math.max(0, p.stockQty + delta) } : p))
    );
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <section className="dev-panel padded">
        <header className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="kicker">Inventory &bull; Spare parts</p>
            <h3>Spare parts</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Track hardware spare parts, stock levels, and reorder points for POS terminals and peripherals.
            </p>
          </div>
          <Link className="dev-btn dev-btn-primary" to="/">
            <IconBox className="w-4 h-4" /> Back to dashboard
          </Link>
        </header>
        <div className="dev-grid cols-4 mt-5">
          <div className="dev-stat">
            <p className="kicker">Total parts</p>
            <p className="value">{filtered.length}</p>
            <p className="text-xs text-slate-500">Active catalogue items</p>
          </div>
          <div className="dev-stat">
            <p className="kicker">Low on stock</p>
            <p className={`value ${lowStock.length ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
              {lowStock.length}
            </p>
            <p className="text-xs text-slate-500">At or below reorder level</p>
          </div>
          <div className="dev-stat">
            <p className="kicker">Catalogue value</p>
            <p className="value">PKR {totalValue.toLocaleString()}</p>
            <p className="text-xs text-slate-500">Stock on hand &times; unit price</p>
          </div>
          <div className="dev-stat">
            <p className="kicker">Categories</p>
            <p className="value">{categories.length - 1}</p>
            <p className="text-xs text-slate-500">Distinct part categories</p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <div className="dev-field" style={{ minWidth: 220 }}>
            <label>Search parts</label>
            <input
              className="dev-input"
              value={query}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setQuery(e.currentTarget.value)}
              placeholder="SKU, name or supplier"
            />
          </div>
          <div className="dev-field" style={{ minWidth: 200, display: 'flex', alignItems: 'end' }}>
            <label style={{ display: 'block', marginBottom: 0 }}>Category</label>
            <select
              className="dev-select"
              value={categoryFilter}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => setCategoryFilter(e.currentTarget.value)}
              style={{ minWidth: 200 }}
            >
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c === 'all' ? 'All categories' : c}
                </option>
              ))}
            </select>
          </div>
          <button className="dev-btn dev-btn-primary" onClick={() => setEditing({ ...parts[0], id: 'new', sku: '', name: '', stockQty: 0, reorderLevel: 0, unitPrice: 0 } as SparePart)}>
            <IconPlus className="w-4 h-4" /> Add part
          </button>
        </div>
      </section>
      <section className="dev-panel padded">
        <table className="dev-table">
          <thead>
            <tr>
              <th style={{ width: 140 }}>SKU</th>
              <th>Part name</th>
              <th style={{ width: 150 }}>Category</th>
              <th style={{ width: 130 }}>Stock</th>
              <th style={{ width: 120 }}>Reorder</th>
              <th style={{ width: 140 }}>Unit price</th>
              <th style={{ width: 150 }}>Supplier</th>
              <th style={{ width: 110 }}>Location</th>
              <th style={{ width: 170 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="dev-empty" style={{ padding: 30, textAlign: 'center', border: 'none', background: 'transparent' }}>
                  <svg className="w-10 h-10 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  {query || categoryFilter !== 'all' ? (
                    <>
                      <h3 style={{ margin: 0 }}>No parts match your filters</h3>
                      <p className="text-sm text-slate-500 mt-1">Try clearing the search or selecting a different category.</p>
                    </>
                  ) : (
                    <>
                      <h3 style={{ margin: 0 }}>No spare parts yet</h3>
                      <p className="text-sm text-slate-500 mt-1">Add your first spare part to begin tracking stock.</p>
                    </>
                  )}
                </td>
              </tr>
            ) : (
              filtered.map((p) => (
                <tr key={p.id}>
                  <td><span className="font-mono text-sm">{p.sku}</span></td>
                  <td>
                    <span className="dev-list-item-title">{p.name}</span>{!p.isActive && <span className="dev-badge dev-badge-outline" style={{ marginLeft: 8, fontSize: 10 }}>Inactive</span>}
                  </td>
                  <td>{p.category}</td>
                  <td>
                    <span className={`font-semibold ${p.stockQty <= p.reorderLevel ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                      {p.stockQty}
                    </span>{p.stockQty <= p.reorderLevel && <span className="dev-badge dev-badge-danger" style={{ fontSize: 10, marginLeft: 6 }}>Low</span>}
                  </td>
                  <td>{p.reorderLevel}</td>
                  <td>PKR {p.unitPrice.toLocaleString()}</td>
                  <td>{p.supplier}</td>
                  <td>{p.location}</td>
                  <td className="flex items-center gap-2">
                    <button className="dev-icon-btn dev-btn-ghost" onClick={() => handleAdjust(p.id, 1)} title="Increase stock" aria-label={`Increase ${p.name} stock`}>
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                    </button>
                    <button className="dev-icon-btn dev-btn-ghost" onClick={() => handleAdjust(p.id, -1)} title="Decrease stock" aria-label={`Decrease ${p.name} stock`} disabled={p.stockQty <= 0}>
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" /></svg>
                    </button>
                    <button className="dev-icon-btn dev-btn-ghost" onClick={() => setEditing(p)} title="Edit part">
                      <IconEdit className="w-3 h-3" />
                    </button>
                    <button className="dev-icon-btn dev-btn-ghost" onClick={() => handleDelete(p.id)} title="Delete part">
                      <IconTrash2 className="w-3 h-3" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        {lowStock.length > 0 && (
          <div className="mt-4 dev-list-item" style={{ background: 'rgba(239,68,68,0.06)', borderColor: 'rgba(239,68,68,0.16)' }}>
            <div className="dev-list-item-main">
              <span className="dev-list-item-title" style={{ color: '#dc2626' }}><IconAlertCircle className="w-4 h-4" style={{ verticalAlign: -1 }} /> {lowStock.length} part(s) need reordering</span>
              <span className="dev-list-item-sub">{lowStock.map((p) => `${p.name} (${p.stockQty} left)`).join(', ')}</span>
            </div>
          </div>
        )}
      </section>
      {editing && (
        <section className="dev-panel padded">
          <h3 style={{ margin: '0 0 14px 0', fontSize: 17, fontWeight: 700, color: 'var(--text)' }}>
            {editing.id === 'new' ? 'Add spare part' : 'Edit spare part'}
          </h3>
          <form onSubmit={(e) => { e.preventDefault(); setEditing(null); }} className="space-y-3" style={{ maxWidth: 420 }}>
            <div className="dev-field">
              <label>SKU</label>
              <input className="dev-input" defaultValue={editing.sku} required />
            </div>
            <div className="dev-field">
              <label>Part name</label>
              <input className="dev-input" defaultValue={editing.name} required />
            </div>
            <div className="dev-field">
              <label>Category</label>
              <input className="dev-input" defaultValue={editing.category} />
            </div>
            <div className="dev-field" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              <div className="dev-field">
                <label>Stock qty</label>
                <input className="dev-input" type="number" defaultValue={editing.stockQty} />
              </div>
              <div className="dev-field">
                <label>Reorder level</label>
                <input className="dev-input" type="number" defaultValue={editing.reorderLevel} />
              </div>
              <div className="dev-field">
                <label>Unit price (PKR)</label>
                <input className="dev-input" type="number" defaultValue={editing.unitPrice} />
              </div>
            </div>
            <div className="dev-field">
              <label>Supplier</label>
              <input className="dev-input" defaultValue={editing.supplier} />
            </div>
            <div className="dev-field">
              <label>Location</label>
              <input className="dev-input" defaultValue={editing.location} />
            </div>
            <div className="flex justify-end gap-2 mt-2">
              <button type="button" className="dev-btn dev-btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
              <button type="submit" className="dev-btn dev-btn-primary">Save part</button>
            </div>
            <p className="text-xs text-slate-500 mt-2">Note: no backend spare-parts API exists yet, so changes live in this session only.</p>
          </form>
        </section>
      )}
    </div>
  );
}