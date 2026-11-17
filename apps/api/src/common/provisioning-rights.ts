import { DOMAIN_ROLE_PACKAGES, ProvisionableRole } from './domain-packages';
const featureForRight: Record<string, string | null> = {
  dashboard: 'reports', pos: 'pos', products: 'inventory', customers: 'customers', installments: 'installments',
  orders: 'pos', settings: null, 'barcode-generator': 'barcodes', 'barcode-scanner': 'barcodes',
};
export function provisioningRights(domain: string, role: ProvisionableRole, flags: object, requested?: string[]): string[] {
  const defaults = DOMAIN_ROLE_PACKAGES[domain]?.accounts.find((entry) => entry.role === role)?.moduleRights ?? [];
  const rights = requested ?? defaults;
  if (rights.some((key) => !Object.hasOwn(featureForRight, key))) throw new Error('Unknown module right');
  const features = flags as Record<string, boolean | undefined>;
  // Settings module is always granted so every provisioned account can manage its own preferences.
  return [...new Set([...rights, 'settings'])].filter((key) => featureForRight[key] === null || features[featureForRight[key]!] === true);
}
