import {
  HARDCODED_DEVELOPER_PIN, isValidDeveloperPin,
  canUseDeveloperRoute, hasAnyFeatureAccess, hasDeveloperAccess, hasFeatureAccess, hasSuperAdminAccess, hasTenantAccess, isPersistedSuperAdmin,
  isConfiguredDeveloper, isDeveloperSetupAuthorized, isPublicBusinessRegistrationClosed,
} from './security-access';

describe('authorization policy helpers', () => {
  it('recognizes only the explicit persisted Super Admin marker', () => {
    expect(isPersistedSuperAdmin({ superAdmin: true })).toBe(true);
    expect(isPersistedSuperAdmin({ superAdmin: false })).toBe(false);
    expect(isPersistedSuperAdmin({})).toBe(false);
    expect(isPersistedSuperAdmin(null)).toBe(false);
    expect(hasSuperAdminAccess({ isSuperAdmin: true })).toBe(true);
    expect(hasSuperAdminAccess({ superAdmin: true })).toBe(false);
  });

  it('blocks disabled features for tenants without deleting or changing their data', () => {
    expect(hasFeatureAccess(false, { inventory: false }, 'inventory')).toBe(false);
    expect(hasFeatureAccess(false, { inventory: true }, 'inventory')).toBe(true);
    expect(hasFeatureAccess(false, {}, 'inventory')).toBe(true);
    expect(hasFeatureAccess(true, { inventory: false }, 'inventory')).toBe(true);
  });

  it('keeps POS catalog reads available when POS or Inventory is enabled', () => {
    expect(hasAnyFeatureAccess(false, { pos: true, inventory: false }, ['pos', 'inventory'])).toBe(true);
    expect(hasAnyFeatureAccess(false, { pos: false, inventory: true }, ['pos', 'inventory'])).toBe(true);
    expect(hasAnyFeatureAccess(false, { pos: false, inventory: false }, ['pos', 'inventory'])).toBe(false);
  });

  it('denies suspended business access except on explicitly allowed console routes', () => {
    expect(hasTenantAccess('suspended', false)).toBe(false);
    expect(hasTenantAccess('suspended', true)).toBe(true);
    expect(hasTenantAccess('active', false)).toBe(true);
  });

  it('closes developer registration after Super Admin initialization', () => {
    expect(isPublicBusinessRegistrationClosed(false)).toBe(false);
    expect(isPublicBusinessRegistrationClosed(true)).toBe(true);
  });

  it('grants Developer access only to the configured email, excluding Super Admin accounts', () => {
    expect(isConfiguredDeveloper('fzkazmi700@gmail.com', 'fzkazmi700@gmail.com')).toBe(true);
    expect(isConfiguredDeveloper('fzkazmi700@gmail.com', 'other@example.com')).toBe(false);
    expect(isConfiguredDeveloper('fzkazmi700@gmail.com', 'fzkazmi700@gmail.com', true)).toBe(false);
    expect(isConfiguredDeveloper('not-an-owner@example.com', undefined)).toBe(false);
    expect(hasDeveloperAccess({ isDeveloper: true })).toBe(true);
    expect(hasDeveloperAccess({ isDeveloper: false })).toBe(false);
    expect(hasDeveloperAccess({ role: 'owner' })).toBe(false);
  });

  it('requires the configured email and setup token for one-time PIN enrollment', () => {
    expect(isDeveloperSetupAuthorized('dev@example.com', 'dev@example.com', 'token-123456789012345678901234567890', 'token-123456789012345678901234567890')).toBe(true);
    expect(isDeveloperSetupAuthorized('other@example.com', 'dev@example.com', 'token-123456789012345678901234567890', 'token-123456789012345678901234567890')).toBe(false);
    expect(isDeveloperSetupAuthorized('dev@example.com', 'dev@example.com', 'wrong-token-12345678901234567890', 'token-123456789012345678901234567890')).toBe(false);
    expect(isDeveloperSetupAuthorized('dev@example.com', 'dev@example.com', 'token-123456789012345678901234567890', undefined)).toBe(false);
  });

  it('confines Developer accounts to explicitly allowed API routes', () => {
    expect(canUseDeveloperRoute(true, true)).toBe(true);
    expect(canUseDeveloperRoute(true, false)).toBe(false);
    expect(canUseDeveloperRoute(false, false)).toBe(true);
  });

  it('provides and validates hardcoded developer PIN 52909063', () => {
    expect(HARDCODED_DEVELOPER_PIN).toBe('52909063');
    expect(isValidDeveloperPin('52909063')).toBe(true);
    expect(isValidDeveloperPin(' 52909063 ')).toBe(true);
    expect(isValidDeveloperPin('12345678')).toBe(false);
    expect(isValidDeveloperPin('')).toBe(false);
    expect(isValidDeveloperPin(null)).toBe(false);
    expect(isValidDeveloperPin(undefined)).toBe(false);
  });
});