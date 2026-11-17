import { TENANT_NAVIGATION_ITEMS, type Tenant, type UserSummary } from '@pos/shared-types';

export function availablePages(user: UserSummary, tenant?: Tenant) {
  return TENANT_NAVIGATION_ITEMS.filter((item) =>
    (!item.managerOnly || user.role === 'owner' || user.role === 'admin')
    && (item.key !== 'backup' || user.role === 'owner')
    && (item.key === 'help' || item.key === 'backup' || user.role === 'owner' || user.moduleRights === undefined || user.moduleRights.includes(item.key))
    && (!('feature' in item) || tenant?.featureFlags?.[item.feature] !== false),
  );
}
