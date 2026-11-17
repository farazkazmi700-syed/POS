export type Role = 'owner' | 'admin' | 'cashier';

/** Module rights an admin can grant to individual staff/cashier accounts. */
export type ModuleRightKey = 'dashboard' | 'pos' | 'products' | 'customers' | 'installments' | 'orders' | 'settings' | 'barcode-generator' | 'barcode-scanner';
export const MODULE_RIGHTS: { key: ModuleRightKey; label: string }[] = [
  { key: 'dashboard', label: 'Dashboard & reports' },
  { key: 'pos', label: 'POS' },
  { key: 'products', label: 'Inventory' },
  { key: 'customers', label: 'Customers' },
  { key: 'installments', label: 'Installments' },
  { key: 'orders', label: 'Orders & invoices' },
  { key: 'settings', label: 'Settings & staff management' },
  { key: 'barcode-generator', label: 'Barcode Generator' },
  { key: 'barcode-scanner', label: 'Barcode Scanner' },
];
/** All module right keys as a plain array (handy for defaults & toggles). */
export const MODULE_RIGHT_KEYS: ModuleRightKey[] = MODULE_RIGHTS.map((r) => r.key);
export type FeatureKey = 'pos' | 'inventory' | 'reports' | 'customers' | 'installments' | 'barcodes';
export type FeatureFlags = Record<FeatureKey, boolean>;
export type DomainType = 'retail' | 'restaurant' | 'pharmacy' | 'supermarket' | 'grocery' | 'electronics' | 'salon' | 'custom';
export type TaxClass = 'standard' | 'reduced' | 'exempt';
export type PaymentMode = 'cash' | 'card' | 'wallet' | 'installment' | 'mixed';
export type OrderStatus = 'completed' | 'voided' | 'refunded';
export type InvoiceStatus = 'pending' | 'ready' | 'failed';

export interface ChargeRule {
  label: string;
  type: 'flat' | 'percent';
  value: number;
}

export interface TaxProfile {
  gstPercent: number;
  reducedGstPercent: number;
  serviceChargePercent: number;
  otherCharges: ChargeRule[];
}

export const TENANT_NAVIGATION_ITEMS = [
  { key: 'dashboard', to: '/dashboard', label: 'Dashboard', managerOnly: true, feature: 'reports' },
  { key: 'pos', to: '/pos', label: 'POS', managerOnly: false, feature: 'pos' },
  { key: 'products', to: '/products', label: 'Products', managerOnly: true, feature: 'inventory' },
  { key: 'customers', to: '/customers', label: 'Customers', managerOnly: false, feature: 'customers' },
  { key: 'installments', to: '/installments', label: 'Installments', managerOnly: false, feature: 'installments' },
  { key: 'orders', to: '/orders', label: 'Orders', managerOnly: false },
  { key: 'settings', to: '/settings', label: 'Settings', managerOnly: true },
  { key: 'barcode-generator', to: '/barcode-generator', label: 'Barcode Generator', managerOnly: true, feature: 'barcodes' },
  { key: 'barcode-scanner', to: '/barcode-scanner', label: 'Barcode Scanner', managerOnly: true, feature: 'barcodes' },
  { key: 'backup', to: '/backup', label: 'Backup', managerOnly: false },
  { key: 'help', to: '/help', label: 'Help', managerOnly: false },
] as const;

export type TenantNavigationKey = (typeof TENANT_NAVIGATION_ITEMS)[number]['key'];

export interface Tenant {
  invoicePrintSettings?: InvoicePrintSettings;
  defaultBranchId?: string | null;
  branchLimit?: number;
  deploymentMode?: 'cloud' | 'offline' | 'hybrid';
  licenseExpiresAt?: string | null;
  timeZone?: string;
  _id: string;
  name: string;
  domainType: DomainType;
  logoUrl?: string;
  address?: string;
  taxRegNo?: string;
  currency: string;
  invoicePrefix: string;
  taxProfile: TaxProfile;
  installmentMarkupPercent: number;
  status: 'active' | 'suspended';
  featureFlags: FeatureFlags;
  subscriptionPlanId?: string | null;
  navigationVisibility?: Partial<Record<TenantNavigationKey, boolean>>;
}

export interface InvoicePrintSettings {
  paperSize: 'A4' | 'A5' | 'A6' | 'Receipt' | '80mm' | '58mm' | 'custom';
  orientation: 'portrait' | 'landscape';
  widthMm?: number;
  heightMm?: number;
  stamp?: string;
  watermark?: string;
  logoWatermark?: boolean;
  footerText?: string;
}

