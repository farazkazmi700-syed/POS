import type { Order, PaymentMode, Product } from '@pos/shared-types';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { orderApi, productApi } from '../api';
import ReceiptStatus from '../components/ReceiptStatus';
import { useDebounce } from '../hooks/useDebounce';
import { useTenant } from '../hooks/useTenant';
import { useAuth } from '../store/auth';
import { useCart } from '../store/cart';
import { errorMessage } from '../utils/errors';
import { formatMoney } from '../utils/money';

const PAYMENTS: PaymentMode[] = ['cash', 'card', 'wallet'];

export default function POS() {
  const queryClient = useQueryClient();
  const { currency } = useTenant();
  const role = useAuth((s) => s.user?.role);
  const cart = useCart();
  const [search, setSearch] = useState('');
  const q = useDebounce(search);
  const [payment, setPayment] = useState<PaymentMode>('cash');
  const [customerName, setCustomerName] = useState('');
  const [done, setDone] = useState<Order | null>(null);
  const money = (n: number) => formatMoney(n, currency);

  const products = useQuery({
    queryKey: ['products', 'pos', q],
    queryFn: () => productApi.list({ q: q || undefined, limit: 60 }),
  });

  const items = cart.items.map((i) => ({ productId: i.product._id, qty: i.qty, discountPercent: i.discountPercent }));

  // Totals come from the server so the screen always matches the printed receipt.
  const preview = useQuery({
    queryKey: ['preview', items],
    queryFn: () => orderApi.preview(items),
    enabled: items.length > 0,
    placeholderData: keepPreviousData,
  });

  const checkout = useMutation({
    mutationFn: () => orderApi.create({
      items, paymentMode: payment, customer: customerName.trim() ? { name: customerName.trim() } : undefined,
    }),
    onSuccess: (order) => {
      setDone(order);
      cart.clear();
      setCustomerName('');
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });

  const outOfStock = (p: Product) => p.trackStock && p.stockQty <= 0;
  const totals = items.length ? preview.data : undefined;

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_24rem]">
      {/* ---------- product grid ---------- */}
      <section>
        <input
          className="input mb-3" placeholder="Search by name or SKU…" value={search} autoFocus
          onChange={(e) => setSearch(e.target.value)}
        />
        {products.isLoading && <p className="text-sm text-slate-500">Loading products…</p>}
        {products.data?.data.length === 0 && (
          <p className="card text-sm text-slate-500">
            No products found.{role !== 'cashier' && ' Add some on the Products page.'}
          </p>
        )}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {products.data?.data.map((p) => (
            <button
              key={p._id}
              disabled={outOfStock(p)}
              onClick={() => { setDone(null); cart.add(p); }}
              className="card text-left transition hover:border-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <div className="line-clamp-2 text-sm font-medium">{p.name}</div>
              <div className="mt-1 text-sm text-indigo-700">{money(p.price)}</div>
              <div className="mt-1 text-xs text-slate-500">
                {p.trackStock ? (outOfStock(p) ? 'Out of stock' : `${p.stockQty} ${p.unit} left`) : p.unit}
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* ---------- cart ---------- */}
      <aside className="card h-fit space-y-3 lg:sticky lg:top-4">
        <h2 className="text-base font-semibold">Current sale</h2>

        {done && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm">
            <p className="font-medium text-emerald-800">Sale complete · {done.invoiceNo}</p>
            <p className="mb-2 text-emerald-700">Total {money(done.grandTotal)}</p>
            <ReceiptStatus orderId={done._id} invoiceNo={done.invoiceNo} canRetry={role !== 'cashier'} />
          </div>
        )}

        {cart.items.length === 0 && !done && <p className="text-sm text-slate-500">Tap a product to add it.</p>}

        <ul className="divide-y divide-slate-100">
          {cart.items.map((i) => (
            <li key={i.product._id} className="space-y-1.5 py-2">
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-medium">{i.product.name}</span>
                <button className="text-xs text-slate-400 hover:text-red-600" onClick={() => cart.remove(i.product._id)}>Remove</button>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <button className="btn-secondary !px-2.5 !py-1" onClick={() => cart.setQty(i.product._id, i.qty - 1)}>−</button>
                <input
                  className="input !w-16 !py-1 text-center" type="number" min={0} step="any" value={i.qty}
                  onChange={(e) => cart.setQty(i.product._id, Number(e.target.value))}
                />
                <button className="btn-secondary !px-2.5 !py-1" onClick={() => cart.setQty(i.product._id, i.qty + 1)}>+</button>
                <span className="ml-auto text-slate-500">× {money(i.product.price)}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <label htmlFor={`d-${i.product._id}`}>Discount %</label>
                <input
                  id={`d-${i.product._id}`} className="input !w-16 !py-1 text-center" type="number" min={0} max={100}
                  value={i.discountPercent} onChange={(e) => cart.setDiscount(i.product._id, Number(e.target.value))}
                />
              </div>
            </li>
          ))}
        </ul>

        {totals && (
          <dl className="space-y-1 border-t border-slate-200 pt-3 text-sm">
            <Row label="Subtotal" value={money(totals.subtotal)} />
            {totals.discountTotal > 0 && <Row label="Discount" value={`− ${money(totals.discountTotal)}`} />}
            {totals.taxBreakdown.filter((t) => t.taxAmount > 0).map((t) => (
              <Row key={t.ratePercent} label={`Tax ${t.ratePercent}%`} value={money(t.taxAmount)} />
            ))}
            {totals.charges.map((c) => <Row key={c.label} label={c.label} value={money(c.amount)} />)}
            <div className="flex justify-between border-t border-slate-200 pt-2 text-lg font-semibold">
              <dt>Total</dt><dd>{money(totals.grandTotal)}</dd>
            </div>
          </dl>
        )}

        {cart.items.length > 0 && (
          <>
            <input className="input" placeholder="Customer name (optional)" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
            <div className="grid grid-cols-3 gap-2">
              {PAYMENTS.map((m) => (
                <button
                  key={m} onClick={() => setPayment(m)}
                  className={`rounded-lg border px-2 py-2 text-sm font-medium capitalize ${payment === m ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-slate-300 hover:bg-slate-50'}`}
                >
                  {m}
                </button>
              ))}
            </div>
            {checkout.isError && <p className="text-sm text-red-600">{errorMessage(checkout.error)}</p>}
            {preview.isError && <p className="text-sm text-red-600">{errorMessage(preview.error)}</p>}
            <button
              className="btn-primary w-full !py-3 !text-base"
              disabled={checkout.isPending || preview.isFetching || !totals}
              onClick={() => checkout.mutate()}
            >
              {checkout.isPending ? 'Processing…' : totals ? `Charge ${money(totals.grandTotal)}` : 'Calculating…'}
            </button>
            <button className="btn-secondary w-full" onClick={() => cart.clear()}>Clear cart</button>
          </>
        )}
        {done && cart.items.length === 0 && <button className="btn-secondary w-full" onClick={() => setDone(null)}>New sale</button>}
      </aside>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-slate-600">
      <dt>{label}</dt><dd>{value}</dd>
    </div>
  );
}
