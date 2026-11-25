/**
 * Business-type role packages ("package manager" catalogue).
 *
 * The developer provisions the business-owner account; the owner — or the
 * developer on their behalf — then creates admin/staff/cashier accounts
 * according to the business domain. Each domain ships a recommended package
 * of account templates with pre-scoped module rights.
 */

export type ProvisionableRole = 'admin' | 'staff' | 'cashier';

export interface RoleTemplateEntry {
  role: ProvisionableRole;
  title: string;
  description: string;
  moduleRights: string[];
}

export interface DomainRolePackage {
  label: string;
  icon: string;
  accounts: RoleTemplateEntry[];
}

export const DOMAIN_ROLE_PACKAGES: Record<string, DomainRolePackage> = {
  restaurant: {
    label: 'Restaurant',
    icon: '🍽️',
    accounts: [
      { role: 'admin', title: 'Manager', description: 'Full back-office: menu (inventory), staff, reports', moduleRights: ['dashboard', 'pos', 'products', 'customers', 'orders', 'settings'] },
      { role: 'staff', title: 'Kitchen / Wait Staff', description: 'Table orders & kitchen display', moduleRights: ['pos', 'orders', 'settings'] },
      { role: 'cashier', title: 'Cashier', description: 'Billing counter & receipts', moduleRights: ['pos', 'orders', 'customers', 'settings'] },
    ],
  },
  retail: {
    label: 'Retail Store',
    icon: '🛍️',
    accounts: [
      { role: 'admin', title: 'Store Admin', description: 'Inventory, reports & staff management', moduleRights: ['dashboard', 'pos', 'products', 'customers', 'orders', 'settings', 'barcode-generator'] },
      { role: 'cashier', title: 'Cashier', description: 'Checkout counter & receipts', moduleRights: ['pos', 'orders', 'settings'] },
    ],
  },
  supermarket: {
    label: 'Supermarket',
    icon: '🏬',
    accounts: [
      { role: 'admin', title: 'Floor Manager', description: 'Stock, pricing & reports', moduleRights: ['dashboard', 'pos', 'products', 'customers', 'orders', 'settings', 'barcode-generator', 'barcode-scanner'] },
      { role: 'staff', title: 'Shelf / Stock Staff', description: 'Barcode scanning & stock lookup', moduleRights: ['pos', 'products', 'barcode-scanner', 'settings'] },
      { role: 'cashier', title: 'Cashier', description: 'Fast-lane checkout', moduleRights: ['pos', 'orders', 'barcode-scanner', 'settings'] },
    ],
  },
  grocery: {
    label: 'Grocery',
    icon: '🧺',
    accounts: [
      { role: 'admin', title: 'Store Admin', description: 'Inventory & staff management', moduleRights: ['dashboard', 'pos', 'products', 'customers', 'orders', 'settings'] },
      { role: 'cashier', title: 'Cashier', description: 'Counter billing', moduleRights: ['pos', 'orders', 'settings'] },
    ],
  },
  pharmacy: {
    label: 'Pharmacy',
    icon: '💊',
    accounts: [
      { role: 'admin', title: 'Pharmacy Manager', description: 'Medicine inventory & compliance reports', moduleRights: ['dashboard', 'pos', 'products', 'customers', 'orders', 'settings', 'barcode-scanner'] },
      { role: 'staff', title: 'Dispensary Staff', description: 'Prescription lookup & dispensing', moduleRights: ['pos', 'products', 'barcode-scanner', 'settings'] },
      { role: 'cashier', title: 'Cashier', description: 'Counter billing', moduleRights: ['pos', 'orders', 'settings'] },
    ],
  },
  electronics: {
    label: 'Electronics',
    icon: '🔌',
    accounts: [
      { role: 'admin', title: 'Showroom Admin', description: 'High-value inventory & installment plans', moduleRights: ['dashboard', 'pos', 'products', 'customers', 'installments', 'orders', 'settings', 'barcode-generator'] },
      { role: 'staff', title: 'Sales Staff', description: 'Quotes & installment agreements', moduleRights: ['pos', 'products', 'installments', 'settings'] },
      { role: 'cashier', title: 'Cashier', description: 'Down-payment collection & receipts', moduleRights: ['pos', 'orders', 'installments', 'settings'] },
    ],
  },
  salon: {
    label: 'Salon / Spa',
    icon: '💇',
    accounts: [
      { role: 'admin', title: 'Salon Manager', description: 'Services catalog, staff rosters & reports', moduleRights: ['dashboard', 'pos', 'products', 'customers', 'orders', 'settings'] },
      { role: 'cashier', title: 'Receptionist', description: 'Walk-in billing & customer ledger', moduleRights: ['pos', 'orders', 'customers', 'settings'] },
    ],
  },
  custom: {
    label: 'Custom Business',
    icon: '🏢',
    accounts: [
      { role: 'admin', title: 'Administrator', description: 'Full management access', moduleRights: ['dashboard', 'pos', 'products', 'customers', 'installments', 'orders', 'settings'] },
      { role: 'staff', title: 'Staff', description: 'General operations access', moduleRights: ['pos', 'orders', 'settings'] },
      { role: 'cashier', title: 'Cashier', description: 'Counter billing', moduleRights: ['pos', 'orders', 'settings'] },
    ],
  },
};