export interface UserSummary {
  _id: string;
  tenantId: string;
  name: string;
  email: string;
  phone?: string;
  recoveryEmail?: string;
  emailVerified?: boolean;
  phoneVerified?: boolean;
  role: Role;
  isActive?: boolean;
  isSuperAdmin?: boolean;
  isDeveloper?: boolean;
  /** Modules this account may access; undefined/absent = full access per role. */
  moduleRights?: ModuleRightKey[];
  permissions?: string[];
  branchIds?: string[];
}
export type BillingInterval = 'monthly' | 'yearly' | 'lifetime';

export interface SubscriptionPlan {
  domainType?: DomainType | null;
  _id: string;
  name: string;
  description: string;
  price: number;
  billingInterval: BillingInterval;
  features: FeatureFlags;
  isActive: boolean;
}

/* ─────────────── Business-type role packages (package manager) ─────────────── */

/** Account kinds the owner can create under their business, beyond their own owner account. */
export type ProvisionableRole = 'admin' | 'staff' | 'cashier';

export interface RoleTemplateEntry {
  role: ProvisionableRole;
  title: string;
  description: string;
  moduleRights: ModuleRightKey[];
}

/**
 * Recommended account packages per business domain. The developer provisions the
 * owner account; the owner (or developer) creates admin/staff/cashier accounts
 * according to the business type using these presets.
 */
export const DOMAIN_ROLE_PACKAGES: Record<DomainType, { label: string; icon: string; accounts: RoleTemplateEntry[] }> = {
  restaurant: {
    label: 'Restaurant',
    icon: '🍽️',
    accounts: [
      { role: 'admin', title: 'Manager', description: 'Full back-office: menu (inventory), staff, reports', moduleRights: ['dashboard', 'pos', 'products', 'customers', 'orders', 'settings'] },
      { role: 'staff', title: 'Kitchen / Wait Staff', description: 'Table orders & kitchen display', moduleRights: ['pos', 'orders'] },
      { role: 'cashier', title: 'Cashier', description: 'Billing counter & receipts', moduleRights: ['pos', 'orders', 'customers'] },
    ],
  },
  retail: {
    label: 'Retail Store',
    icon: '🛍️',
    accounts: [
      { role: 'admin', title: 'Store Admin', description: 'Inventory, reports & staff management', moduleRights: ['dashboard', 'pos', 'products', 'customers', 'orders', 'settings', 'barcode-generator'] },
      { role: 'cashier', title: 'Cashier', description: 'Checkout counter & receipts', moduleRights: ['pos', 'orders'] },
    ],
  },
  supermarket: {
    label: 'Supermarket',
    icon: '🏬',
    accounts: [
      { role: 'admin', title: 'Floor Manager', description: 'Stock, pricing & reports', moduleRights: ['dashboard', 'pos', 'products', 'customers', 'orders', 'settings', 'barcode-generator', 'barcode-scanner'] },
      { role: 'staff', title: 'Shelf / Stock Staff', description: 'Barcode scanning & stock lookup', moduleRights: ['pos', 'products', 'barcode-scanner'] },
      { role: 'cashier', title: 'Cashier', description: 'Fast-lane checkout', moduleRights: ['pos', 'orders', 'barcode-scanner'] },
    ],
  },
  grocery: {
    label: 'Grocery',
    icon: '🧺',
    accounts: [
      { role: 'admin', title: 'Store Admin', description: 'Inventory & staff management', moduleRights: ['dashboard', 'pos', 'products', 'customers', 'orders', 'settings'] },
      { role: 'cashier', title: 'Cashier', description: 'Counter billing', moduleRights: ['pos', 'orders'] },
    ],
  },
  pharmacy: {
    label: 'Pharmacy',
    icon: '💊',
    accounts: [
      { role: 'admin', title: 'Pharmacy Manager', description: 'Medicine inventory & compliance reports', moduleRights: ['dashboard', 'pos', 'products', 'customers', 'orders', 'settings', 'barcode-scanner'] },
      { role: 'staff', title: 'Dispensary Staff', description: 'Prescription lookup & dispensing', moduleRights: ['pos', 'products', 'barcode-scanner'] },
      { role: 'cashier', title: 'Cashier', description: 'Counter billing', moduleRights: ['pos', 'orders'] },
    ],
  },
  electronics: {
    label: 'Electronics',
    icon: '🔌',
    accounts: [
      { role: 'admin', title: 'Showroom Admin', description: 'High-value inventory & installment plans', moduleRights: ['dashboard', 'pos', 'products', 'customers', 'installments', 'orders', 'settings', 'barcode-generator'] },
      { role: 'staff', title: 'Sales Staff', description: 'Quotes & installment agreements', moduleRights: ['pos', 'products', 'installments'] },
      { role: 'cashier', title: 'Cashier', description: 'Down-payment collection & receipts', moduleRights: ['pos', 'orders', 'installments'] },
    ],
  },
  salon: {
    label: 'Salon / Spa',
    icon: '💇',
    accounts: [
      { role: 'admin', title: 'Salon Manager', description: 'Services catalog, staff rosters & reports', moduleRights: ['dashboard', 'pos', 'products', 'customers', 'orders', 'settings'] },
      { role: 'cashier', title: 'Receptionist', description: 'Walk-in billing & appointments ledger', moduleRights: ['pos', 'orders', 'customers'] },
    ],
  },
  custom: {
    label: 'Custom Business',
    icon: '🏢',
    accounts: [
      { role: 'admin', title: 'Administrator', description: 'Full management access', moduleRights: ['dashboard', 'pos', 'products', 'customers', 'installments', 'orders', 'settings'] },
      { role: 'staff', title: 'Staff', description: 'General operations access', moduleRights: ['pos', 'orders'] },
      { role: 'cashier', title: 'Cashier', description: 'Counter billing', moduleRights: ['pos', 'orders'] },
    ],
  },
};

