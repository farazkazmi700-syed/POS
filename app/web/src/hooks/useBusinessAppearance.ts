import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { useAuth } from '../store/auth';
import { defaultAppearance, presets, readAppearance, type Appearance } from '../store/appearance';

export function useBusinessAppearance() {
  const user = useAuth((state) => state.user);
  const tenantId = user && !user.isDeveloper && !user.isSuperAdmin ? user.tenantId : undefined;
  const key = ['business-appearance', tenantId] as const;
  const query = useQuery({
    queryKey: key,
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await api.get<Appearance | null>('/tenant/me/appearance');
      return data && Object.hasOwn(presets, data.preset) ? data : defaultAppearance;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: false,
  });
  return { key, tenantId, query, appearance: query.data ?? (tenantId ? readAppearance(tenantId) : defaultAppearance) };
}
