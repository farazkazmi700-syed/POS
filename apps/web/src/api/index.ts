import type {
  AuthResponse, Customer, Guarantor, InstallmentPlan, InstallmentQuote, InstallmentStats, LoginResponse, Order, OrderItemInput,
  OrderTotals, Paginated, PaymentMode, PlanPayment, Product, SalesSummary, TaxClass, TaxProfile, Tenant,
  TenantNavigationKey, UserSummary, AdminAuditEntry, FeatureFlags, ManagedBusiness, SubscriptionPlan,
  SuperAdminOverview, BusinessPlanTarget,
} from '@pos/shared-types';
import { api } from './client';

export interface ProductInput {
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

export interface TenantUpdate {
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
  developerLogin: (body: { pin: string; email?: string }) =>
    api.post<AuthResponse>('/auth/developer/login', body).then((r) => r.data),
  setupDeveloperPin: (body: { email: string; setupToken: string }) =>
    api.post<{ email: string; pin: string }>('/auth/developer/setup-pin', body).then((r) => r.data),
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
  me: () => api.get<UserSummary>('/auth/me').then((r) => r.data),
  updateProfile: (body: { name?: string; recoveryEmail?: string; phone?: string }) =>
    api.patch<UserSummary>('/auth/me', body).then((r) => r.data),
  verifyRecovery: (type: 'email' | 'phone') => api.post<UserSummary | { message: string }>('/auth/me/verify-recovery', { type }).then((r) => r.data),
  confirmRecoveryEmail: (code: string) =>
    api.post<UserSummary>('/auth/me/verify-recovery/confirm', { code }).then((r) => r.data),
  staff: () => api.get<UserSummary[]>('/auth/staff').then((r) => r.data),
  addStaff: (body: { name: string; email: string; password: string; role: 'admin' | 'cashier' }) =>
    api.post<UserSummary>('/auth/staff', body).then((r) => r.data),
};

export const tenantApi = {
  get: () => api.get<Tenant>('/tenant/me').then((r) => r.data),
  update: (body: TenantUpdate) => api.patch<Tenant>('/tenant/me', body).then((r) => r.data),
};

export const productApi = {
  list: (params: { q?: string; category?: string; lowStock?: boolean; includeInactive?: boolean; page?: number; limit?: number }) =>
    api.get<Paginated<Product>>('/products', { params }).then((r) => r.data),
  create: (body: ProductInput) => api.post<Product>('/products', body).then((r) => r.data),
  update: (id: string, body: Partial<ProductInput>) => api.patch<Product>(`/products/${id}`, body).then((r) => r.data),
  remove: (id: string) => api.delete(`/products/${id}`).then((r) => r.data),
};

export const orderApi = {
  preview: (items: OrderItemInput[]) => api.post<OrderTotals>('/orders/preview', { items }).then((r) => r.data),
  create: (body: {
    items: OrderItemInput[]; paymentMode: PaymentMode; customer?: { name?: string; phone?: string };
    installment?: InstallmentTerms;
  }) =>
    api.post<Order>('/orders', body).then((r) => r.data),
  list: (page = 1, limit = 20) => api.get<Paginated<Order>>('/orders', { params: { page, limit } }).then((r) => r.data),
  void: (id: string) => api.post<Order>(`/orders/${id}/void`).then((r) => r.data),
  summary: (days: number) => api.get<SalesSummary>('/orders/stats/summary', { params: { days } }).then((r) => r.data),
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
  get: (id: string) => api.get<InstallmentPlan>(`/installments/${id}`).then((r) => r.data),
  pay: (id: string, body: { amount: number; mode: 'cash' | 'card' | 'wallet'; note?: string; idempotencyKey?: string }) =>
    api.post<{ payment: PlanPayment; plan: InstallmentPlan }>(`/installments/${id}/payments`, body).then((r) => r.data),
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

export const developerApi = {
  businesses: () => api.get<BusinessPlanTarget[]>('/developer/businesses').then((r) => r.data),
  createBusiness: (body: {
    name: string; domainType: string; ownerName: string; ownerEmail: string; ownerPassword: string;
    address?: string; currency?: string;
  }) => api.post<ManagedBusiness>('/developer/businesses', body).then((r) => r.data),
  assignPlan: (id: string, subscriptionPlanId: string) =>
    api.patch<ManagedBusiness>(`/developer/businesses/${id}/plan`, { subscriptionPlanId }).then((r) => r.data),
  updateFeatures: (id: string, featureFlags: Partial<FeatureFlags>) =>
    api.patch<{ businessId: string; featureFlags: FeatureFlags }>(`/developer/businesses/${id}/features`, { featureFlags }).then((r) => r.data),
  plans: () => api.get<SubscriptionPlan[]>('/developer/plans').then((r) => r.data),
  createPlan: (body: Omit<SubscriptionPlan, '_id' | 'isActive'>) =>
    api.post<SubscriptionPlan>('/developer/plans', body).then((r) => r.data),
  updatePlan: (id: string, body: Partial<Omit<SubscriptionPlan, '_id'>>) =>
    api.patch<SubscriptionPlan>(`/developer/plans/${id}`, body).then((r) => r.data),
};
