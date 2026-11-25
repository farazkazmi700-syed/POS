export const FEATURE_KEYS = ['pos', 'inventory', 'reports', 'customers', 'installments', 'barcodes', 'settings', 'data-sync'] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];
export type FeatureRequirement = FeatureKey | readonly FeatureKey[];

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  pos: 'POS',
  inventory: 'Inventory',
  reports: 'Reports',
  customers: 'Customers',
  installments: 'Installments',
  barcodes: 'Barcode tools',
  'data-sync': 'Data Sync',
  settings: 'Settings & Staff Management',
};