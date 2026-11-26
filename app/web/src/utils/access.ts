import { TENANT_NAVIGATION_ITEMS, isOptInFeature, type Tenant, type UserSummary } from '@pos/shared-types';

export function availablePages(user: UserSummary, tenant?: Tenant) {
  return TENANT_NAVIGATION_ITEMS.filter((item) =>
    (!item.managerOnly || user.role === 'owner' || user.role === 'admin')
    && (item.key !== 'backup' || user.role === 'owner')
    && (item.key === 'help' || item.key === 'backup' || user.moduleRights === undefined || user.moduleRights.includes('requiredRight' in item ? item.requiredRight : item.key))
    && (!('feature' in item) || (isOptInFeature(item.feature)
      ? tenant?.featureFlags?.[item.feature] === true
      : item.feature === 'dashboard' && tenant?.featureFlags?.dashboard === undefined
        ? tenant?.featureFlags?.reports !== false
        : tenant?.featureFlags?.[item.feature] !== false)),
  );
}

/** Settings routes are manager-only. Older admin sessions use the role defaults. */
export function canManageSetting(user: UserSummary | null | undefined, action: string) {
  return user?.role === 'owner' || (user?.role === 'admin' && (user.permissions === undefined || user.permissions.includes(action)));
}
