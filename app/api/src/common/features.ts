export const FEATURE_KEYS = ['dashboard', 'pos', 'inventory', 'reports', 'customers', 'installments', 'barcodes', 'settings', 'data-sync', 'stock-replenishment', 'collections-forecast'] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];
export const OPT_IN_FEATURES: readonly FeatureKey[] = ['data-sync', 'stock-replenishment', 'collections-forecast'];
export type FeatureRequirement = FeatureKey | readonly FeatureKey[];

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  dashboard: 'Dashboard',
  pos: 'POS',
  inventory: 'Inventory',
  reports: 'Reports',
  customers: 'Customers',
  installments: 'Installments',
  barcodes: 'Barcode tools',
  'data-sync': 'Data Sync',
  'stock-replenishment': 'Stock Replenishment',
  'collections-forecast': 'Installment Collections Forecast',
  settings: 'Settings & Staff Management',
};