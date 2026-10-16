export type Role = 'owner' | 'admin' | 'cashier';
export type FeatureKey = 'pos' | 'inventory' | 'reports' | 'customers' | 'installments';
export type FeatureFlags = Record<FeatureKey, boolean>;
export type DomainType = 'retail' | 'restaurant' | 'pharmacy' | 'salon' | 'custom';
export type TaxClass = 'standard' | 'reduced' | 'exempt';
export type PaymentMode = 'cash' | 'card' | 'wallet' | 'installment';
export type OrderStatus = 'completed' | 'voided';
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
] as const;

export type TenantNavigationKey = (typeof TENANT_NAVIGATION_ITEMS)[number]['key'];

export interface Tenant {
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
}

export interface SubscriptionPlan {
  _id: string;
  name: string;
  description: string;
  price: number;
  billingInterval: 'monthly' | 'yearly';
  features: FeatureFlags;
  isActive: boolean;
}

export interface ManagedBusiness extends Tenant {
  businessId: string;
  subscriptionPlan?: Pick<SubscriptionPlan, '_id' | 'name' | 'price' | 'billingInterval'> | null;
}

export interface BusinessPlanTarget {
  businessId: string;
  name: string;
  domainType?: DomainType;
  status?: 'active' | 'suspended';
  currency?: string;
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

export interface Product {
  _id: string;
  name: string;
  sku?: string;
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
  items: { name: string; qty: number; serialNo?: string }[];
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
