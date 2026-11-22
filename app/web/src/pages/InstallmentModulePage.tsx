import type { InstallmentDashboardStats, InstallmentProduct } from '@pos/shared-types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { customerApi, installmentApi, installmentProductApi, installmentSaleApi } from '../api';
import { useTenant } from '../hooks/useTenant';
import PageHeading from '../components/PageHeading';
import InstallmentSaleLedger from '../components/InstallmentSaleLedger';
import { formatMoney } from '../utils/money';

interface Props {
  title: string;
  description: string;
  kind: 'dashboard' | 'products' | 'customers' | 'sales' | 'agreements' | 'payments' | 'schedules' | 'ledgers' | 'receipts' | 'overdue' | 'reports' | 'settings';
}

function StatCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="metric-card card">
      <div className="metric-card__eyebrow">{label}</div>
      <div className="metric-card__value">{value}</div>
      <div className="metric-card__meta">{hint}</div>
    </div>
  );
}

export default function InstallmentModulePage({ title, description, kind }: Props) {
  const { currency } = useTenant();
  const queryClient = useQueryClient();
  const money = (n: number) => formatMoney(n, currency);
  const [customerId, setCustomerId] = useState('');
  const [productId, setProductId] = useState('');
  const [advance, setAdvance] = useState('10000');
  const [advanceMode, setAdvanceMode] = useState<'cash' | 'card' | 'wallet'>('cash');
  const [duration, setDuration] = useState('12');
  const [frequency, setFrequency] = useState<'monthly' | 'weekly' | 'biweekly'>('monthly');
  const [message, setMessage] = useState('');

  const dashboard = useQuery({
    queryKey: ['installments', 'dashboard'],
    queryFn: installmentApi.dashboard,
    enabled: kind !== 'products' && kind !== 'customers',
  });

  const products = useQuery({
    queryKey: ['installments', 'products', 'module'],
    queryFn: () => installmentProductApi.list({ limit: 50 }),
    enabled: kind === 'products' || kind === 'sales',
  });

  const customers = useQuery({
    queryKey: ['installments', 'customers', 'module'],
    queryFn: () => customerApi.list({ limit: 100 }),
    enabled: kind === 'customers' || kind === 'sales',
  });

  const saleMutation = useMutation({
    mutationFn: (payload: { customerId: string; installmentProductId: string; advancePayment: number; advancePaymentMode: 'cash' | 'card' | 'wallet'; installmentDuration: number; paymentFrequency: 'monthly' | 'weekly' | 'biweekly' }) =>
      installmentSaleApi.create(payload),
    onSuccess: () => {
      setMessage('Installment sale created successfully.');
      setCustomerId('');
      setProductId('');
      setAdvance('10000');
      setAdvanceMode('cash');
      setDuration('12');
      setFrequency('monthly');
      queryClient.invalidateQueries({ queryKey: ['installments'] });
    },
    onError: () => setMessage('Unable to create this installment sale. Please verify the customer and product details.'),
  });

  const stats = useMemo<InstallmentDashboardStats>(() => dashboard.data ?? {
    totalProducts: 0,
    totalSales: 0,
    contractValue: 0,
    advancePayments: 0,
    installmentCollections: 0,
    outstandingReceivables: 0,
    overdueBalances: 0,
    upcomingInstallments: 0,
    completedAgreements: 0,
  }, [dashboard.data]);

  const productRows = products.data?.data ?? [];
  const customerRows = customers.data?.data ?? [];

  const selectedProduct = productRows.find((product) => product._id === productId);
  const cashPrice = selectedProduct?.actualPrice ?? 0;
  const downPayment = Math.max(0, Number(advance) || 0);
  const principal = Math.max(0, cashPrice - downPayment);
  // Interest starts only after a down payment is received; a zero down payment finances the cash price as-is.
  const interest = downPayment > 0
    ? Math.round(principal * (selectedProduct?.defaultCommissionRate ?? 0)) / 100
    : 0;
  const balanceInInstallments = Math.round((principal + interest) * 100) / 100;
  const installmentCount = Math.max(1, Math.floor(Number(duration) || 12));
  const perInstallment = Math.floor((balanceInInstallments * 100) / installmentCount) / 100;
  const finalInstallment = Math.round((balanceInInstallments - perInstallment * (installmentCount - 1)) * 100) / 100;
  const validTerms = advance.trim() !== '' && Number.isFinite(Number(advance)) && Number(advance) >= 0
    && !!selectedProduct && Number(advance) < selectedProduct.actualPrice
    && Number.isInteger(Number(duration)) && Number(duration) >= 1 && Number(duration) <= 60;

  const handleCreateSale = () => {
    if (!validTerms) { setMessage('Enter a down payment within the cash price and 1?60 installments.'); return; }
    if (!customerId || !productId) {
      setMessage('Please select a customer and installment product.');
      return;
    }
    saleMutation.mutate({
      customerId,
      installmentProductId: productId,
      advancePayment: Number(advance) || 0,
      advancePaymentMode: advanceMode,
      installmentDuration: Number(duration) || 12,
      paymentFrequency: frequency,
    });
  };

  const quickLinks = [
    { label: 'Dashboard', to: '/installments/dashboard' },
    { label: 'Products', to: '/installments/products' },
    { label: 'Customers', to: '/installments/customers' },
    { label: 'New Sale', to: '/installments/sales/new' },
    { label: 'Agreements', to: '/installments/agreements' },
    { label: 'Payments', to: '/installments/payments' },
    { label: 'Schedules', to: '/installments/schedules' },
    { label: 'Reports', to: '/installments/reports' },
    { label: 'Settings', to: '/installments/settings' },
  ];

  return (
    <div className="installment-shell space-y-5">
      <div className="hero-panel card">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <PageHeading eyebrow="Installment workspace" title={title} description={description} />
          <div className="flex flex-wrap gap-2">
            {quickLinks.map((link) => (
              <Link key={link.to} to={link.to} className="btn-secondary !px-3 !py-1.5 text-xs font-semibold">
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {kind === 'dashboard' && (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Products" value={String(stats.totalProducts)} hint="Independent installment catalog" />
          <StatCard label="Sales" value={String(stats.totalSales)} hint="Active and completed agreements" />
          <StatCard label="Contract value" value={money(stats.contractValue)} hint="Total recorded sale value" />
          <StatCard label="Collections" value={money(stats.installmentCollections)} hint="Cash, card and wallet receipts" />
          <StatCard label="Outstanding" value={money(stats.outstandingReceivables)} hint="Current receivables due" />
          <StatCard label="Overdue" value={money(stats.overdueBalances)} hint="Due past expected payment" />
          <StatCard label="Upcoming" value={String(stats.upcomingInstallments)} hint="Installments due soon" />
          <StatCard label="Completed" value={String(stats.completedAgreements)} hint="Agreements settled" />
        </div>
      )}

      {kind === 'products' && (
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-600 dark:text-slate-300">Catalog</h2>
            <Link to="/installments/sales/new" className="btn-primary !px-3 !py-1.5 text-xs font-semibold">Create sale</Link>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {productRows.map((product: InstallmentProduct) => (
              <div key={product._id} className="border-b border-slate-100 p-4 dark:border-slate-800">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-slate-900 dark:text-slate-100">{product.name}</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{product.brand ?? 'Brand not set'} · {product.model ?? 'Model not set'}</p>
                  </div>
                  <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-teal-700 dark:bg-teal-950/40 dark:text-teal-400">
                    {product.status}
                  </span>
                </div>
                <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">{product.description ?? 'No description provided.'}</p>
                <div className="mt-3 flex items-center justify-between text-sm">
                  <span className="font-bold text-teal-700 dark:text-teal-400">{money(product.actualPrice)}</span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">{product.defaultCommissionRate}% commission</span>
                </div>
              </div>
            ))}
            {productRows.length === 0 && (
              <div className="p-4 text-sm text-slate-500 dark:text-slate-400">No installment products found for this tenant.</div>
            )}
          </div>
        </div>
      )}

      {kind === 'customers' && (
        <div className="card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-600 dark:text-slate-300">Customer portfolio</h2>
            <Link to="/customers" className="btn-secondary !px-3 !py-1.5 text-xs font-semibold">Open customer registry</Link>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {customerRows.map((customer) => (
              <div key={customer._id} className="rounded-2xl border border-slate-200 p-3 dark:border-slate-800">
                <div className="font-semibold text-slate-900 dark:text-slate-100">{customer.name}</div>
                <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{customer.phone}</div>
                <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">{customer.address ?? 'No address recorded'}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {kind === 'sales' && (
        <div className="card p-5">
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-600 dark:text-slate-300">New installment sale</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="space-y-1 text-sm font-medium text-slate-700 dark:text-slate-200">
              Customer
              <select className="input w-full" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                <option value="">Select customer</option>
                {customerRows.map((customer) => <option key={customer._id} value={customer._id}>{customer.name}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-sm font-medium text-slate-700 dark:text-slate-200">
              Installment product
              <select className="input w-full" value={productId} onChange={(e) => setProductId(e.target.value)}>
                <option value="">Select product</option>
                {productRows.map((product) => <option key={product._id} value={product._id}>{product.name}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-sm font-medium text-slate-700 dark:text-slate-200">
              Down payment received
              <input className="input w-full" type="number" min="0" step="0.01" max={selectedProduct?.actualPrice} value={advance} onChange={(e) => setAdvance(e.target.value)} />
              <span className="block text-xs text-slate-500 dark:text-slate-400">Enter 0 when nothing is paid yet — no interest is charged on a zero down payment.</span>
            </label>
            <label className="space-y-1 text-sm font-medium text-slate-700 dark:text-slate-200">
              Down payment paid by
              <select className="input w-full" value={advanceMode} onChange={(e) => setAdvanceMode(e.target.value as 'cash' | 'card' | 'wallet')}>
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                <option value="wallet">Wallet</option>
              </select>
            </label>
            <label className="space-y-1 text-sm font-medium text-slate-700 dark:text-slate-200">
              Number of installments
              <input className="input w-full" type="number" min="1" max="60" step="1" value={duration} onChange={(e) => setDuration(e.target.value)} />
            </label>
            <label className="space-y-1 text-sm font-medium text-slate-700 dark:text-slate-200 md:col-span-2">
              Payment frequency
              <select className="input w-full" value={frequency} onChange={(e) => setFrequency(e.target.value as 'monthly' | 'weekly' | 'biweekly')}>
                <option value="monthly">Monthly</option>
                <option value="weekly">Weekly</option>
                <option value="biweekly">Biweekly</option>
              </select>
            </label>
          </div>
          {selectedProduct && validTerms && <section className="mt-5 rounded-xl border border-teal-200 bg-teal-50 p-4 dark:border-teal-800 dark:bg-teal-950/30" aria-live="polite">
            <h3 className="font-semibold">Payment breakdown</h3>
            <p className="mt-1 text-sm">
              {downPayment > 0
                ? 'The down payment is settled first. Interest is then calculated once on the remaining cash price, and that balance is distributed over the installments.'
                : 'No down payment was received, so no interest is applied. The full cash price is distributed over the installments.'}
            </p>
            <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[
                ['Cash price', money(cashPrice)],
                ['Down payment received', money(downPayment)],
                ['Principal after down payment', money(principal)],
                [downPayment > 0 ? `Interest (${selectedProduct.defaultCommissionRate}%)` : 'Interest (not applied)', money(interest)],
                ['Total sale price', money(cashPrice + interest)],
                ['Balance in installments', money(balanceInInstallments)],
              ].map(([label, value]) => <div key={label}><dt className="text-xs">{label}</dt><dd className="font-semibold">{value}</dd></div>)}
            </dl>
            <p className="mt-3 text-xs">
              {installmentCount} {frequency} payments of {money(perInstallment)}
              {finalInstallment !== perInstallment && ` (final payment ${money(finalInstallment)})`}.
              The final payment absorbs any rounding difference.
            </p>
          </section>}
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button className="btn-primary" disabled={saleMutation.isPending || !validTerms || !customerId} onClick={handleCreateSale}>
              {saleMutation.isPending ? 'Creating...' : 'Create installment sale'}
            </button>
            <Link to="/installments" className="btn-secondary">Back to list</Link>
          </div>
          {message && <p className="mt-4 text-sm text-teal-700 dark:text-teal-400">{message}</p>}
        </div>
      )}

      {(kind === 'agreements' || kind === 'payments' || kind === 'schedules' || kind === 'ledgers' || kind === 'receipts' || kind === 'overdue' || kind === 'reports' || kind === 'settings') && (
        <><InstallmentSaleLedger collect={kind === 'payments'} /><div className="card p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">{title}</h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Independent installment workflow and reporting are enabled for this tenant.</p>
            </div>
            <Link to="/installments" className="btn-primary !px-3 !py-1.5 text-xs font-semibold">Open agreements</Link>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {(kind === 'overdue' || kind === 'reports') && (
              <>
                <StatCard label="Outstanding" value={money(stats.outstandingReceivables)} hint="Open receivables" />
                <StatCard label="Overdue" value={money(stats.overdueBalances)} hint="Total past-due amounts" />
                <StatCard label="Payments" value={money(stats.installmentCollections)} hint="Collected this period" />
              </>
            )}
            {(kind === 'payments' || kind === 'receipts') && (
              <>
                <StatCard label="Advance" value={money(stats.advancePayments)} hint="Initial collections" />
                <StatCard label="Collections" value={money(stats.installmentCollections)} hint="Paid through installment ledger" />
                <StatCard label="Upcoming" value={String(stats.upcomingInstallments)} hint="Scheduled this month" />
              </>
            )}
            {(kind === 'schedules' || kind === 'ledgers') && (
              <>
                <StatCard label="Contract value" value={money(stats.contractValue)} hint="All sale value" />
                <StatCard label="Upcoming" value={String(stats.upcomingInstallments)} hint="Scheduled installments" />
                <StatCard label="Completed" value={String(stats.completedAgreements)} hint="Closed agreements" />
              </>
            )}
            {kind === 'settings' && (
              <>
                <StatCard label="Products" value={String(stats.totalProducts)} hint="Independent catalog" />
                <StatCard label="Sales" value={String(stats.totalSales)} hint="Current agreements" />
                <StatCard label="Status" value="Enabled" hint="Tenant-separated module" />
              </>
            )}
            {kind === 'agreements' && (
              <>
                <StatCard label="Sales" value={String(stats.totalSales)} hint="Agreements created" />
                <StatCard label="Completed" value={String(stats.completedAgreements)} hint="Settled agreements" />
                <StatCard label="Open" value={String(Math.max(stats.totalSales - stats.completedAgreements, 0))} hint="Payable agreements" />
              </>
            )}
          </div>
        </div></>
      )}
    </div>
  );
}
