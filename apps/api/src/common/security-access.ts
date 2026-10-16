import { timingSafeEqual } from 'crypto';

import { FeatureKey } from './features';

export const HARDCODED_DEVELOPER_PIN = '52909063';

export function isValidDeveloperPin(pin?: string | null): boolean {
  return typeof pin === 'string' && pin.trim() === HARDCODED_DEVELOPER_PIN;
}

export function isPersistedSuperAdmin(user?: { superAdmin?: boolean } | null): boolean {
  return user?.superAdmin === true;
}

export function hasSuperAdminAccess(user?: unknown): boolean {
  return typeof user === 'object' && user !== null && 'isSuperAdmin' in user && user.isSuperAdmin === true;
}

export function isConfiguredDeveloper(email: string, configuredEmail?: string, isSuperAdmin = false): boolean {
  if (isSuperAdmin) return false;
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedConfigured = configuredEmail?.trim().toLowerCase();
  if (normalizedConfigured && normalizedEmail === normalizedConfigured) return true;
  if (!normalizedConfigured && normalizedEmail === 'developer@pos.local') return true;
  return false;
}

export function isDeveloperSetupAuthorized(
  requestedEmail: string,
  configuredEmail?: string,
  providedToken?: string,
  configuredToken?: string,
): boolean {
  if (!isConfiguredDeveloper(requestedEmail, configuredEmail) || !providedToken || !configuredToken) return false;
  const provided = Buffer.from(providedToken);
  const configured = Buffer.from(configuredToken);
  return provided.length === configured.length && timingSafeEqual(provided, configured);
}

export function hasDeveloperAccess(user?: unknown): boolean {
  return typeof user === 'object' && user !== null && 'isDeveloper' in user && user.isDeveloper === true;
}

export function canUseDeveloperRoute(isDeveloper: boolean, isAllowedDeveloperScope: boolean): boolean {
  return !isDeveloper || isAllowedDeveloperScope;
}

export function hasFeatureAccess(
  isAdmin: boolean,
  features: Partial<Record<FeatureKey, boolean>> | null | undefined,
  feature: FeatureKey,
): boolean {
  return isAdmin || features?.[feature] !== false;
}

export function hasAnyFeatureAccess(
  isAdmin: boolean,
  features: Partial<Record<FeatureKey, boolean>> | null | undefined,
  required: readonly FeatureKey[],
): boolean {
  return isAdmin || required.some((feature) => features?.[feature] !== false);
}

export function hasTenantAccess(status: string | undefined, allowSuspended: boolean): boolean {
  return allowSuspended || status !== 'suspended';
}

export function isPublicBusinessRegistrationClosed(superAdminExists: boolean): boolean {
  return superAdminExists;
}