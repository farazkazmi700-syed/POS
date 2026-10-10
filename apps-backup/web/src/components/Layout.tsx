import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTenant } from '../hooks/useTenant';
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
    { to: '/orders', label: 'Orders' },
    ...(isManager ? [{ to: '/settings', label: 'Settings' }] : []),
  ];

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <span className="text-base font-semibold">{tenant?.name ?? 'POS'}</span>
          <nav className="flex flex-1 flex-wrap gap-1">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-1.5 text-sm font-medium ${isActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-100'}`
                }
              >
                {l.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-slate-600">
              {user?.name} <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs uppercase">{user?.role}</span>
            </span>
            <button
              className="btn-secondary"
              onClick={() => { logout(); queryClient.clear(); navigate('/login'); }}
            >
              Log out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-5">
        <Outlet />
      </main>
    </div>
  );
}