/** An account request submitted while provisioning a tenant or from the package manager. */
export interface ProvisionAccountInput {
  role: ProvisionableRole;
  name: string;
  email: string;
  password: string;
  moduleRights?: ModuleRightKey[];
}

export interface ManagedBusiness extends Tenant {
  businessId: string;
  subscriptionPlan?: Pick<SubscriptionPlan, '_id' | 'name' | 'price' | 'billingInterval'> | null;
}

export interface BusinessPlanTarget {
  deploymentMode?: 'cloud' | 'offline' | 'hybrid';
  licenseExpiresAt?: string | null;
  branchLimit?: number;
  businessId: string;
  name: string;
  domainType?: DomainType;
  status?: 'active' | 'suspended';
  currency?: string;
  logoUrl?: string;
  featureFlags?: FeatureFlags;
  subscriptionPlanId: string | null;
  subscriptionPlanName: string | null;
  createdAt?: string;
}

export interface SuperAdminOverview {
  businesses: number;
  activeBusinesses: number;
  suspendedBusinesses: number;
  plans: number;
  auditEvents: number;
}

export interface AdminAuditEntry {
  _id: string;
  actorEmail: string;
  action: string;
  entityType: string;
  entityId: string;
  details: Record<string, unknown>;
  createdAt: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: UserSummary;
}

export interface PinChallengeResponse {
  requiresPin: true;
  challengeToken: string;
  pinRequiresChange: boolean;
}

export type LoginResponse = AuthResponse | PinChallengeResponse;

export type BarcodeFormat = 'CODE128' | 'EAN13' | 'EAN8' | 'UPC' | 'CODE39';

export interface BarcodeToolState {
  format: BarcodeFormat;
  value: string;
  width: number;
  height: number;
  displayValue: boolean;
}

export interface Product {
  _id: string;
  name: string;
  sku?: string;
  barcode?: string;
  category?: string;
  unit: string;
  price: number;
  costPrice: number;
  stockQty: number;
  lowStockThreshold: number;
  trackStock: boolean;
  taxClass: TaxClass;
  attributes: Record<string, string | number | boolean>;
  imageUrl?: string;
  isActive: boolean;
}

export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export interface OrderItemInput {
  productId: string;
  qty: number;
  discountPercent?: number;
  serialNo?: string;
}

export interface OrderLine {
  productId: string;
  name: string;
  qty: number;
  unitPrice: number;
  discountPercent: number;
  discountAmount: number;
  taxPercent: number;
  taxAmount: number;
  lineTotal: number;
}

export interface TaxBreakdownRow {
  ratePercent: number;
  taxableAmount: number;
  taxAmount: number;
}

export interface ChargeAmount {
  label: string;
  amount: number;
}

export interface OrderTotals {
  lines: OrderLine[];
  subtotal: number;
  discountTotal: number;
  taxableTotal: number;
  taxTotal: number;
  charges: ChargeAmount[];
  chargesTotal: number;
  grandTotal: number;
  taxBreakdown: TaxBreakdownRow[];
}

