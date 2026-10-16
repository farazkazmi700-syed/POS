import type { Role } from '@pos/shared-types';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../store/auth';

export default function ProtectedRoute({ roles, superAdminOnly = false }: { roles?: Role[]; superAdminOnly?: boolean }) {
  const user = useAuth((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;
  if (superAdminOnly && !user.isSuperAdmin) return <Navigate to="/" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/pos" replace />;
  return <Outlet />;
}
