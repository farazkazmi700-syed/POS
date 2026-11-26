import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Paginated, Product } from '@pos/shared-types';
import { api } from '../api/client';
import PageHeading from '../components/PageHeading';
import { useTenant } from '../hooks/useTenant';
import { useAuth } from '../store/auth';
import { fmtDate } from '../utils/dates';
import { errorMessage } from '../utils/errors';
import { formatMoney } from '../utils/money';

type ReplenishmentItem = Pick<Product, '_id' | 'name' | 'sku' | 'stockQty' | 'lowStockThreshold' | 'unit'>;
type ForecastAmount = { amount: number; count: number };
interface Forecast {
  asOf: string;
  overdue: ForecastAmount;
  periods: (ForecastAmount & { from: string; to: string })[];
}

export function StockReplenishment() {
  const user = useAuth((state) => state.user);
  const branchId = useAuth((state) => state.activeBranchId);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ q: '', page: 1 });
  const stock = useQuery({
    queryKey: ['stock-replenishment', user?.tenantId, user?._id, branchId, filters],
    queryFn: ({ signal }) => api.get<Paginated<ReplenishmentItem>>('/products/replenishment', {
      params: filters, signal,
    }).then(({ data }) => data),
  });
  const total = stock.data?.total ?? 0;

  return (
    <div className="space-y-5">
      <PageHeading title="Stock Replenishment" description="Active products at or below their stock threshold in the current branch." />
      <section className="card space-y-4" aria-label="Replenishment list">
        <form className="flex flex-wrap items-end gap-2" onSubmit={(event) => {
          event.preventDefault();
          setFilters({ q: search.trim(), page: 1 });
        }}>
          <div className="min-w-0 flex-1">
            <label className="label" htmlFor="replenishment-search">Search products</label>
            <input className="input" id="replenishment-search" type="search" value={search}
              onChange={(event) => setSearch(event.target.value)} placeholder="Name, SKU, or barcode" maxLength={120} />
          </div>
          <button className="btn-primary" type="submit">Search</button>
        </form>
        {stock.isPending && <p role="status">Loading stock levels…</p>}
        {stock.isError && <p role="alert">{errorMessage(stock.error)} <button className="btn-secondary" onClick={() => void stock.refetch()}>Retry</button></p>}
        {stock.isSuccess && (stock.data.data.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead><tr><th scope="col" className="th">Product</th><th scope="col" className="th">On hand</th><th scope="col" className="th">Threshold</th><th scope="col" className="th">Status</th></tr></thead>
              <tbody>
                {stock.data.data.map((product) => (
                  <tr key={product._id}>
                    <th scope="row" className="td"><bdi>{product.name}</bdi>{product.sku && <span className="block text-xs font-normal text-slate-500"><bdi>{product.sku}</bdi></span>}</th>
                    <td className="td whitespace-nowrap tabular-nums">{product.stockQty.toLocaleString('en-US')} {product.unit}</td>
                    <td className="td whitespace-nowrap tabular-nums">{product.lowStockThreshold.toLocaleString('en-US')} {product.unit}</td>
                    <td className="td">{product.stockQty === 0 ? 'Out of stock' : 'Low stock'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p>{filters.q ? 'No matching products need replenishment.' : 'No products on this page need replenishment.'}</p>)}
        {stock.isSuccess && (total > stock.data.limit || filters.page > 1) && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm" role="status">Page {filters.page} · {total} products</p>
            <div className="flex gap-2">
              <button className="btn-secondary" disabled={filters.page === 1} onClick={() => setFilters((previous) => ({ ...previous, page: previous.page - 1 }))}>Previous</button>
              <button className="btn-secondary" disabled={filters.page * stock.data.limit >= total} onClick={() => setFilters((previous) => ({ ...previous, page: previous.page + 1 }))}>Next</button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

export function CollectionsForecast() {
  const user = useAuth((state) => state.user);
  const branchId = useAuth((state) => state.activeBranchId);
  const { currency } = useTenant();
  const forecast = useQuery({
    queryKey: ['collections-forecast', user?.tenantId, user?._id, branchId],
    queryFn: ({ signal }) => api.get<Forecast>('/installments/collections-forecast', { signal }).then(({ data }) => data),
  });

  return (
    <div className="space-y-5">
      <PageHeading title="Installment Collections Forecast" description="Unpaid scheduled installments for the current branch. Amounts show what is due." />
      <section className="card space-y-4" aria-label="Scheduled collections">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">{forecast.data ? `As of ${fmtDate(forecast.data.asOf)}` : 'Scheduled collections'}</h2>
          <button className="btn-secondary" disabled={forecast.isFetching} onClick={() => void forecast.refetch()}>Refresh</button>
        </div>
        {forecast.isPending && <p role="status">Loading the forecast…</p>}
        {forecast.isError && <p role="alert">{errorMessage(forecast.error)}</p>}
        {forecast.isSuccess && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead><tr><th scope="col" className="th">Period</th><th scope="col" className="th text-right">Unpaid installments</th><th scope="col" className="th text-right">Amount due</th></tr></thead>
              <tbody className="tabular-nums">
                <tr>
                  <th scope="row" className="td">Overdue</th>
                  <td className="td text-right">{forecast.data.overdue.count}</td>
                  <td className="td whitespace-nowrap text-right font-semibold">{formatMoney(forecast.data.overdue.amount, currency, 2)}</td>
                </tr>
                {forecast.data.periods.map((period) => (
                  <tr key={period.from}>
                    <th scope="row" className="td">{fmtDate(period.from)} – {fmtDate(period.to)}</th>
                    <td className="td text-right">{period.count}</td>
                    <td className="td whitespace-nowrap text-right">{formatMoney(period.amount, currency, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
