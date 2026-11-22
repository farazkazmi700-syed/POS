import { TENANT_NAVIGATION_ITEMS, type Tenant, type UserSummary } from '@pos/shared-types';

export function availablePages(user: UserSummary, tenant?: Tenant) {
  return TENANT_NAVIGATION_ITEMS.filter((item) =>
    (!item.managerOnly || user.role === 'owner' || user.role === 'admin')
    && (item.key !== 'backup' || user.role === 'owner')
    && (item.key === 'help' || item.key === 'backup' || user.moduleRights === undefined || user.moduleRights.includes(item.key))
    && (!('feature' in item) || tenant?.featureFlags?.[item.feature] !== false),
  );
}

/** Settings routes are manager-only. Older admin sessions use the role defaults. */
export function canManageSetting(user: UserSummary | null | undefined, action: string) {
  return user?.role === 'owner' || (user?.role === 'admin' && (user.permissions === undefined || user.permissions.includes(action)));
}
