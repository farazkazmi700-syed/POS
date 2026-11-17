import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { productApi } from '../api';
import BranchSwitcher from './BranchSwitcher';
import ProductFooter from './ProductFooter';
import { useTenant } from '../hooks/useTenant';
import ThemeToggle from './ThemeToggle';
import { urduClass } from '../utils/urdu';
import { useCart } from '../store/cart';
import { useAuth } from '../store/auth';
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
  IconBarcodeGenerator,
  IconBarcodeScanner,
  IconSuperAdmin,
  IconDeveloper,
  IconHelp,
  IconBackup,
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
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const userMenuTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [menuFocusIndex, setMenuFocusIndex] = useState(0);
  const [dismissedStockAlertIds, setDismissedStockAlertIds] = useState<Set<string>>(() => new Set());

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  // Close the user menu on outside click and Escape; keep Escape focus on the trigger.
  useEffect(() => {
    if (!userMenuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) setUserMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setUserMenuOpen(false);
        userMenuTriggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [userMenuOpen]);

  useEffect(() => {
    setUserMenuOpen(false);
    setShowStockAlerts(false);
  }, [location.pathname]);

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
    enabled: isManager && tenant?.featureFlags?.inventory !== false && (user?.role === 'owner' || user?.moduleRights === undefined || user.moduleRights.includes('products')),
    refetchInterval: 60_000,
  });
  const visibleStockAlerts = stockAlerts.data?.data.filter((product) => !dismissedStockAlertIds.has(product._id)) ?? [];
  const activeLogoUrl = tenant?.logoUrl || '/kazmion-logo.jpg';

  useEffect(() => {
    const activeIds = new Set(stockAlerts.data?.data.map((product) => product._id) ?? []);
    setDismissedStockAlertIds((dismissedIds) => {
      const remainingIds = new Set([...dismissedIds].filter((id) => activeIds.has(id)));
      return remainingIds.size === dismissedIds.size ? dismissedIds : remainingIds;
    });
  }, [stockAlerts.data]);

  const links = TENANT_NAVIGATION_ITEMS.filter((item) =>
    (!item.managerOnly || isManager) && (item.key === 'help' || item.key === 'backup' || tenant?.navigationVisibility?.[item.key] !== false)
      && (!('feature' in item) || tenant?.featureFlags?.[item.feature] !== false)
      // Backup exports stay on the business owner account; help is universal.
      && (item.key !== 'backup' || user?.role === 'owner')
      // Module rights: owner sees everything; admin/staff are limited to their granted modules.
      && (item.key === 'help' || item.key === 'backup' || user?.role === 'owner' || !user?.moduleRights || user.moduleRights.includes(item.key)),
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
      case 'barcode-generator':
        return <IconBarcodeGenerator className="h-5 w-5 shrink-0" />;
      case 'barcode-scanner':
        return <IconBarcodeScanner className="h-5 w-5 shrink-0" />;
      case 'help':
        return <IconHelp className="h-5 w-5 shrink-0" />;
      case 'backup':
        return <IconBackup className="h-5 w-5 shrink-0" />;
      default:
        return null;
    }
  };

  const handleLogout = useCallback(() => {
    if (cart.items.length > 0 && !window.confirm('You have items in your cart. Log out and discard this unsaved cart?')) return;
    logout();
    queryClient.clear();
    navigate('/login');
  }, [cart.items.length, logout, queryClient, navigate]);

  const initials = (user?.name ?? 'U')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || 'U';
  const formattedName = (user?.name ?? 'User').replace(/\b\w/g, (letter) => letter.toUpperCase());

  const toggleUserMenu = () => {
    const willOpen = !userMenuOpen;
    setUserMenuOpen(willOpen);
    setMenuFocusIndex(0);
    if (willOpen) requestAnimationFrame(() => userMenuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus());
  };

  const onUserMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const menuItems = userMenuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]');
    if (!menuItems?.length) return;
    const currentIndex = Array.from(menuItems).indexOf(document.activeElement as HTMLElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      const next = (Math.max(0, currentIndex) + delta + menuItems.length) % menuItems.length;
      setMenuFocusIndex(next);
      menuItems[next].focus();
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : menuItems.length - 1;
      setMenuFocusIndex(next);
      menuItems[next].focus();
    }
  };

  return (
    <div className="app-shell">
      {/* ─────────────── Desktop Sidebar ─────────────── */}
      <aside className="app-sidebar no-print">
        <div className="app-brand">
          <img
            src={activeLogoUrl}
            alt={tenant?.name || 'KazmiOn POS'}
            className="h-10 w-10 rounded-xl object-contain bg-white dark:bg-slate-900 p-0.5 shadow-md shadow-sky-600/20 ring-2 ring-white/60 dark:ring-slate-800/80"
          />
          <div className="min-w-0 flex-1">
            <span className={`block line-clamp-2 text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-base ${urduClass(tenant?.name ?? '')}`}>
              {tenant?.name ?? 'KazmiOn POS'}
            </span>
            <span className={`block truncate text-[11px] font-medium text-slate-500 dark:text-slate-400 capitalize ${urduClass(tenant?.domainType ?? '')}`}>
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
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-gradient-to-r from-orange-500 to-amber-500 px-1.5 text-[11px] font-bold text-white shadow-sm shadow-orange-500/30">
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
          <div className="flex items-center gap-2 rounded-xl bg-[var(--panel-soft)] p-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal-600 text-xs font-bold text-white">{initials}</div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">{user?.name}</p>
              <p className="truncate text-[10px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">{user?.role}</p>
            </div>
            <button type="button" onClick={handleLogout} className="header-icon-btn !h-9 !w-9 !rounded-lg text-red-600 dark:text-red-400" aria-label="Log out" title="Log out">
              <LogoutIcon className="h-4 w-4" />
            </button>
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
                <img
                  src={activeLogoUrl}
                  alt={tenant?.name || 'KazmiOn POS'}
                  className="h-9 w-9 rounded-xl object-contain bg-white dark:bg-slate-900 p-0.5 ring-1 ring-slate-200 dark:ring-slate-700 shadow-xs"
                />
                <div className="min-w-0">
                  <span className="block truncate text-sm font-bold text-slate-900 dark:text-slate-100">
                    {tenant?.name ?? 'KazmiOn POS'}
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
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-gradient-to-r from-orange-500 to-amber-500 px-1.5 text-[11px] font-bold text-white shadow-sm shadow-orange-500/30">
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
            <div className="flex items-center gap-2 rounded-xl border-t border-[var(--panel-border)] bg-[var(--panel-soft)] p-2 pt-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#0084f0] to-[#00183c] text-xs font-bold text-white shadow-xs">{initials}</div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">{user?.name}</p>
                <p className="truncate text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">{user?.role}</p>
              </div>
              <button type="button" onClick={handleLogout} className="header-icon-btn !h-9 !w-9 !rounded-lg text-red-600 dark:text-red-400" aria-label="Log out" title="Log out">
                <LogoutIcon className="h-4 w-4" />
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
                <span className="max-w-[130px] sm:max-w-[200px] truncate text-sm font-bold text-slate-900 dark:text-slate-100">
                  {tenant?.name ?? 'KazmiOn POS'}
                </span>
              </div>
            </div>

            {/* Header Right Actions */}
            <div className="ml-auto flex items-center gap-1.5 sm:gap-2.5">
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

              <div className="relative" ref={userMenuRef}>
                <button ref={userMenuTriggerRef} type="button" onClick={toggleUserMenu} onKeyDown={(event) => {
                  if ((event.key === 'Enter' || event.key === ' ') && !userMenuOpen) {
                    event.preventDefault();
                    setMenuFocusIndex(0);
                  }
                }} aria-haspopup="menu" aria-expanded={userMenuOpen} aria-label={`User menu for ${formattedName}`} className="flex min-h-11 items-center gap-2 rounded-xl px-1.5 py-1 text-left transition hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-teal-600 dark:hover:bg-slate-800 sm:px-2">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#0084f0] to-[#00183c] text-xs font-bold text-white shadow-xs ring-2 ring-sky-500/20">{initials}</span>
                  <span className="hidden min-w-0 items-center gap-2 sm:flex"><span className="max-w-32 truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{formattedName}</span><span className="rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-teal-700 dark:bg-teal-950 dark:text-teal-300">{user?.role}</span></span>
                  <ChevronIcon className="h-4 w-4 shrink-0 text-slate-500" />
                </button>
                {userMenuOpen && <div role="menu" aria-label="User account menu" onKeyDown={onUserMenuKeyDown} className="absolute right-0 z-50 mt-2 w-72 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-2xl border-slate-200 bg-white p-1.5 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
                  <div className="px-3 py-3"><p className="truncate text-sm font-bold text-slate-900 dark:text-slate-100">{formattedName}</p><div className="mt-1 flex items-center gap-2"><span className="rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-teal-700 dark:bg-teal-950 dark:text-teal-300">{user?.role}</span><p className="truncate text-xs text-slate-500 dark:text-slate-400">{user?.email}</p></div></div>
                  <div className="my-1 border-t border-slate-200 dark:border-slate-700" />
                  <Link role="menuitem" tabIndex={menuFocusIndex === 0 ? 0 : -1} to="/recover" onClick={() => setUserMenuOpen(false)} onFocus={() => setMenuFocusIndex(0)} className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm text-slate-700 hover:bg-slate-100 focus:bg-slate-100 focus:outline-none dark:text-slate-200 dark:hover:bg-slate-800 dark:focus:bg-slate-800"><ProfileIcon className="h-4 w-4" /> Account security</Link>
                  <div role="menuitem" tabIndex={menuFocusIndex === 1 ? 0 : -1} onFocus={() => setMenuFocusIndex(1)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); (event.currentTarget.querySelector('button') as HTMLButtonElement | null)?.click(); } }} className="flex min-h-11 items-center justify-between gap-3 rounded-xl px-3 text-sm text-slate-700 hover:bg-slate-100 focus:bg-slate-100 focus:outline-none dark:text-slate-200 dark:hover:bg-slate-800 dark:focus:bg-slate-800"><span className="flex items-center gap-3"><ThemeIcon className="h-4 w-4" /> Dark mode</span><ThemeToggle /></div>
                  <div className="my-1 border-t border-slate-200 dark:border-slate-700" />
                  <button role="menuitem" tabIndex={menuFocusIndex === 2 ? 0 : -1} type="button" onFocus={() => setMenuFocusIndex(2)} onClick={() => { setUserMenuOpen(false); handleLogout(); }} className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium text-red-600 hover:bg-red-50 focus:bg-red-50 focus:outline-none dark:text-red-400 dark:hover:bg-red-950/50 dark:focus:bg-red-950/50"><LogoutIcon className="h-4 w-4" /> Log out</button>
                </div>}
              </div>
            </div>
          </div>
        </header>

        {/* Page Content with safe padding for mobile bottom bar */}
        <a className="skip-link" href="#workspace-content">Skip to main content</a>
        <main id="workspace-content" tabIndex={-1} className="app-content mx-auto w-full max-w-7xl flex-1 px-3 py-4 sm:px-5 sm:py-6 pb-24 lg:pb-6">
          <BranchSwitcher />
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
        <ProductFooter />
      </div>
    </div>
  );
}

function ChevronIcon({ className = '' }: { className?: string }) {
  return <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" /></svg>;
}

function ProfileIcon({ className = '' }: { className?: string }) {
  return <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.5 20.1a7.5 7.5 0 0 1 15 0A17.9 17.9 0 0 1 12 21.75c-2.67 0-5.2-.58-7.5-1.65Z" /></svg>;
}

function ThemeIcon({ className = '' }: { className?: string }) {
  return <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" /></svg>;
}

function LogoutIcon({ className = '' }: { className?: string }) {
  return <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" /></svg>;
}
