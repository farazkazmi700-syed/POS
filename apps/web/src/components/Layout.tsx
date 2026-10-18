import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { productApi } from '../api';
import { useTenant } from '../hooks/useTenant';
import ThemeToggle from './ThemeToggle';
import { useAuth } from '../store/auth';
import { useCart } from '../store/cart';
import { TENANT_NAVIGATION_ITEMS } from '@pos/shared-types';
import {
  IconDashboard,
  IconPOS,
  IconProducts,
  IconCustomers,
  IconInstallments,
  IconOrders,
  IconReports,
  IconSettings,
  IconBarcode,
  IconSuperAdmin,
  IconDeveloper,
  IconMenu,
  IconClose,
} from './Icons';

export default function Layout() {
  const { user, logout } = useAuth();
  const { tenant } = useTenant();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const cart = useCart();
  const isManager = user?.role === 'owner' || user?.role === 'admin';
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showStockAlerts, setShowStockAlerts] = useState(false);
  const [dismissedStockAlertIds, setDismissedStockAlertIds] = useState<Set<string>>(() => new Set());

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  // Handle ESC key to close drawer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileOpen(false);
        setShowStockAlerts(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Lock body scroll when mobile drawer is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

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
      && (!('feature' in item) || tenant?.featureFlags?.[item.feature] !== false)
      // Module rights: owner sees everything; admin/staff are limited to their granted modules.
      && (user?.role === 'owner' || !user?.moduleRights || user.moduleRights.includes(item.key)),
  );

  const getNavIcon = (key: string) => {
    switch (key) {
      case 'dashboard':
        return <IconDashboard className="h-5 w-5 shrink-0" />;
      case 'pos':
        return <IconPOS className="h-5 w-5 shrink-0" />;
      case 'products':
        return <IconProducts className="h-5 w-5 shrink-0" />;
      case 'customers':
        return <IconCustomers className="h-5 w-5 shrink-0" />;
      case 'installments':
        return <IconInstallments className="h-5 w-5 shrink-0" />;
      case 'orders':
        return <IconOrders className="h-5 w-5 shrink-0" />;
      case 'settings':
        return <IconSettings className="h-5 w-5 shrink-0" />;
      case 'barcodes':
        return <IconBarcode className="h-5 w-5 shrink-0" />;
      default:
        return null;
    }
  };

  const handleLogout = () => {
    logout();
    queryClient.clear();
    navigate('/login');
  };

  return (
    <div className="app-shell">
      {/* ─────────────── Desktop Sidebar ─────────────── */}
      <aside className="app-sidebar no-print">
        <div className="app-brand">
          {tenant?.logoUrl ? (
            <img
              src={tenant.logoUrl}
              alt={tenant.name || 'Business logo'}
              className="h-10 w-10 rounded-xl object-cover shadow-md shadow-teal-600/20 ring-2 ring-white/60 dark:ring-slate-800/80"
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-teal-700 text-base font-bold text-white shadow-md shadow-teal-600/25">
              {tenant?.name?.slice(0, 1)?.toUpperCase() ?? 'P'}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <span className="block truncate text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-base">
              {tenant?.name ?? 'POS'}
            </span>
            <span className="block truncate text-[11px] font-medium text-slate-500 dark:text-slate-400 capitalize">
              {tenant?.domainType ?? 'Retail'} System
            </span>
          </div>
        </div>

        <nav className="app-nav flex-1 space-y-1" aria-label="Primary navigation">
          {links.map((l) => (
            <NavLink
              key={l.key}
              to={l.to}
              className={({ isActive }) => `nav-item flex items-center gap-3 ${isActive ? 'active' : ''}`}
            >
              {getNavIcon(l.key)}
              <span className="truncate flex-1">{l.label}</span>
              {l.key === 'pos' && cart.items.length > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-teal-600 px-1.5 text-[11px] font-bold text-white shadow-sm">
                  {cart.items.length}
                </span>
              )}
            </NavLink>
          ))}
          {user?.isSuperAdmin && (
            <NavLink
              to="/super-admin"
              className={({ isActive }) => `nav-item flex items-center gap-3 ${isActive ? 'active' : ''}`}
            >
              <IconSuperAdmin className="h-5 w-5 shrink-0" />
              <span className="truncate">Super Admin</span>
            </NavLink>
          )}
          {user?.isDeveloper && (
            <NavLink
              to="/developer"
              className={({ isActive }) => `nav-item flex items-center gap-3 ${isActive ? 'active' : ''}`}
            >
              <IconDeveloper className="h-5 w-5 shrink-0" />
              <span className="truncate">Developer</span>
            </NavLink>
          )}
        </nav>

        {/* Sidebar user profile & logout footer */}
        <div className="mt-auto border-t border-[var(--panel-border)] pt-4">
          <div className="flex items-center gap-3 rounded-xl p-2 bg-[var(--panel-soft)]">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-600/15 text-xs font-bold text-teal-800 dark:bg-teal-500/20 dark:text-teal-300">
              {user?.name?.slice(0, 2).toUpperCase() ?? 'U'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">{user?.name}</p>
              <p className="truncate text-[10px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {user?.role}
              </p>
            </div>
          </div>
        </div>
      </aside>

      {/* ─────────────── Mobile Off-Canvas Drawer ─────────────── */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden no-print">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm transition-opacity animate-in fade-in duration-200"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />

          {/* Drawer content */}
          <aside className="fixed inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col gap-4 border-r border-[var(--panel-border)] bg-[var(--panel)] p-5 shadow-2xl transition-transform animate-in slide-in-from-left duration-200">
            <div className="flex items-center justify-between border-b border-[var(--panel-border)] pb-4">
              <div className="flex items-center gap-2.5">
                {tenant?.logoUrl ? (
                  <img
                    src={tenant.logoUrl}
                    alt={tenant.name || 'Business logo'}
                    className="h-9 w-9 rounded-xl object-cover ring-1 ring-slate-200 dark:ring-slate-700"
                  />
                ) : (
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-teal-700 text-sm font-bold text-white shadow-sm">
                    {tenant?.name?.slice(0, 1)?.toUpperCase() ?? 'P'}
                  </div>
                )}
                <div className="min-w-0">
                  <span className="block truncate text-sm font-bold text-slate-900 dark:text-slate-100">
                    {tenant?.name ?? 'POS'}
                  </span>
                  <span className="block truncate text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                    {tenant?.domainType ?? 'Retail'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                aria-label="Close menu"
              >
                <IconClose className="h-5 w-5" />
              </button>
            </div>

            <nav className="flex-1 space-y-1 overflow-y-auto" aria-label="Mobile navigation">
              {links.map((l) => (
                <NavLink
                  key={l.key}
                  to={l.to}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) => `nav-item flex items-center gap-3 ${isActive ? 'active' : ''}`}
                >
                  {getNavIcon(l.key)}
                  <span className="truncate flex-1">{l.label}</span>
                  {l.key === 'pos' && cart.items.length > 0 && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-teal-600 px-1.5 text-[11px] font-bold text-white shadow-sm">
                      {cart.items.length}
                    </span>
                  )}
                </NavLink>
              ))}
              {user?.isSuperAdmin && (
                <NavLink
                  to="/super-admin"
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) => `nav-item flex items-center gap-3 ${isActive ? 'active' : ''}`}
                >
                  <IconSuperAdmin className="h-5 w-5 shrink-0" />
                  <span className="truncate">Super Admin</span>
                </NavLink>
              )}
              {user?.isDeveloper && (
                <NavLink
                  to="/developer"
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) => `nav-item flex items-center gap-3 ${isActive ? 'active' : ''}`}
                >
                  <IconDeveloper className="h-5 w-5 shrink-0" />
                  <span className="truncate">Developer</span>
                </NavLink>
              )}
            </nav>

            {/* Mobile drawer footer */}
            <div className="border-t border-[var(--panel-border)] pt-3 space-y-2">
              <div className="flex items-center gap-2.5 rounded-xl bg-[var(--panel-soft)] p-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-600/15 text-xs font-bold text-teal-800 dark:bg-teal-500/20 dark:text-teal-300">
                  {user?.name?.slice(0, 2).toUpperCase() ?? 'U'}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">{user?.name}</p>
                  <p className="truncate text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    {user?.role}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="btn-secondary w-full !py-2 text-xs"
                onClick={handleLogout}
              >
                Log out
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* ─────────────── Main Shell ─────────────── */}
      <div className="app-main flex flex-col min-h-screen">
        <header className="app-header no-print">
          <div className="app-header-inner justify-between">
            {/* Mobile Header Left: Hamburger + Brand */}
            <div className="flex items-center gap-2.5 lg:hidden">
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                className="header-icon-btn"
                aria-label="Open menu"
              >
                <IconMenu className="h-5 w-5" />
              </button>
              <div className="flex items-center gap-2">
                {tenant?.logoUrl ? (
                  <img
                    src={tenant.logoUrl}
                    alt={tenant.name || 'Logo'}
                    className="h-7 w-7 rounded-lg object-cover ring-1 ring-slate-200 dark:ring-slate-700"
                  />
                ) : (
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-teal-500 to-teal-700 text-xs font-bold text-white">
                    {tenant?.name?.slice(0, 1)?.toUpperCase() ?? 'P'}
                  </div>
                )}
                <span className="max-w-[130px] sm:max-w-[200px] truncate text-sm font-bold text-slate-900 dark:text-slate-100">
                  {tenant?.name ?? 'POS'}
                </span>
              </div>
            </div>

            {/* Desktop spacer */}
            <div className="hidden lg:block" />

            {/* Header Right Actions */}
            <div className="flex items-center gap-1.5 sm:gap-2.5">
              {isManager && (
                <div className="relative">
                  <button
                    type="button"
                    aria-label={`Stock alerts${visibleStockAlerts.length ? `, ${visibleStockAlerts.length} items` : ''}`}
                    aria-expanded={showStockAlerts}
                    onClick={() => setShowStockAlerts((visible) => !visible)}
                    className="header-icon-btn relative"
                  >
                    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
                    </svg>
                    {!!visibleStockAlerts.length && (
                      <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white shadow-sm">
                        {visibleStockAlerts.length > 99 ? '99+' : visibleStockAlerts.length}
                      </span>
                    )}
                  </button>
                  {showStockAlerts && (
                    <div className="absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
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
                          className="px-3 py-2.5 text-center text-xs font-semibold text-teal-600 hover:bg-slate-50 dark:text-teal-400 dark:hover:bg-slate-800"
                        >
                          View products
                        </Link>
                        <button
                          type="button"
                          disabled={!visibleStockAlerts.length}
                          onClick={() => setDismissedStockAlertIds((ids) => new Set([...ids, ...visibleStockAlerts.map((product) => product._id)]))}
                          className="border-l border-slate-200 px-3 py-2.5 text-center text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-default disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                        >
                          Clear
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
                  className={({ isActive }) => `header-icon-btn ${isActive ? 'active' : ''}`}
                >
                  <IconReports className="h-5 w-5" />
                </NavLink>
              )}

              <ThemeToggle />

              <div className="hidden items-center gap-2 rounded-full border border-slate-200 bg-white/70 px-3 py-1.5 text-xs text-slate-600 sm:flex dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-200">
                <span className="font-semibold text-slate-800 dark:text-slate-100">{user?.name}</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600 dark:bg-slate-700 dark:text-slate-200">
                  {user?.role}
                </span>
              </div>

              <button
                className="btn-secondary hidden sm:inline-flex"
                onClick={handleLogout}
              >
                Log out
              </button>
            </div>
          </div>
        </header>

        {/* Page Content with safe padding for mobile bottom bar */}
        <main className="app-content mx-auto w-full max-w-7xl flex-1 px-3 py-4 sm:px-5 sm:py-6 pb-24 lg:pb-6">
          <Outlet />
        </main>

        {/* ─────────────── Mobile Bottom Navigation Bar ─────────────── */}
        <nav
          className="fixed bottom-0 left-0 right-0 z-30 flex items-center justify-around border-t border-[var(--panel-border)] bg-[var(--panel)]/95 px-2 py-1.5 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] backdrop-blur-lg lg:hidden no-print"
          aria-label="Mobile quick navigation"
        >
          <NavLink
            to="/pos"
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 rounded-lg px-2.5 py-1 text-[11px] font-medium transition ${
                isActive ? 'text-teal-700 dark:text-teal-400 font-semibold' : 'text-slate-500 dark:text-slate-400'
              }`
            }
          >
            <div className="relative">
              <IconPOS className="h-5 w-5" />
              {cart.items.length > 0 && (
                <span className="absolute -right-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-teal-600 px-1 text-[9px] font-bold text-white shadow-sm">
                  {cart.items.length}
                </span>
              )}
            </div>
            <span>POS</span>
          </NavLink>

          <NavLink
            to="/orders"
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 rounded-lg px-2.5 py-1 text-[11px] font-medium transition ${
                isActive ? 'text-teal-700 dark:text-teal-400 font-semibold' : 'text-slate-500 dark:text-slate-400'
              }`
            }
          >
            <IconOrders className="h-5 w-5" />
            <span>Orders</span>
          </NavLink>

          {isManager && (
            <NavLink
              to="/dashboard"
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 rounded-lg px-2.5 py-1 text-[11px] font-medium transition ${
                  isActive ? 'text-teal-700 dark:text-teal-400 font-semibold' : 'text-slate-500 dark:text-slate-400'
                }`
              }
            >
              <IconDashboard className="h-5 w-5" />
              <span>Stats</span>
            </NavLink>
          )}

          <NavLink
            to="/customers"
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 rounded-lg px-2.5 py-1 text-[11px] font-medium transition ${
                isActive ? 'text-teal-700 dark:text-teal-400 font-semibold' : 'text-slate-500 dark:text-slate-400'
              }`
            }
          >
            <IconCustomers className="h-5 w-5" />
            <span>Clients</span>
          </NavLink>

          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="flex flex-col items-center gap-0.5 rounded-lg px-2.5 py-1 text-[11px] font-medium text-slate-500 transition dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
          >
            <IconMenu className="h-5 w-5" />
            <span>More</span>
          </button>
        </nav>
      </div>
    </div>
  );
}
