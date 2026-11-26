// Version 1.0.0 — Shared API contracts for KazmiOn POS
// Single source of truth for the API contract between frontend, backend, and consumers.

export const API_VERSION = '1.0.0' as const;

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: UserSummary;
  requiresPin?: boolean;
  challengeToken?: string;
  pinRequiresChange?: boolean;
}

export interface RefreshRequest {
  refreshToken: string;
}


export interface Tenant {
  _id: string;
  name: string;
  domainType: 'retail' | 'restaurant' | 'pharmacy' | 'supermarket' | 'grocery' | 'electronics' | 'salon' | 'custom'
    | 'motorcycle-dealer' | 'electric-bike-dealer' | 'mobile-shop' | 'furniture-store'
    | 'home-appliances' | 'solar-equipment' | 'car-dealership' | 'agricultural-machinery';
  currency: string;
  invoicePrefix: string;
  taxProfile: TaxProfile;
  featureFlags: FeatureFlags;
  status: 'active' | 'suspended';
  logoUrl?: string;
  address?: string;
  taxRegNo?: string;
  installmentMarkupPercent: number;
  invoicePrintSettings?: InvoicePrintSettings;
  subscriptionPlanId?: string | null;
  navigationVisibility?: Record<string, boolean>;
  createdAt: string;
  updatedAt: string;
}

export interface TaxProfile {
  gstPercent: number;
  reducedGstPercent: number;
  serviceChargePercent: number;
  otherCharges: ChargeRule[];
}

export interface ChargeRule {
  label: string;
  type: 'flat' | 'percent';
  value: number;
}

export interface InvoicePrintSettings {
  paperSize: 'A4' | 'A5' | 'A6' | '80mm' | '58mm' | 'custom';
  orientation: 'portrait' | 'landscape';
  widthMm: number;
  heightMm: number;
  logoWatermark: boolean;
  stamp?: string;
  watermark?: string;
  footerText?: string;
}

