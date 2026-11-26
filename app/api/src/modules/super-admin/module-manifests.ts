import { FEATURE_KEYS, FEATURE_LABELS } from '../../common/features';

export type ReleaseState = 'active' | 'coming-soon' | 'retired';
export interface ModuleManifest {
  key: string;
  /** Stable human-readable module id (MOD-…) used in grants, manifests and audit records. */
  moduleId: string;
  label: string;
  version: string;
  releaseState: ReleaseState;
  universal?: boolean;
  submodules: { key: string; label: string }[];
}

/** Deterministic MOD- id: MOD-POS, MOD-INSTALLMENTS, MOD-BACKUP, … */
function moduleId(key: string): string {
  return `MOD-${key.toUpperCase().replace(/[^A-Z0-9]+/g, '-')}`;
}

/** Trusted build-time registrations. Database catalog entries never load executable code. */
export const MODULE_MANIFESTS: readonly ModuleManifest[] = [
  ...FEATURE_KEYS.filter((key) => key !== 'settings').map((key): ModuleManifest => ({
    key, moduleId: moduleId(key), label: FEATURE_LABELS[key], version: '1.0.0', releaseState: 'active',
    submodules: ({
      dashboard: ['overview', 'kpis', 'trends'],
      pos: ['checkout', 'orders', 'invoices', 'voids', 'refunds'],
      inventory: ['products', 'stock-adjustments', 'stock-movements'],
      reports: ['sales', 'exports'], customers: ['directory'],
      installments: ['dashboard', 'products', 'customers', 'quotes', 'sales', 'agreements', 'payments', 'schedule', 'ledgers', 'receipts', 'overdue', 'reports', 'settings'],
      barcodes: ['generator', 'scanner', 'labels'],
      'data-sync': ['snapshots'],
      'stock-replenishment': ['low-stock', 'product-search'],
      'collections-forecast': ['overdue-balances', 'scheduled-collections'],
    })[key].map((name) => ({ key: `${key}.${name}`, label: name.replace(/-/g, ' ') })),
  })),
  { key: 'settings', moduleId: moduleId('settings'), label: 'Settings & Staff Management', version: '1.0.0', releaseState: 'active', universal: true,
    submodules: [
      { key: 'settings.general', label: 'General' },
      { key: 'settings.staff', label: 'Staff Management' },
      { key: 'settings.branches', label: 'Branches' },
      { key: 'settings.taxes', label: 'Taxes' },
      { key: 'settings.print', label: 'Print & Invoices' },
      { key: 'settings.payments', label: 'Payments' },
      { key: 'settings.integrations', label: 'Integrations' },
      { key: 'settings.audit', label: 'Audit Trail' },
      { key: 'settings.security', label: 'Security' },
    ] },
  { key: 'help', moduleId: moduleId('help'), label: 'Help & Support', version: '1.0.0', releaseState: 'active', universal: true, submodules: [{ key: 'help.recovery', label: 'account recovery' }, { key: 'help.contact', label: 'support contact' }] },
  { key: 'backup', moduleId: moduleId('backup'), label: 'Backup', version: '1.0.0', releaseState: 'active', universal: true,
    submodules: [{ key: 'backup.export', label: 'Authorized business export' }] },
  { key: 'ai-chatbot', moduleId: moduleId('ai-chatbot'), label: 'AI Chatbot', version: '0.1.0', releaseState: 'coming-soon', submodules: [] },
];

export function isExecutableModule(key: string, state?: { isActive?: boolean; releaseState?: string }): boolean {
  const manifest = MODULE_MANIFESTS.find((item) => item.key === key);
  return !!manifest && manifest.releaseState === 'active' && !!state && state.isActive === true && state.releaseState === 'active';
}
