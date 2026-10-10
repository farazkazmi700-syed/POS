import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTenant } from '../hooks/useTenant';
import ThemeToggle from './ThemeToggle';
import { useAuth } from '../store/auth';

export default function Layout() {
  const { user, logout } = useAuth();
  const { tenant } = useTenant();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isManager = user?.role === 'owner' || user?.role === 'admin';

  const links = [
    ...(isManager ? [{ to: '/dashboard', label: 'Dashboard' }] : []),
    { to: '/pos', label: 'POS' },
    ...(isManager ? [{ to: '/products', label: 'Products' }] : []),
    { to: '/customers', label: 'Customers' },
    { to: '/installments', label: 'Installments' },
    { to: '/orders', label: 'Orders' },
    ...(isManager ? [{ to: '/settings', label: 'Settings' }] : []),
  ];

  return (
    <div className="app-shell">
      <header className="app-header no-print">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-3 px-3 py-3 sm:px-4">
          <div className="flex min-w-[140px] items-center gap-2">
            {tenant?.logoUrl ? (
              <img src={tenant.logoUrl} alt={tenant.name || 'Business logo'} className="h-9 w-9 rounded-xl object-cover shadow-md shadow-indigo-500/20 ring-2 ring-white/60 dark:ring-slate-800/80" />
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 text-sm font-bold text-white shadow-md shadow-indigo-500/20">
                {tenant?.name?.slice(0, 1)?.toUpperCase() ?? 'P'}
              </div>
            )}
            <span className="text-sm font-semibold sm:text-base">{tenant?.name ?? 'POS'}</span>
          </div>

          <nav className="flex flex-1 flex-wrap items-center gap-1 sm:gap-1.5">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                className={({ isActive }) => `nav-pill ${isActive ? 'active' : ''}`}
              >
                {l.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-2 sm:gap-3">
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

      <main className="mx-auto max-w-7xl px-3 py-4 sm:px-4 sm:py-6">
        <Outlet />
      </main>
    </div>
  );
}