export interface Product {
  _id: string;
  tenantId: string;
  name: string;
  sku?: string;
  barcode?: string;
  category?: string;
  unit?: string;
  price: number;
  costPrice?: number;
  stockQty?: number;
  lowStockThreshold?: number;
  trackStock?: boolean;
  taxClass: 'standard' | 'reduced' | 'exempt';
  attributes: Record<string, string | number | boolean>;
  imageUrl?: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProductInput {
  barcode?: string;
  name: string;
  sku?: string;
  category?: string;
  unit?: string;
  price: number;
  costPrice?: number;
  stockQty?: number;
  lowStockThreshold?: number;
  trackStock?: boolean;
  taxClass?: 'standard' | 'reduced' | 'exempt';
  attributes?: Record<string, string | number | boolean>;
  imageUrl?: string;
  isActive?: boolean;
}

export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export interface Customer {
  _id: string;
  tenantId: string;
  name: string;
  phone: string;
  cnic?: string;
  address?: string;
  notes?: string;
  guarantor?: Guarantor;
  createdAt?: string;
  updatedAt?: string;
}

export interface CustomerInput {
  name: string;
  phone: string;
  cnic?: string;
  address?: string;
  notes?: string;
  guarantor?: Guarantor;
}

export interface Guarantor {
  name: string;
  phone: string;
  cnic?: string;
  address?: string;
}

export interface InstallmentPlan {
  _id: string;
  tenantId: string;
  orderId: string;
  invoiceNo: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerCnic?: string;
  customerAddress?: string;
  guarantor?: Guarantor;
  items: InstallmentPlanItem[];

export interface SalesReport {
  days: number;
  revenue: number;
  orders: number;
  tax: number;
  discounts: number;
  itemsSold: number;
  averageOrder: number;
  daily: SalesDailyEntry[];
  topProducts: SalesTopProduct[];
  paymentModes: PaymentModeEntry[];
  from: string;
  to: string;
}

export interface SalesDailyEntry {
  date: string;
  revenue: number;
  orders: number;
}

export interface SalesTopProduct {
  productId: string;
  name: string;
  qty: number;
  revenue: number;
}

export interface PaymentModeEntry {
  mode: string;
  amount: number;
  count: number;
}

export interface SubscriptionPlan {
  _id: string;
  name: string;
  description: string;
  price: number;
  billingInterval: 'monthly' | 'yearly' | 'lifetime';
  features: FeatureFlags;
  isActive: boolean;
}

export interface ManagedBusiness {
  businessId: string;
  name: string;
  domainType: string;
  status: 'active' | 'suspended';
  subscriptionPlanId?: string | null;
  featureFlags: FeatureFlags;
  currency: string;
}

export interface BusinessPlanTarget extends ManagedBusiness {
  subscriptionPlanName?: string | null;
}

export interface AdminAuditEntry {
  _id: string;
  actorId: string;
  actorEmail: string;
  action: string;
  entityType: string;
  entityId: string;
  details: Record<string, unknown>;
  createdAt: string;
}

export interface SuperAdminOverview {
  businesses: number;
  activeBusinesses: number;
  suspendedBusinesses: number;
  plans: number;
  auditEvents: number;
}

export interface ProvisionAccountInput {
  name: string;
  email: string;
  password: string;
  role: 'cashier' | 'admin';
  moduleRights?: ModuleRightKey[];
  branchIds?: string[];
}

export interface ProvisionableRole {
  role: 'cashier' | 'admin';
  label: string;
  moduleRights: ModuleRightKey[];
}

export interface BackupInfo {
  canExport: boolean;
  format: string;
  consistentSnapshot: boolean;
  includesCredentials: boolean;
  includesFiles: boolean;
  delivery: {
    mode: 'offline' | 'cloud';
    emailLimitBytes: number;
    driveLimitBytes: number;
  };
  included: string[];
  excluded: string[];
}

export interface SupportResponse {
  backup: BackupInfo;
  entitlements: { help: boolean; backup: boolean };
}

export interface HealthResponse {
  status: string;
  database: string;
  time: string;
  uptimeSeconds: number;
}
  cashTotal: number;
  downPayment: number;
  markupPercent: number;
  markupAmount: number;
  totalPayable: number;
  financedAmount: number;
  months: number;
  monthlyAmount: number;
  firstDueDate: string;
  schedule: InstallmentScheduleEntry[];
  payments: InstallmentPayment[];
  paidTotal: number;
  balance: number;
  status: 'active' | 'completed';
  createdByName: string;
  createdAt: string;
  updatedAt?: string;
  overdueAmount: number;
  overdueCount: number;
  nextDue: { dueDate: string; amount: number } | null;
}

export interface InstallmentPlanItem {
  name: string;
  qty: number;
  serialNo?: string;
  unitPrice?: number;
  discountAmount?: number;
  taxAmount?: number;
  lineTotal?: number;
}

export interface InstallmentScheduleEntry {
  no: number;
  dueDate: string;
  amount: number;
  paidAmount: number;
  status: 'pending' | 'partial' | 'paid';
}

export interface InstallmentPayment {
  receiptNo: string;
  idempotencyKey?: string;
  amount: number;
  paidAt: string;
  mode: 'cash' | 'card' | 'wallet';
  receivedBy: string;
  note?: string;
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
  schedule: InstallmentSaleScheduleEntry[];
  payments: InstallmentSalePayment[];
  isActive: boolean;
  createdAt?: string;
}

export interface InstallmentSaleScheduleEntry {
  installmentId: string;
  dueDate: string;
  expectedAmount: number;
  amountPaid: number;
  remainingAmount: number;
  status: string;
}

export interface InstallmentSalePayment {
  paymentId: string;
  amount: number;
  mode: 'cash' | 'card' | 'wallet';
  paidAt: string;
  note?: string;
  receiptNo?: string;
}

export interface InstallmentStats {
  activePlans: number;
  outstanding: number;
  overdueAmount: number;
  overduePlans: number;
  collectedToday: number;
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

export interface Order {
  _id: string;
  tenantId: string;
  invoiceNo: string;
  paymentMode: 'cash' | 'card' | 'wallet' | 'installment' | 'mixed';
  status: 'completed' | 'voided' | 'refunded';
  cashierId?: string;
  cashierName: string;
  customerId?: string;
  subtotal: number;
  discountTotal: number;
  taxableTotal: number;
  taxTotal: number;
  chargesTotal: number;
  grandTotal: number;
  taxBreakdown: TaxBreakdownEntry[];
  charges: ChargeEntry[];
  invoiceStatus: 'pending' | 'ready' | 'failed';
  invoicePdfPath?: string;
  items: OrderItem[];
  createdAt: string;
  updatedAt: string;
}

export interface OrderItem {
  productId: string;
  name: string;
  serialNo?: string;
  qty: number;
  unitPrice: number;
  discountPercent: number;
  discountAmount: number;
  taxPercent: number;
  taxAmount: number;
  lineTotal: number;
}

export interface TaxBreakdownEntry {
  ratePercent: number;
  taxableAmount: number;
  taxAmount: number;
}

export interface ChargeEntry {
  label: string;
  amount: number;
}

export interface CreateOrderRequest {
  items: OrderItemInput[];
  paymentMode: 'cash' | 'card' | 'wallet' | 'installment' | 'mixed';
  customerId?: string;
  idempotencyKey?: string;
}

export interface OrderItemInput {
  productId: string;
  qty: number;
  discountPercent?: number;
  serialNo?: string;
}

export interface PreviewOrderRequest {
  items: OrderItemInput[];
}

export interface OrderTotals {
  subtotal: number;
  discountTotal: number;
  taxableTotal: number;
  taxTotal: number;
  chargesTotal: number;
  grandTotal: number;
  taxBreakdown: TaxBreakdownEntry[];
}

export type FeatureKey = 'pos' | 'inventory' | 'reports' | 'customers' | 'installments' | 'barcodes' | 'data-sync' | 'stock-replenishment' | 'collections-forecast';
export interface FeatureFlags {
  pos: boolean;
  inventory: boolean;
  reports: boolean;
  customers: boolean;
  installments: boolean;
  barcodes: boolean;
  'data-sync'?: boolean;
  'stock-replenishment'?: boolean;
  'collections-forecast'?: boolean;
}

export type ModuleRightKey =
  | 'dashboard' | 'pos' | 'products' | 'customers' | 'installments'
  | 'orders' | 'settings' | 'barcode-generator' | 'barcode-scanner';
export interface UserSummary {
  _id: string;
  tenantId: string;
  name: string;
  email: string;
  role: 'owner' | 'admin' | 'cashier';
  isActive: boolean;
  isSuperAdmin?: boolean;
  isDeveloper?: boolean;
  moduleRights?: string[];
  permissions?: string[];
  branchIds?: string[];
}