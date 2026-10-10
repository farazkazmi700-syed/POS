import { useQuery } from '@tanstack/react-query';
import { tenantApi } from '../api';

export function useTenant() {
  const query = useQuery({ queryKey: ['tenant'], queryFn: tenantApi.get, staleTime: 5 * 60_000 });
  return { tenant: query.data, currency: query.data?.currency ?? 'PKR', ...query };
}
