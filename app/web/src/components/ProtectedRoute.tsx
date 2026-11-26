import type { Role } from '@pos/shared-types';
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { authApi } from '../api';
import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useTenant } from '../hooks/useTenant';
import { availablePages } from '../utils/access';
import { useAuth } from '../store/auth';

export default function ProtectedRoute({ roles, superAdminOnly = false }: { roles?: Role[]; superAdminOnly?: boolean }) {
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const location = useLocation();
  const { tenant, isPending, isError, refetch } = useTenant();
  const identity = useQuery({ queryKey: ['auth', 'me', user?._id], queryFn: authApi.me, enabled: !!user && !user.isDeveloper, staleTime: 15_000, refetchInterval: 30_000 });
  useEffect(() => {
    if (identity.data && useAuth.getState().user?._id === identity.data._id) useAuth.setState({ user: identity.data });
  }, [identity.data]);
  if (!user) return <Navigate to="/login" replace />;
  if (superAdminOnly && !user.isSuperAdmin) return <Navigate to="/" replace />;
  if (user.isDeveloper) return <Navigate to="/developer" replace />;
  if (!superAdminOnly && !user.isSuperAdmin) {
    if (isPending) return <p className="p-8" role="status">Loading workspace access…</p>;
    if (isError) return <div className="card m-8" role="alert">Could not load workspace access. <button type="button" className="btn-secondary" onClick={() => refetch()}>Retry</button></div>;
    const pages = availablePages(user, tenant);
    const section = location.pathname.split('/')[1];
    const pageKey = section === 'reports' ? 'dashboard' : section === 'data-sync' ? 'backup' : section;
    if ((roles && !roles.includes(user.role)) || (section && !pages.some((item) => item.key === pageKey))) {
      return <main className="card mx-auto mt-12 max-w-lg space-y-4"><h1 className="text-xl font-semibold">Access restricted</h1><p>Your account does not have access to this module. Ask your business owner to update your rights.</p><div className="flex flex-wrap gap-3">{pages.map((item) => <Link className="btn-secondary" key={item.key} to={`/${item.key}`}>{item.label}</Link>)}</div><button type="button" className="btn-secondary" onClick={logout}>Sign out</button></main>;
    }
  }
  return <Outlet />;
}