export interface Order {
  _id: string;
  invoiceNo: string;
  cashierName: string;
  items: OrderLine[];
  subtotal: number;
  discountTotal: number;
  taxableTotal: number;
  taxTotal: number;
  charges: ChargeAmount[];
  chargesTotal: number;
  grandTotal: number;
  taxBreakdown: TaxBreakdownRow[];
  paymentMode: PaymentMode;
  customer?: { name?: string; phone?: string };
  note?: string;
  status: OrderStatus;
  invoiceStatus: InvoiceStatus;
  installmentPlanId?: string;
  createdAt: string;
}

export interface SalesSummary {
  days: number;
  revenue: number;
  orders: number;
  tax: number;
  discounts: number;
  daily: { date: string; revenue: number; orders: number }[];
  topProducts: { productId: string; name: string; qty: number; revenue: number }[];
}

// ---------- reports ----------
export interface SalesReport {
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
  revenue: number;
  orders: number;
  tax: number;
  discounts: number;
  itemsSold: number;
  averageOrder: number;
  daily: { date: string; revenue: number; orders: number }[];
  topProducts: { productId: string; name: string; qty: number; revenue: number }[];
  paymentModes: { mode: PaymentMode; orders: number; revenue: number }[];
}

// ---------- customers & installments ----------
export interface Guarantor {
  name?: string;
  phone?: string;
  cnic?: string;
  address?: string;
}

export interface Customer {
  _id: string;
  name: string;
  phone: string;
  cnic?: string;
  address?: string;
  guarantor?: Guarantor;
  notes?: string;
}

export interface InstallmentQuote {
  cashTotal: number;
  downPayment: number;
  markupPercent: number;
  markupAmount: number;
  totalPayable: number;
  financedAmount: number;
  months: number;
  monthlyAmount: number;
  firstDueDate: string;
  schedule: { no: number; dueDate: string; amount: number }[];
}

export interface ScheduleEntry {
  no: number;
  dueDate: string; // YYYY-MM-DD
  amount: number;
  paidAmount: number;
  status: 'pending' | 'partial' | 'paid';
}

export interface PlanPayment {
  receiptNo: string;
  idempotencyKey?: string;
  amount: number;
  paidAt: string;
  mode: 'cash' | 'card' | 'wallet';
  receivedBy: string;
  note?: string;
}

export interface InstallmentPlan {
  _id: string;
  orderId: string;
  invoiceNo: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerCnic?: string;
  customerAddress?: string;
  guarantor?: Guarantor;
  items: { name: string; qty: number; serialNo?: string; unitPrice?: number; discountAmount?: number; taxAmount?: number; lineTotal?: number }[];
  cashTotal: number;
  downPayment: number;
  markupPercent: number;
  markupAmount: number;
  totalPayable: number;
  financedAmount: number;
  months: number;
  monthlyAmount: number;
  firstDueDate: string;
  schedule: ScheduleEntry[];
  payments: PlanPayment[];
  paidTotal: number;
  balance: number;
  status: 'active' | 'completed';
  createdByName: string;
  createdAt: string;
  overdueAmount: number;
  overdueCount: number;
  nextDue: { dueDate: string; amount: number } | null;
}

export interface InstallmentStats {
  activePlans: number;
  outstanding: number;
  overdueAmount: number;
  overduePlans: number;
  collectedToday: number;
}

export interface InstallmentProduct {
  _id: string;
  tenantId: string;
  installmentProductId: string;
  name: string;
  brand?: string;
  model?: string;
  category?: string;
  description?: string;
  imageUrl?: string;
  actualPrice: number;
  defaultCommissionRate: number;
  status: 'active' | 'inactive' | 'archived';
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface InstallmentSale {
  _id: string;
  tenantId: string;
  installmentSaleId: string;
  agreementId: string;
  customerId: string;
  installmentProductId: string;
  saleDate: string;
  actualPrice: number;
  advancePayment: number;
  commissionRate: number;
  commissionAmount: number;
  totalInstallmentPrice: number;
  installmentDuration: number;
  paymentFrequency: 'monthly' | 'weekly' | 'biweekly';
  outstandingBalance: number;
  totalPaid: number;
  saleStatus: 'pending' | 'active' | 'completed' | 'overdue' | 'cancelled';
  schedule: { installmentId: string; dueDate: string; expectedAmount: number; amountPaid: number; remainingAmount: number; status: string }[];
  payments: { paymentId: string; amount: number; mode: 'cash' | 'card' | 'wallet'; paidAt: string; note?: string; receiptNo?: string }[];
  isActive: boolean;
  createdAt?: string;
}

export interface InstallmentDashboardStats {
  totalProducts: number;
  totalSales: number;
  contractValue: number;
  advancePayments: number;
  installmentCollections: number;
  outstandingReceivables: number;
  overdueBalances: number;
  upcomingInstallments: number;
  completedAgreements: number;
}
