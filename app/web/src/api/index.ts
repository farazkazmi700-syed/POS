import type {
  AuthResponse, Customer, Guarantor, InstallmentDashboardStats, InstallmentPlan, InstallmentProduct, InstallmentQuote, InstallmentSale, InstallmentStats, LoginResponse, Order, OrderItemInput,
  OrderTotals, Paginated, PaymentMode, PlanPayment, Product, SalesReport, SalesSummary, TaxClass, TaxProfile, Tenant,
  TenantNavigationKey, UserSummary, AdminAuditEntry, FeatureFlags, ManagedBusiness, SubscriptionPlan,
  SuperAdminOverview, BusinessPlanTarget, DomainType, ModuleRightKey, ProvisionableRole,
} from '@pos/shared-types';
import { api } from './client';

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
  taxClass?: TaxClass;
  attributes?: Record<string, string | number | boolean>;
  imageUrl?: string;
  isActive?: boolean;
}

export type BarcodeFormat = 'CODE128' | 'CODE39' | 'EAN13' | 'EAN8' | 'UPC';
export interface BarcodeInput { format: BarcodeFormat; value?: string; productId?: string; scale: number; height: number; displayValue: boolean }
export interface GeneratedBarcode { format: BarcodeFormat; value: string; svg: string; productId?: string }
export const barcodeApi = {
  generate: (body: BarcodeInput) => api.post<GeneratedBarcode>('/barcodes/generate', body).then((r) => r.data),
  lookup: (value: string, signal?: AbortSignal) => api.get<Product>('/barcodes/lookup', { params: { value }, signal }).then((r) => r.data),
  products: (q: string, signal?: AbortSignal) => api.get<Paginated<Product>>('/barcodes/products', { params: { q: q || undefined, limit: 12 }, signal }).then((r) => r.data),
};

export interface TenantUpdate {
  invoicePrintSettings?: Tenant['invoicePrintSettings'];
  name?: string;
  address?: string;
  taxRegNo?: string;
  currency?: string;
  invoicePrefix?: string;
  logoUrl?: string;
  taxProfile?: TaxProfile;
  installmentMarkupPercent?: number;
  navigationVisibility?: Partial<Record<TenantNavigationKey, boolean>>;
}

export interface CustomerInput {
  name: string;
  phone: string;
  cnic?: string;
  address?: string;
  guarantor?: Guarantor;
  notes?: string;
}

export interface InstallmentTerms {
  customerId: string;
  downPayment: number;
  downPaymentMode?: 'cash' | 'card' | 'wallet';
  months: number;
  markupPercent: number;
  firstDueDate?: string;
}

export const authApi = {
  login: (body: { email: string; password: string }) => api.post<LoginResponse>('/auth/login', body).then((r) => r.data),
  developerLogin: (body: { email: string; password: string }) =>
    api.post<AuthResponse>('/auth/developer/login', body).then((r) => r.data),
  setupDeveloperPassword: (body: { email: string; setupToken: string; password: string }) =>
    api.post<{ email: string; passwordSet: true }>('/auth/developer/setup-password', body).then((r) => r.data),
  register: (body: {
    businessName: string; domainType: string; ownerName: string; email: string; password: string;
    developerEmail: string; developerPassword: string;
    taxRegNo?: string; address?: string;
  }) => api.post<{ registered: true }>('/auth/register', body).then((r) => r.data),
  completePinLogin: (body: { challengeToken: string; pin: string; newPin?: string }) =>
    api.post<AuthResponse>('/auth/login/pin', body).then((r) => r.data),
  requestPinReset: (email: string) => api.post<{ message: string }>('/auth/pin/reset/request', { email }).then((r) => r.data),
  resetPin: (body: { email: string; code: string; newPin: string }) =>
    api.post<{ message: string }>('/auth/pin/reset', body).then((r) => r.data),
  resetPassword: (body: { token: string; newPassword: string }) =>
    api.post<{ message: string }>('/auth/reset-password', body).then((r) => r.data),
  me: () => api.get<UserSummary>('/auth/me').then((r) => r.data),
  changePassword: (currentPassword: string, newPassword: string) =>
    api.post<{ message: string }>('/auth/change-password', { currentPassword, newPassword }).then(r => r.data),
  updateProfile: (body: { name?: string; recoveryEmail?: string | null; phone?: string | null }) =>
    api.patch<UserSummary>('/auth/me', body).then((r) => r.data),
  verifyRecovery: (type: 'email' | 'phone') => api.post<UserSummary | { message: string }>('/auth/me/verify-recovery', { type }).then((r) => r.data),
  confirmRecoveryEmail: (code: string) =>
    api.post<UserSummary>('/auth/me/verify-recovery/confirm', { code }).then((r) => r.data),
  staff: () => api.get<UserSummary[]>('/auth/staff').then((r) => r.data),
  addStaff: (body: { name: string; email: string; password: string; role: 'admin' | 'cashier'; moduleRights?: string[]; branchIds?: string[] }) =>
    api.post<UserSummary>('/auth/staff', body).then((r) => r.data),
  updateStaffRights: (id: string, moduleRights: string[], options?: { permissions?: string[]; branchIds?: string[] }) =>
    api.patch<UserSummary>(`/auth/staff/${id}/rights`, { moduleRights, ...options }).then((r) => r.data),
  updateStaffStatus: (id: string, isActive: boolean) => api.patch<UserSummary>(`/auth/staff/${id}/status`, { isActive }).then((r) => r.data),
};

