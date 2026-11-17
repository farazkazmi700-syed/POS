import { useQuery } from '@tanstack/react-query';
import { tenantApi } from '../api';
import { useAuth } from '../store/auth';

export function useTenant() {
  const user = useAuth((state) => state.user);
  const query = useQuery({ queryKey: ['tenant'], queryFn: tenantApi.get, enabled: !!user && !user.isDeveloper, staleTime: 30_000, refetchInterval: 60_000 });
  return { tenant: query.data, currency: query.data?.currency ?? 'PKR', ...query };
}
