import type { Order, PaymentMode, Product } from '@pos/shared-types';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { barcodeApi, installmentApi, orderApi, productApi } from '../api';
import InstallmentPanel, { emptyInstallmentForm, type InstallmentForm } from '../components/InstallmentPanel';
import ReceiptStatus from '../components/ReceiptStatus';
import PageHeading from '../components/PageHeading';
import { useDebounce } from '../hooks/useDebounce';
import { useTenant } from '../hooks/useTenant';
import { useAuth } from '../store/auth';
import { useCart } from '../store/cart';
import { errorMessage } from '../utils/errors';
import { formatMoney } from '../utils/money';

const PAYMENTS: PaymentMode[] = ['cash', 'card', 'wallet', 'mixed'];
type Done = Order & { installmentPlanId?: string };

export default function POS() {
  const queryClient = useQueryClient();
  const { tenant, currency } = useTenant();
  const role = useAuth((s) => s.user?.role);
  const cart = useCart();
  const [search, setSearch] = useState('');
  const [scanCode, setScanCode] = useState('');
  const [scanNotice, setScanNotice] = useState('');
  const scanInput = useRef<HTMLInputElement>(null);
  const branch = useAuth((s) => s.activeBranchId);
  const scanBranch = useRef(branch);
  scanBranch.current = branch;
  const billingScan = useMutation({
    mutationFn: async (value: string) => {
      const requestedBranch = branch;
      const requestedUser = useAuth.getState().user?._id;
      const product = await barcodeApi.lookup(value.trim());
      if (scanBranch.current !== requestedBranch || useAuth.getState().user?._id !== requestedUser) throw new Error('Workspace changed. Scan the product again.');
      const current = useCart.getState();
      const quantity = current.items.find((item) => item.product._id === product._id)?.qty ?? 0;
      if (product.trackStock && product.stockQty < quantity + 1) throw new Error('Not enough stock to add another unit.');
      current.add(product);
      return product;
    },
    onSuccess: (product) => { setScanNotice(`${product.name} added to billing.`); setScanCode(''); setSearch(''); scanInput.current?.focus(); },
    onError: () => { setScanNotice(''); scanInput.current?.focus(); scanInput.current?.select(); },
  });
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [mobileTab, setMobileTab] = useState<'products' | 'cart'>('products');
  const q = useDebounce(search);
  const [payment, setPayment] = useState<PaymentMode>('cash');
  const [inst, setInst] = useState<InstallmentForm>(emptyInstallmentForm);
  const [customerName, setCustomerName] = useState('');
  const [cashPart, setCashPart] = useState('');
  const checkoutRequest = useRef<{ payload: string; key: string } | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const money = (n: number) => formatMoney(n, currency);
  const installmentEnabled = tenant?.navigationVisibility?.installments !== false
    && tenant?.navigationVisibility?.customers !== false;
  const paymentModes = installmentEnabled ? [...PAYMENTS, 'installment' as const] : PAYMENTS;
  const effectivePayment: PaymentMode = payment === 'installment' && !installmentEnabled ? 'cash' : payment;
  const isInstallment = effectivePayment === 'installment';

  useEffect(() => {
    if (!installmentEnabled && payment === 'installment') setPayment('cash');
  }, [installmentEnabled, payment]);

  const products = useQuery({
    queryKey: ['products', 'pos', q],
    queryFn: () => productApi.list({ q: q || undefined, limit: 80 }),
  });

  const categories = useMemo(() => {
    const list = products.data?.data ?? [];
    const set = new Set<string>();
    for (const p of list) {
      if (p.category?.trim()) set.add(p.category.trim());
    }
    return Array.from(set);
  }, [products.data]);

  const filteredProducts = useMemo(() => {
    const list = products.data?.data ?? [];
    if (selectedCategory === 'all') return list;
    return list.filter((p) => p.category?.trim() === selectedCategory);
  }, [products.data, selectedCategory]);

  // The preview ignores serial numbers so typing an IMEI does not trigger a recalculation.
  const previewItems = cart.items.map((i) => ({ productId: i.product._id, qty: i.qty, discountPercent: i.discountPercent }));
  const orderItems = cart.items.map((i) => ({ ...{ productId: i.product._id, qty: i.qty, discountPercent: i.discountPercent }, serialNo: i.serialNo.trim() || undefined }));

  // Totals come from the server so the screen always matches the printed receipt.
  const preview = useQuery({
    queryKey: ['preview', previewItems],
    queryFn: () => orderApi.preview(previewItems),
    enabled: previewItems.length > 0,
    placeholderData: keepPreviousData,
  });
  const totals = previewItems.length ? preview.data : undefined;

  const defaultMarkup = tenant?.installmentMarkupPercent ?? 0;
  const markup = inst.markupPercent === '' ? defaultMarkup : Number(inst.markupPercent);
  const quoteInput = {
    cashTotal: totals?.grandTotal ?? 0,
    downPayment: Number(inst.downPayment || 0),
    months: Number(inst.months),
    markupPercent: markup,
    firstDueDate: inst.firstDueDate || undefined,
  };
  const quote = useQuery({
    queryKey: ['quote', quoteInput],
    queryFn: () => installmentApi.quote(quoteInput),
    enabled: isInstallment && !!totals && totals.grandTotal > 0 && Number.isInteger(quoteInput.months),
    placeholderData: keepPreviousData,
    retry: false,
  });

  const checkout = useMutation({
    mutationFn: () => {
      const payload = JSON.stringify({ items: orderItems, effectivePayment, customerName, inst, cashPart });
      if (checkoutRequest.current?.payload !== payload) checkoutRequest.current = { payload, key: crypto.randomUUID() };
      return orderApi.create({
      items: orderItems,
      idempotencyKey: checkoutRequest.current.key,
      payments: effectivePayment === 'mixed' ? [{ mode: 'cash', amount: Number(cashPart) }, { mode: 'card', amount: Math.round(((totals?.grandTotal ?? 0) - Number(cashPart)) * 100) / 100 }] : undefined,
      paymentMode: effectivePayment,
      customer: !isInstallment && customerName.trim() ? { name: customerName.trim() } : undefined,
      installment: isInstallment && inst.customer ? {
        customerId: inst.customer._id,
        downPayment: quoteInput.downPayment,
        downPaymentMode: inst.downPaymentMode,
        months: quoteInput.months,
        markupPercent: markup,
        firstDueDate: inst.firstDueDate || undefined,
      } : undefined,
    }); },
    onSuccess: (order) => {
      setDone(order as Done);
      cart.clear();
      checkoutRequest.current = null;
      setCashPart('');
      setCustomerName('');
      setInst(emptyInstallmentForm);
      setPayment('cash');
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['installments'] });
      // Switch back to cart tab to see success receipt on mobile
      setMobileTab('cart');
    },
  });

  const outOfStock = (p: Product) => p.trackStock && p.stockQty <= 0;
  const quoteReady = (!isInstallment || (!!inst.customer && !!quote.data && !quote.isError)) && (effectivePayment !== 'mixed' || (Number(cashPart) > 0 && Number(cashPart) < (totals?.grandTotal ?? 0)));
  const chargeLabel = !totals ? 'Calculating…'
    : isInstallment ? (quote.data && !quote.isError ? `Start installment · ${money(quote.data.downPayment)} now` : 'Complete installment terms')
    : `Charge ${money(totals.grandTotal)}`;

  // Find quantity already in cart
  const getCartQty = (productId: string) => {
    return cart.items.find((i) => i.product._id === productId)?.qty ?? 0;
  };

  return (
    <div className="space-y-4">
      <header className="page-header"><PageHeading eyebrow="Sales terminal" title="Point of sale" description="Find products, build an order, and complete checkout." /><span className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-500 dark:border-slate-700">{cart.items.reduce((sum, item) => sum + item.qty, 0)} items in current sale</span></header>
      <div className="flex flex-wrap items-center gap-2"><button type="button" className="btn-secondary" disabled={!cart.items.length || checkout.isPending} onClick={() => { cart.hold(); setInst(emptyInstallmentForm); setCustomerName(''); setPayment('cash'); }}>Hold current sale</button>{cart.held.map((sale) => <button type="button" className="btn-secondary" key={sale.id} disabled={!!cart.items.length || checkout.isPending} onClick={() => cart.resume(sale.id)}>Resume {sale.label} · {sale.items.length} items</button>)}</div>
      {effectivePayment === 'mixed' && <div className="card grid gap-3 sm:grid-cols-2"><label className="label">Cash amount<input className="input mt-1" type="number" min="0.01" max={Math.max(0, (totals?.grandTotal ?? 0) - 0.01)} step="0.01" value={cashPart} onChange={(event) => setCashPart(event.target.value)} /></label><p className="text-sm">Card remainder: {money(Math.max(0, (totals?.grandTotal ?? 0) - Number(cashPart || 0)))}</p></div>}
      {/* ─────────────── Mobile View Segmented Switch ─────────────── */}
      <div className="flex items-center rounded-xl bg-slate-200/70 p-1 dark:bg-slate-800/80 lg:hidden shadow-inner">
        <button
          type="button"
          onClick={() => setMobileTab('products')}
          className={`flex-1 rounded-lg py-2.5 text-xs font-bold transition flex items-center justify-center gap-1.5 ${
            mobileTab === 'products'
              ? 'bg-white text-teal-700 shadow-sm dark:bg-[#002228] dark:text-teal-400'
              : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          <span>Products</span>
          <span className="rounded-full bg-slate-200/80 dark:bg-slate-700/80 px-2 py-0.5 text-[10px]">
            {filteredProducts.length}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setMobileTab('cart')}
          className={`flex-1 rounded-lg py-2.5 text-xs font-bold transition flex items-center justify-center gap-1.5 ${
            mobileTab === 'cart'
              ? 'bg-white text-teal-700 shadow-sm dark:bg-[#002228] dark:text-teal-400'
              : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          <span>Sale & Checkout</span>
          {cart.items.length > 0 && (
            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-teal-600 px-1 text-[10px] font-bold text-white">
              {cart.items.length}
            </span>
          )}
          {totals && totals.grandTotal > 0 && (
            <span className="font-bold text-teal-700 dark:text-teal-400 ml-1">
              · {money(totals.grandTotal)}
            </span>
          )}
        </button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_24rem] items-start">
        {/* ─────────────── Product Catalog Section ─────────────── */}
        <section className={`space-y-3 ${mobileTab === 'products' ? 'block' : 'hidden lg:block'}`}>
          {/* Search Bar + Clear button */}
          <div className="relative">
            <input
              className="input pr-10"
              placeholder="Search products or scan a barcode and press Enter"
              value={search}
              autoFocus
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter' && tenant?.featureFlags?.barcodes !== false && search.trim()) { event.preventDefault(); if (!billingScan.isPending) billingScan.mutate(search); } }}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                aria-label="Clear search"
              >
                ✕
              </button>
            )}
          </div>

          {tenant?.featureFlags?.barcodes !== false && <form className="card space-y-2" onSubmit={(event) => { event.preventDefault(); if (!billingScan.isPending && scanCode.trim()) { setScanNotice(''); billingScan.mutate(scanCode); } }}>
            <label className="label" htmlFor="billing-barcode">Scan barcode for billing</label>
            <div className="flex flex-wrap gap-2"><input ref={scanInput} id="billing-barcode" className="input min-w-0 flex-1" placeholder="Scan barcode or SKU, then press Enter" value={scanCode} maxLength={80} required autoComplete="off" onChange={(event) => setScanCode(event.target.value)} /><button className="btn-primary" disabled={billingScan.isPending} type="submit">{billingScan.isPending ? 'Adding…' : 'Add to bill'}</button></div>
            {billingScan.error && <p role="alert" className="text-sm text-red-600">{errorMessage(billingScan.error)}</p>}
            {scanNotice && <p role="status" className="text-sm">{scanNotice}</p>}
          </form>}
          {/* Category Filter Chips */}
          {categories.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 no-scrollbar">
              <button
                type="button"
                onClick={() => setSelectedCategory('all')}
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition ${
                  selectedCategory === 'all'
                    ? 'bg-teal-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                }`}
              >
                All items
              </button>
              {categories.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setSelectedCategory(c)}
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition ${
                    selectedCategory === c
                      ? 'bg-teal-600 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          )}

          {products.isLoading && (
            <div className="card text-center py-8 text-sm text-slate-500">
              <p>Loading catalog items…</p>
            </div>
          )}

          {products.isError && (
            <div className="card text-center py-6 text-sm text-red-600">
              <p>Unable to load products. Check your connection.</p>
            </div>
          )}

          {products.data?.data.length === 0 && (
            <div className="card text-center py-8 text-sm text-slate-500">
              <p>No products found matching &ldquo;{search}&rdquo;.</p>
              {role !== 'cashier' && (
                <Link to="/products" className="mt-2 inline-block font-semibold text-teal-600 dark:text-teal-400 hover:underline">
                  + Add products to catalog
                </Link>
              )}
            </div>
          )}

          {/* Product Grid */}
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4 sm:gap-3">
            {filteredProducts.map((p) => {
              const inStock = !outOfStock(p);
              const inCart = getCartQty(p._id);
              const isLow = p.trackStock && p.stockQty > 0 && p.stockQty <= p.lowStockThreshold;

              return (
                <button
                  key={p._id}
                  disabled={!inStock}
                  onClick={() => {
                    setDone(null);
                    cart.add(p);
                  }}
                  className={`card relative text-left transition-all p-3 sm:p-3.5 flex flex-col justify-between group active:scale-[0.98] ${
                    inCart > 0
                      ? 'border-teal-500/70 shadow-md ring-1 ring-teal-500/30'
                      : 'hover:border-teal-400 hover:shadow-md'
                  } disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  {/* Cart count badge */}
                  {inCart > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-teal-600 px-1.5 text-[10px] font-bold text-white shadow-md ring-2 ring-white dark:ring-slate-900">
                      ×{inCart}
                    </span>
                  )}

                  <div>
                    <div className="line-clamp-2 text-xs sm:text-sm font-semibold text-slate-900 dark:text-slate-100 group-hover:text-teal-700 dark:group-hover:text-teal-300">
                      {p.name}
                    </div>
                    {p.sku && (
                      <p className="mt-0.5 truncate text-[11px] text-slate-400 dark:text-slate-500">
                        {p.sku}
                      </p>
                    )}
                  </div>

                  <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-teal-950 flex items-end justify-between gap-1">
                    <div>
                      <div className="text-sm font-bold text-teal-700 dark:text-teal-400">
                        {money(p.price)}
                      </div>
                      <div className="text-[10px] font-medium text-slate-500 dark:text-slate-400">
                        {p.trackStock ? (
                          !inStock ? (
                            <span className="text-red-600 font-semibold">Out of stock</span>
                          ) : isLow ? (
                            <span className="text-amber-600 font-semibold">{p.stockQty} {p.unit} left</span>
                          ) : (
                            <span>{p.stockQty} {p.unit}</span>
                          )
                        ) : (
                          <span>{p.unit}</span>
                        )}
                      </div>
                    </div>

                    <span className="rounded-md bg-teal-50 p-1 text-teal-600 group-hover:bg-teal-600 group-hover:text-white dark:bg-teal-500/10 dark:text-teal-400 dark:group-hover:bg-teal-600 dark:group-hover:text-white transition">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                      </svg>
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* ─────────────── Mobile Sticky Cart Peek Bar ─────────────── */}
        {mobileTab === 'products' && cart.items.length > 0 && (
          <div className="fixed bottom-14 left-0 right-0 z-20 border-t border-slate-200 bg-white/95 p-3 shadow-xl backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/95 lg:hidden animate-in slide-in-from-bottom duration-200">
            <div className="mx-auto flex max-w-md items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {cart.items.length} {cart.items.length === 1 ? 'item' : 'items'} in sale
                </p>
                <p className="text-base font-bold text-teal-700 dark:text-teal-400">
                  {money(totals?.grandTotal ?? 0)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMobileTab('cart')}
                className="btn-primary !py-2.5 !px-5 text-xs font-bold flex items-center gap-1.5"
              >
                <span>Checkout</span>
                <span>→</span>
              </button>
            </div>
          </div>
        )}

        {/* ─────────────── Cart / Checkout Panel ─────────────── */}
        <aside className={`card space-y-4 lg:sticky lg:top-4 ${mobileTab === 'cart' ? 'block' : 'hidden lg:block'}`}>
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-teal-950 pb-2.5">
            <h2 className="text-base font-bold tracking-tight">Current Sale</h2>
            {cart.items.length > 0 && (
              <button
                type="button"
                className="text-xs font-medium text-red-600 hover:text-red-700 hover:underline"
                onClick={() => cart.clear()}
              >
                Clear all
              </button>
            )}
          </div>

          {done && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-3.5 text-sm dark:border-emerald-500/30 dark:bg-emerald-500/10">
              <div className="flex items-center justify-between gap-2">
                <p className="font-bold text-emerald-800 dark:text-emerald-300">
                  Sale Complete · {done.invoiceNo}
                </p>
                <span className="rounded-full bg-emerald-200 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200">
                  Paid
                </span>
              </div>
              <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-400">
                Amount received: <strong className="text-sm font-semibold">{money(done.grandTotal)}</strong>
              </p>
              {done.installmentPlanId && (
                <Link
                  className="mt-2 inline-block text-xs font-semibold text-teal-700 underline dark:text-teal-400"
                  to={`/installments/${done.installmentPlanId}`}
                >
                  Open installment agreement & receipts →
                </Link>
              )}
              <div className="mt-3 pt-2.5 border-t border-emerald-200/60 dark:border-emerald-500/20">
                <ReceiptStatus orderId={done._id} invoiceNo={done.invoiceNo} canRetry={role !== 'cashier'} />
              </div>
            </div>
          )}

          {cart.items.length === 0 && !done && (
            <div className="py-8 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
                </svg>
              </div>
              <p className="mt-2 text-sm font-medium text-slate-500 dark:text-slate-400">Cart is empty</p>
              <p className="text-xs text-slate-400 dark:text-slate-500">Tap items from the catalog to add.</p>
              <button
                type="button"
                onClick={() => setMobileTab('products')}
                className="btn-secondary mt-3 !py-1.5 !px-3 text-xs lg:hidden"
              >
                Browse products
              </button>
            </div>
          )}

          {/* Cart Item List */}
          <ul className="divide-y divide-slate-100 dark:divide-teal-950 max-h-72 overflow-y-auto pr-1">
            {cart.items.map((i) => (
              <li key={i.product._id} className="space-y-2 py-3 first:pt-0 last:pb-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {i.product.name}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {money(i.product.price)} each
                    </span>
                  </div>
                  <button
                    type="button"
                    className="text-xs font-medium text-slate-400 hover:text-red-600 transition"
                    onClick={() => cart.remove(i.product._id)}
                    aria-label={`Remove ${i.product.name}`}
                  >
                    Remove
                  </button>
                </div>

                {/* Touch friendly stepper */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 font-bold hover:bg-slate-200 active:scale-95 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200"
                      onClick={() => cart.setQty(i.product._id, i.qty - 1)}
                    >
                      −
                    </button>
                    <input
                      className="input !w-14 !py-1 text-center font-bold text-xs"
                      type="number"
                      min={0}
                      step="any"
                      value={i.qty}
                      onChange={(e) => cart.setQty(i.product._id, Number(e.target.value))}
                    />
                    <button
                      type="button"
                      className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 font-bold hover:bg-slate-200 active:scale-95 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200"
                      onClick={() => cart.setQty(i.product._id, i.qty + 1)}
                    >
                      +
                    </button>
                  </div>
                  <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    {money(i.qty * i.product.price * (1 - i.discountPercent / 100))}
                  </span>
                </div>

                {/* Secondary attributes: discount & serial */}
                <div className="grid grid-cols-2 gap-2 pt-1 text-xs text-slate-500">
                  <div className="flex items-center gap-1">
                    <label htmlFor={`d-${i.product._id}`} className="shrink-0 text-[11px]">Disc %</label>
                    <input
                      id={`d-${i.product._id}`}
                      className="input !py-0.5 text-center text-xs"
                      type="number"
                      min={0}
                      max={100}
                      value={i.discountPercent}
                      onChange={(e) => cart.setDiscount(i.product._id, Number(e.target.value))}
                    />
                  </div>
                  <input
                    className="input !py-0.5 text-xs truncate"
                    placeholder="IMEI / serial no."
                    aria-label={`Serial number for ${i.product.name}`}
                    value={i.serialNo}
                    onChange={(e) => cart.setSerial(i.product._id, e.target.value)}
                  />
                </div>
              </li>
            ))}
          </ul>

          {/* Pricing breakdown */}
          {totals && (
            <dl className="space-y-1.5 border-t border-slate-200 dark:border-teal-950 pt-3 text-xs">
              <Row label="Subtotal" value={money(totals.subtotal)} />
              {totals.discountTotal > 0 && <Row label="Discount" value={`− ${money(totals.discountTotal)}`} />}
              {totals.taxBreakdown.filter((t) => t.taxAmount > 0).map((t) => (
                <Row key={t.ratePercent} label={`Tax ${t.ratePercent}%`} value={money(t.taxAmount)} />
              ))}
              {totals.charges.map((c) => <Row key={c.label} label={c.label} value={money(c.amount)} />)}
              <div className="flex justify-between border-t border-slate-200 dark:border-teal-950 pt-2 text-base font-bold text-slate-900 dark:text-slate-100">
                <dt>{isInstallment ? 'Cash price' : 'Total'}</dt>
                <dd className="text-teal-700 dark:text-teal-400 text-lg">{money(totals.grandTotal)}</dd>
              </div>
            </dl>
          )}

          {/* Payment & Checkout form */}
          {cart.items.length > 0 && (
            <div className="space-y-3 pt-2">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Payment mode
              </div>
              <div className="grid grid-cols-2 gap-2">
                {paymentModes.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setPayment(m)}
                    className={`rounded-xl border p-2 text-xs font-semibold capitalize transition ${
                      payment === m
                        ? 'border-teal-600 bg-teal-50 text-teal-800 shadow-sm dark:border-teal-400 dark:bg-teal-500/20 dark:text-teal-300'
                        : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>

              {isInstallment ? (
                <InstallmentPanel
                  value={inst}
                  onChange={setInst}
                  defaultMarkup={defaultMarkup}
                  currency={currency}
                  quote={quote.data}
                  quoteError={quote.isError ? errorMessage(quote.error) : null}
                  loading={quote.isFetching}
                />
              ) : (
                <div>
                  <label className="label">Customer (Optional)</label>
                  <input
                    className="input"
                    placeholder="Customer name for invoice"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                  />
                </div>
              )}

              {checkout.isError && (
                <p className="rounded-lg bg-red-50 p-2 text-xs font-medium text-red-600 dark:bg-red-950/40 dark:text-red-400">
                  {errorMessage(checkout.error)}
                </p>
              )}
              {preview.isError && (
                <p className="rounded-lg bg-red-50 p-2 text-xs font-medium text-red-600 dark:bg-red-950/40 dark:text-red-400">
                  {errorMessage(preview.error)}
                </p>
              )}

              <button
                className="btn-primary w-full !py-3.5 !text-sm font-bold shadow-lg"
                disabled={checkout.isPending || preview.isFetching || !totals || !quoteReady}
                onClick={() => checkout.mutate()}
              >
                {checkout.isPending ? 'Processing Sale…' : chargeLabel}
              </button>

              <button
                type="button"
                className="btn-secondary w-full text-xs"
                onClick={() => cart.clear()}
              >
                Cancel and clear sale
              </button>
            </div>
          )}

          {done && cart.items.length === 0 && (
            <button
              type="button"
              className="btn-primary w-full !py-3 text-sm font-semibold"
              onClick={() => {
                setDone(null);
                setMobileTab('products');
              }}
            >
              Start New Sale
            </button>
          )}
        </aside>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-slate-600 dark:text-slate-400">
      <dt>{label}</dt>
      <dd className="font-medium text-slate-800 dark:text-slate-200">{value}</dd>
    </div>
  );
}