export const recoveryApi = {
  options: () => api.get<{ email: boolean; whatsapp: boolean }>('/auth/recovery/options').then((r) => r.data),
  request: (body: { email: string; purpose: string; channel: string }) => api.post<{ challengeId: string; message: string; resendAfter: number }>('/auth/recovery/request', body).then((r) => r.data),
  confirm: (body: { challengeId: string; code: string; newSecret: string }) => api.post<{ message: string }>('/auth/recovery/confirm', body).then((r) => r.data),
  requestPhone: (phone: string) => api.post<{ challengeId: string; message: string; resendAfter: number }>('/auth/me/phone/request', { phone }).then((r) => r.data),
  confirmPhone: (body: { challengeId: string; code: string }) => api.post<{ message: string }>('/auth/me/phone/confirm', body).then((r) => r.data),
};

function normalizeTenant(tenant: Tenant): Tenant {
  const visibility = tenant.navigationVisibility as (Tenant['navigationVisibility'] & { barcodeGenerator?: boolean; barcodeScanner?: boolean });
  return { ...tenant, navigationVisibility: { ...visibility, 'barcode-generator': visibility?.barcodeGenerator ?? visibility?.['barcode-generator'], 'barcode-scanner': visibility?.barcodeScanner ?? visibility?.['barcode-scanner'] } };
}

export const tenantApi = {
  get: () => api.get<Tenant>('/tenant/me').then((r) => normalizeTenant(r.data)),
  update: (body: TenantUpdate) => {
    const navigationVisibility = body.navigationVisibility && Object.fromEntries(Object.entries(body.navigationVisibility).map(([key, value]) => [key === 'barcode-generator' ? 'barcodeGenerator' : key === 'barcode-scanner' ? 'barcodeScanner' : key, value]));
    return api.patch<Tenant>('/tenant/me', { ...body, ...(navigationVisibility ? { navigationVisibility } : {}) }).then((r) => normalizeTenant(r.data));
  },
};

export const productApi = {
  list: (params: { q?: string; barcode?: string; category?: string; lowStock?: boolean; includeInactive?: boolean; page?: number; limit?: number }) =>
    api.get<Paginated<Product>>('/products', { params }).then((r) => r.data),
  create: (body: ProductInput) => api.post<Product>('/products', body).then((r) => r.data),
  update: (id: string, body: Partial<ProductInput>) => api.patch<Product>(`/products/${id}`, body).then((r) => r.data),
  remove: (id: string) => api.delete(`/products/${id}`).then((r) => r.data),
};

