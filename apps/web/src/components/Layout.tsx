import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { productApi } from '../api';
import { useTenant } from '../hooks/useTenant';
import ThemeToggle from './ThemeToggle';
import { useAuth } from '../store/auth';
import { TENANT_NAVIGATION_ITEMS } from '@pos/shared-types';

export default function Layout() {
  const { user, logout } = useAuth();
  const { tenant } = useTenant();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isManager = user?.role === 'owner' || user?.role === 'admin';
  const [showStockAlerts, setShowStockAlerts] = useState(false);
  const [dismissedStockAlertIds, setDismissedStockAlertIds] = useState<Set<string>>(() => new Set());
  const stockAlerts = useQuery({
    queryKey: ['products', 'stock-alerts'],
    queryFn: () => productApi.list({ lowStock: true, limit: 100 }),
    enabled: isManager,
    refetchInterval: 60_000,
  });
  const visibleStockAlerts = stockAlerts.data?.data.filter((product) => !dismissedStockAlertIds.has(product._id)) ?? [];

  useEffect(() => {
    const activeIds = new Set(stockAlerts.data?.data.map((product) => product._id) ?? []);
    setDismissedStockAlertIds((dismissedIds) => {
      const remainingIds = new Set([...dismissedIds].filter((id) => activeIds.has(id)));
      return remainingIds.size === dismissedIds.size ? dismissedIds : remainingIds;
    });
  }, [stockAlerts.data]);

  const links = TENANT_NAVIGATION_ITEMS.filter((item) =>
    (!item.managerOnly || isManager) && tenant?.navigationVisibility?.[item.key] !== false
      && (!('feature' in item) || tenant?.featureFlags?.[item.feature] !== false),
  );

  return (
    <div className="app-shell">
      <aside className="app-sidebar no-print">
        <div className="app-brand">
          {tenant?.logoUrl ? (
            <img src={tenant.logoUrl} alt={tenant.name || 'Business logo'} className="h-9 w-9 rounded-xl object-cover shadow-md shadow-indigo-500/20 ring-2 ring-white/60 dark:ring-slate-800/80" />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 text-sm font-bold text-white shadow-md shadow-indigo-500/20">
              {tenant?.name?.slice(0, 1)?.toUpperCase() ?? 'P'}
            </div>
          )}
          <span className="text-sm font-semibold sm:text-base">{tenant?.name ?? 'POS'}</span>
        </div>

        <nav className="app-nav" aria-label="Primary navigation">
          {links.map((l) => (
            <NavLink
              key={l.key}
              to={l.to}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              {l.label}
            </NavLink>
          ))}
          {user?.isSuperAdmin && (
            <NavLink
              to="/super-admin"
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              Super Admin
            </NavLink>
          )}
          {user?.isDeveloper && (
            <NavLink
              to="/developer"
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              Developer
            </NavLink>
          )}
        </nav>
      </aside>

      <div className="app-main">
        <header className="app-header no-print">
          <div className="app-header-inner">
            <div className="flex flex-1 items-center justify-end gap-2 sm:gap-3">
              {isManager && (
                <div className="relative">
                  <button
                    type="button"
                    aria-label={`Stock alerts${visibleStockAlerts.length ? `, ${visibleStockAlerts.length} items` : ''}`}
                    aria-expanded={showStockAlerts}
                    onClick={() => setShowStockAlerts((visible) => !visible)}
                    className="relative flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white/70 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
                    </svg>
                    {!!visibleStockAlerts.length && (
                      <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
                        {visibleStockAlerts.length > 99 ? '99+' : visibleStockAlerts.length}
                      </span>
                    )}
                  </button>
                  {showStockAlerts && (
                    <div className="absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
                      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
                        <h2 className="text-sm font-semibold">Stock alerts</h2>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {visibleStockAlerts.length} items
                        </span>
                      </div>
                      <div className="max-h-80 overflow-y-auto">
                        {stockAlerts.isLoading ? (
                          <p className="px-4 py-5 text-sm text-slate-500 dark:text-slate-400">Loading stock alerts...</p>
                        ) : stockAlerts.isError ? (
                          <p className="px-4 py-5 text-sm text-red-600">Could not load stock alerts.</p>
                        ) : visibleStockAlerts.length ? (
                          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                            {visibleStockAlerts.map((product) => (
                              <li key={product._id}>
                                <Link
                                  to="/products"
                                  onClick={() => setShowStockAlerts(false)}
                                  className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800"
                                >
                                  <span className="min-w-0">
                                    <span className="block truncate text-sm font-medium">{product.name}</span>
                                    <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{product.sku || 'No SKU'}</span>
                                  </span>
                                  <span className="shrink-0 text-right text-xs font-semibold text-red-600">
                                    {product.stockQty} {product.unit} left
                                  </span>
                                </Link>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="px-4 py-5 text-sm text-slate-500 dark:text-slate-400">No new stock alerts.</p>
                        )}
                      </div>
                      <div className="grid grid-cols-2 border-t border-slate-200 dark:border-slate-700">
                        <Link
                          to="/products"
                          onClick={() => setShowStockAlerts(false)}
                          className="px-3 py-3 text-center text-sm font-medium text-indigo-600 hover:bg-slate-50 dark:text-indigo-400 dark:hover:bg-slate-800"
                        >
                          View products
                        </Link>
                        <button
                          type="button"
                          disabled={!visibleStockAlerts.length}
                          onClick={() => setDismissedStockAlertIds((ids) => new Set([...ids, ...visibleStockAlerts.map((product) => product._id)]))}
                          className="border-l border-slate-200 px-3 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-default disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                        >
                          Clear notifications
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
              {isManager && tenant?.featureFlags?.reports !== false && (
                <NavLink
                  to="/reports"
                  aria-label="Reports"
                  className={({ isActive }) =>
                    `flex h-10 w-10 items-center justify-center rounded-lg border ${
                      isActive
                        ? 'border-indigo-500/60 bg-indigo-50 text-indigo-600 dark:border-indigo-500/50 dark:bg-indigo-500/10 dark:text-indigo-300'
                        : 'border-slate-200 bg-white/70 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:bg-slate-800'
                    }`
                  }
                >
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
                    />
                  </svg>
                </NavLink>
              )}
              <ThemeToggle />
              <div className="hidden items-center gap-2 rounded-full border border-slate-200 bg-white/70 px-2.5 py-1.5 text-xs text-slate-600 sm:flex dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-200">
                <span className="font-semibold text-slate-800 dark:text-slate-100">{user?.name}</span>
                <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600 dark:bg-slate-700 dark:text-slate-200">
                  {user?.role}
                </span>
              </div>
              <button
                className="btn-secondary"
                onClick={() => { logout(); queryClient.clear(); navigate('/login'); }}
              >
                Log out
              </button>
            </div>
          </div>
        </header>

        <main className="app-content mx-auto max-w-7xl px-3 py-4 sm:px-4 sm:py-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