export const orderApi = {
  preview: (items: OrderItemInput[]) => api.post<OrderTotals>('/orders/preview', { items }).then((r) => r.data),
  create: (body: {
    items: OrderItemInput[]; paymentMode: PaymentMode; customer?: { name?: string; phone?: string };
    idempotencyKey?: string; payments?: { mode: 'cash' | 'card' | 'wallet'; amount: number }[];
    installment?: InstallmentTerms;
  }) =>
    api.post<Order>('/orders', body).then((r) => r.data),
  list: (page = 1, limit = 20) => api.get<Paginated<Order>>('/orders', { params: { page, limit } }).then((r) => r.data),
  void: (id: string) => api.post<Order>(`/orders/${id}/void`).then((r) => r.data),
  refund: (id: string, reason: string) => api.post<Order>(`/orders/${id}/refund`, { reason }).then((r) => r.data),
  summary: (days: number) => api.get<SalesSummary>('/orders/stats/summary', { params: { days } }).then((r) => r.data),
};

export const reportApi = {
  sales: (params: { from: string; to: string }) =>
    api.get<SalesReport>('/reports/sales', { params }).then((r) => r.data),
};

export const invoiceApi = {
  status: (orderId: string) =>
    api.get<{ status: 'pending' | 'ready' | 'failed'; invoiceNo: string }>(`/orders/${orderId}/invoice`).then((r) => r.data),
  regenerate: (orderId: string) => api.post(`/orders/${orderId}/invoice/regenerate`).then((r) => r.data),
  /** Opens the PDF in a new tab. The tab is opened synchronously so popup blockers allow it. */
  async openPdf(orderId: string, fileName: string) {
    const tab = window.open('', '_blank');
    try {
      const res = await api.get<Blob>(`/orders/${orderId}/invoice/pdf`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      if (tab) {
        tab.location.href = url;
      } else {
        const a = document.createElement('a');
        a.href = url;
        a.download = `${fileName}.pdf`;
        a.click();
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      tab?.close();
      throw err;
    }
  },
  async downloadPdf(orderId: string, fileName: string) {
    const res = await api.get<Blob>(`/orders/${orderId}/invoice/pdf`, { responseType: 'blob' });
    const url = URL.createObjectURL(res.data);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${fileName}.pdf`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  },
};

export const customerApi = {
  list: (params: { q?: string; page?: number; limit?: number }) =>
    api.get<Paginated<Customer>>('/customers', { params }).then((r) => r.data),
  create: (body: CustomerInput) => api.post<Customer>('/customers', body).then((r) => r.data),
  update: (id: string, body: Partial<CustomerInput>) => api.patch<Customer>(`/customers/${id}`, body).then((r) => r.data),
};

export const installmentApi = {
  quote: (body: { cashTotal: number; downPayment: number; months: number; markupPercent: number; firstDueDate?: string }) =>
    api.post<InstallmentQuote>('/installments/quote', body).then((r) => r.data),
  list: (params: { filter?: 'active' | 'overdue' | 'completed' | 'all'; q?: string; customerId?: string; page?: number; limit?: number }) =>
    api.get<Paginated<InstallmentPlan>>('/installments', { params }).then((r) => r.data),
  stats: () => api.get<InstallmentStats>('/installments/stats').then((r) => r.data),
  dashboard: () => api.get<InstallmentDashboardStats>('/installments/dashboard').then((r) => r.data),
  get: (id: string) => api.get<InstallmentPlan>(`/installments/${id}`).then((r) => r.data),
  pay: (id: string, body: { amount: number; mode: 'cash' | 'card' | 'wallet'; note?: string; idempotencyKey?: string }) =>
    api.post<{ payment: PlanPayment; plan: InstallmentPlan }>(`/installments/${id}/payments`, body).then((r) => r.data),
};

export const installmentProductApi = {
  list: (params: { q?: string; status?: 'active' | 'inactive' | 'archived'; page?: number; limit?: number }) =>
    api.get<Paginated<InstallmentProduct>>('/installments/products', { params }).then((r) => r.data),
  create: (body: {
    name: string; brand?: string; model?: string; category?: string; description?: string; imageUrl?: string;
    actualPrice: number; defaultCommissionRate: number; status?: 'active' | 'inactive' | 'archived';
  }) => api.post<InstallmentProduct>('/installments/products', body).then((r) => r.data),
  update: (id: string, body: Partial<{
    name: string; brand?: string; model?: string; category?: string; description?: string; imageUrl?: string;
    actualPrice: number; defaultCommissionRate: number; status?: 'active' | 'inactive' | 'archived'; isActive?: boolean;
  }>) => api.patch<InstallmentProduct>(`/installments/products/${id}`, body).then((r) => r.data),
  remove: (id: string) => api.delete(`/installments/products/${id}`).then((r) => r.data),
};

export const installmentSaleApi = {
  dashboard: () => api.get<InstallmentDashboardStats>('/installments/dashboard').then((r) => r.data),
  list: (params: { filter?: 'active' | 'completed' | 'overdue' | 'all'; customerId?: string; q?: string; page?: number; limit?: number }) =>
    api.get<Paginated<InstallmentSale>>('/installments/sales', { params }).then((r) => r.data),
  create: (body: {
    customerId: string; installmentProductId: string; advancePayment: number; advancePaymentMode?: 'cash' | 'card' | 'wallet';
    commissionRate?: number; installmentDuration?: number;
    paymentFrequency?: 'monthly' | 'weekly' | 'biweekly'; saleDate?: string; actualPrice?: number;
  }) => api.post<InstallmentSale>('/installments/sales', body).then((r) => r.data),
  get: (id: string) => api.get<InstallmentSale>(`/installments/sales/${id}`).then((r) => r.data),
  pay: (id: string, body: { amount: number; mode: 'cash' | 'card' | 'wallet'; note?: string; installmentId?: string; idempotencyKey?: string }) =>
    api.post<InstallmentSale>(`/installments/sales/${id}/payments`, body).then((r) => r.data),
};

export const superAdminApi = {
  overview: () => api.get<SuperAdminOverview>('/super-admin/overview').then((r) => r.data),
  businesses: () => api.get<ManagedBusiness[]>('/super-admin/businesses').then((r) => r.data),
  updateBusiness: (id: string, body: { name?: string; status?: 'active' | 'suspended' }) =>
    api.patch<ManagedBusiness>(`/super-admin/businesses/${id}`, body).then((r) => r.data),
  updateFeatures: (id: string, featureFlags: Partial<FeatureFlags>) =>
    api.patch(`/super-admin/businesses/${id}/features`, { featureFlags }).then((r) => r.data),
  audit: (limit = 50) => api.get<AdminAuditEntry[]>('/super-admin/audit', { params: { limit } }).then((r) => r.data),
};

export interface ClientAccountEntry {
  _id: string;
  name: string;
  email: string;
  phone: string | null;
  emailVerified: boolean;
  phoneVerified: boolean;
  role: 'owner' | 'admin' | 'staff' | 'cashier';
  isActive: boolean;
  createdAt: string | null;
  business: { id: string; name: string; domainType: string; status: string } | null;
}
export interface PlatformModuleEntry {
  moduleId?: string;
  universal?: boolean;
  installed?: boolean;
  executable?: boolean;
  version?: string;
  releaseState?: 'active' | 'coming-soon' | 'retired';
  submodules?: { key: string; label: string }[];
  _id?: string;
  key: string;
  label: string;
  description: string;
  builtin: boolean;
  isActive: boolean;
}

export interface RoleTemplateEntry {
  role: ProvisionableRole;
  title: string;
  description: string;
  moduleRights: ModuleRightKey[];
}
export interface DomainRolePackage {
  label: string;
  icon: string;
  accounts: RoleTemplateEntry[];
}
export interface ProvisionAccountInput {
  role: ProvisionableRole;
  name: string;
  email: string;
  password: string;
  moduleRights?: ModuleRightKey[];
}

export const developerApi = {
  rolePackages: () =>
    api.get<Record<DomainType, DomainRolePackage>>('/developer/role-packages').then((r) => r.data),
  modules: () => api.get<PlatformModuleEntry[]>('/developer/modules').then((r) => r.data),
  createModule: (body: { key: string; label: string; description?: string }) =>
    api.post<PlatformModuleEntry>('/developer/modules', body).then((r) => r.data),
  updateModule: (id: string, body: { label?: string; description?: string; isActive?: boolean }) =>
    api.patch<PlatformModuleEntry>(`/developer/modules/${id}`, body).then((r) => r.data),
  deleteModule: (id: string) => api.delete<{ deleted: boolean }>(`/developer/modules/${id}`).then((r) => r.data),
  clients: () => api.get<ClientAccountEntry[]>('/developer/clients').then((r) => r.data),
  resetClientPassword: (businessId: string, accountId: string) =>
    api.post<{ message: string }>(`/developer/clients/${businessId}/${accountId}/password-reset`).then((r) => r.data),
  backupOptions: () => api.get<{ mode: string; email: boolean; drive: boolean; emailTo?: string }>('/developer/backup/options').then(r => r.data),
  deliverBackup: (destination: 'email' | 'drive') => api.post<{ status: string }>('/developer/backup/deliver', { destination }).then(r => r.data),
  backup: () => api.get<{
    meta: { version: number; generatedAt: string; generator: string; counts: { businesses: number; activeBusinesses: number; accounts: number; plans: number; customModules: number; auditEvents: number } };
    tenants: unknown[]; accounts: unknown[]; plans: unknown[]; customModules: unknown[]; auditTail: unknown[];
  }>('/developer/backup').then((r) => r.data),
  provisionAccounts: (id: string, accounts: ProvisionAccountInput[]) =>
    api.post<{ businessId: string; created: { id: string; email: string; role: string }[] }>(`/developer/businesses/${id}/accounts`, { accounts }).then((r) => r.data),
  features: () => api.get<{ key: keyof FeatureFlags; label: string }[]>('/developer/features').then((r) => r.data),
  overview: () => api.get<SuperAdminOverview>('/developer/overview').then((r) => r.data),
  businesses: () => api.get<BusinessPlanTarget[]>('/developer/businesses').then((r) => r.data),
  createBusiness: (body: {
    name: string; domainType: string; ownerName: string; ownerEmail: string; ownerPhone: string; ownerPassword: string;
    address?: string; currency?: string; initialPlanId?: string; accounts?: ProvisionAccountInput[];
  }) => api.post<ManagedBusiness & { seededAccounts?: { email: string; role: string }[] }>('/developer/businesses', body).then((r) => r.data),
  updateBusiness: (id: string, body: { name?: string; status?: 'active' | 'suspended'; deploymentMode?: 'cloud' | 'offline' | 'hybrid'; licenseExpiresAt?: string; branchLimit?: number }) =>
    api.patch<ManagedBusiness>(`/developer/businesses/${id}`, body).then((r) => r.data),
  assignPlan: (id: string, subscriptionPlanId: string) =>
    api.patch<ManagedBusiness>(`/developer/businesses/${id}/plan`, { subscriptionPlanId }).then((r) => r.data),
  updateFeatures: (id: string, featureFlags: Partial<FeatureFlags>) =>
    api.patch<{ businessId: string; featureFlags: FeatureFlags }>(`/developer/businesses/${id}/features`, { featureFlags }).then((r) => r.data),
  plans: () => api.get<SubscriptionPlan[]>('/developer/plans').then((r) => r.data),
  // billingInterval accepts 'lifetime' too (typed loosely on the wire for back-compat)
  createPlan: (body: Omit<SubscriptionPlan, '_id' | 'isActive'>) =>
    api.post<SubscriptionPlan>('/developer/plans', body).then((r) => r.data),
  updatePlan: (id: string, body: Partial<Omit<SubscriptionPlan, '_id'>>) =>
    api.patch<SubscriptionPlan>(`/developer/plans/${id}`, body).then((r) => r.data),
  audit: (limit = 50) => api.get<AdminAuditEntry[]>('/developer/audit', { params: { limit } }).then((r) => r.data),
};

export interface Branch { _id: string; name: string; code: string; address?: string; isActive: boolean; }
export const branchApi = {
  list: () => api.get<Branch[]>('/branches').then((response) => response.data),
  create: (body: { name: string; code: string; address?: string }) => api.post<Branch>('/branches', body).then((response) => response.data),
};
export const auditApi = { list: () => api.get<Paginated<{ _id: string; actorId: string; action: string; resource: string; createdAt: string }>>('/audit', { params: { limit: 30 } }).then((response) => response.data) };
export const stockApi = {
  adjust: (body: { productId: string; delta: number; reason: string; idempotencyKey: string }) => api.post('/stock/adjustments', body).then((response) => response.data),
  movements: () => api.get<Paginated<{ _id: string; productId: string; delta: number; reason: string; status: string }>>('/stock/movements').then((response) => response.data),
};
