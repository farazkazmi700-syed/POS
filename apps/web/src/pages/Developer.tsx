import { useState, useMemo, type FormEvent, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FeatureKey, SubscriptionPlan, FeatureFlags } from '@pos/shared-types';
import { developerApi, authApi } from '../api';
import { useAuth } from '../store/auth';
import { Link, useNavigate } from 'react-router-dom';
import ThemeToggle from '../components/ThemeToggle';

/* ─────────────── Feature Config ─────────────── */

const featureKeys: FeatureKey[] = ['pos', 'inventory', 'reports', 'customers', 'installments'];
const featureNames: Record<FeatureKey, string> = {
  pos: 'POS',
  inventory: 'Inventory',
  reports: 'Reports',
  customers: 'Customers',
  installments: 'Installments',
};

const featureDescriptions: Record<FeatureKey, string> = {
  pos: 'Point of Sale terminal & checkout',
  inventory: 'Product catalog & stock tracking',
  reports: 'Sales reports & analytics',
  customers: 'Customer ledger & CRM',
  installments: 'Installment plans & schedules',
};

const featureIcons: Record<FeatureKey, string> = {
  pos: '💳',
  inventory: '📦',
  reports: '📊',
  customers: '👥',
  installments: '📅',
};

/* ─────────────── Icon Components ─────────────── */

function IconCode({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
    </svg>
  );
}

function IconBuilding({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    </svg>
  );
}

function IconBadge({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
    </svg>
  );
}

function IconPlus({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
    </svg>
  );
}

function IconRefresh({ className = 'w-5 h-5', spinning = false }: { className?: string; spinning?: boolean }) {
  return (
    <svg className={`${className} ${spinning ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  );
}

function IconSearch({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  );
}

function IconLogout({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
    </svg>
  );
}

function IconClose({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function IconCopy({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
    </svg>
  );
}

function IconCheck({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function IconEye({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  );
}

function IconEyeOff({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
    </svg>
  );
}

/* ─────────────── Reusable UI Atoms ─────────────── */

function StatCard({ label, value, accent }: { label: string; value: ReactNode; accent?: string }) {
  return (
    <div className="dev-stat-card group">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        {label}
      </span>
      <span className={`mt-1 text-2xl font-extrabold ${accent || 'text-slate-900 dark:text-white'}`}>
        {value}
      </span>
    </div>
  );
}

function ModalOverlay({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-md"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="dev-modal w-full max-w-lg overflow-y-auto max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

function Toast({ notification, onDismiss }: { notification: { type: 'success' | 'error'; text: string }; onDismiss: () => void }) {
  return (
    <div
      role="status"
      className={`dev-toast ${notification.type === 'success' ? 'dev-toast-success' : 'dev-toast-error'}`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-lg flex-shrink-0">{notification.type === 'success' ? '✓' : '⚠'}</span>
        <span className="truncate">{notification.text}</span>
      </div>
      <button type="button" onClick={onDismiss} className="ml-3 flex-shrink-0 rounded-md p-0.5 opacity-60 hover:opacity-100 transition">
        <IconClose className="w-4 h-4" />
      </button>
    </div>
  );
}

function EmptyState({ icon, title, subtitle, action }: { icon: string; title: string; subtitle: string; action?: ReactNode }) {
  return (
    <div className="dev-card flex flex-col items-center justify-center py-16 text-center">
      <span className="text-4xl mb-3">{icon}</span>
      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</p>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 max-w-xs">{subtitle}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

function Spinner() {
  return (
    <div className="dev-card flex items-center justify-center py-20 gap-3 text-slate-500 dark:text-slate-400">
      <svg className="h-5 w-5 animate-spin text-teal-600 dark:text-teal-400" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
      </svg>
      <span className="text-sm font-medium">Loading workspace...</span>
    </div>
  );
}

/* ─────────────── Entry Point ─────────────── */

export default function Developer() {
  const user = useAuth((state) => state.user);
  return user?.isDeveloper ? <DeveloperWorkspace /> : <DeveloperLogin />;
}

/* ═══════════════════════════════════════════════
   Developer Login
   ═══════════════════════════════════════════════ */

function DeveloperLogin() {
  const [pin, setPin] = useState('');
  const setSession = useAuth((state) => state.setSession);
  const navigate = useNavigate();
  const login = useMutation({
    mutationFn: () => authApi.developerLogin({ pin }),
    onSuccess: (session) => {
      setSession(session);
      navigate('/developer', { replace: true });
    },
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pin.length === 8) {
      login.mutate();
    }
  };

  return (
    <div className="dev-login-bg">
      {/* Animated background orbs */}
      <div className="dev-login-orb dev-login-orb-1" />
      <div className="dev-login-orb dev-login-orb-2" />
      <div className="dev-login-orb dev-login-orb-3" />

      <div className="relative z-10 w-full max-w-sm px-4">
        <form onSubmit={submit} className="dev-login-card">
          <header className="text-center space-y-3">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-600 text-white shadow-lg shadow-teal-500/30">
              <IconCode className="w-7 h-7" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-teal-600 dark:text-teal-400">
                Kazmi POS Engine
              </p>
              <h1 className="mt-1 text-xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                Developer Portal
              </h1>
            </div>
            <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400 max-w-[260px] mx-auto">
              Enter your 8-digit Developer PIN to access business provisioning & subscription management.
            </p>
          </header>

          <div className="mt-6">
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 text-center mb-2" htmlFor="developer-pin">
              Developer PIN
            </label>
            <input
              id="developer-pin"
              className="dev-pin-input"
              type="password"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              minLength={8}
              maxLength={8}
              pattern="[0-9]{8}"
              placeholder="● ● ● ● ● ● ● ●"
              required
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 8))}
            />
            <div className="mt-2 flex justify-center gap-1.5">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 w-5 rounded-full transition-all duration-200 ${
                    i < pin.length
                      ? 'bg-teal-500 dark:bg-teal-400 scale-110'
                      : 'bg-slate-200 dark:bg-slate-700'
                  }`}
                />
              ))}
            </div>
          </div>

          {login.isError && (
            <div className="mt-4 rounded-xl border border-red-200/80 bg-red-50 px-4 py-3 text-center text-sm font-medium text-red-700 dark:border-red-800/50 dark:bg-red-950/50 dark:text-red-400" role="alert">
              Invalid Developer PIN. Please try again.
            </div>
          )}

          <button
            className="dev-login-btn mt-6"
            type="submit"
            disabled={login.isPending || pin.length !== 8}
          >
            {login.isPending ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Verifying...
              </span>
            ) : (
              'Access Portal'
            )}
          </button>

          <div className="mt-4 text-center">
            <Link
              to="/login"
              className="text-xs font-medium text-slate-500 transition hover:text-teal-600 dark:text-slate-400 dark:hover:text-teal-400"
            >
              ← Return to POS Sign In
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   Developer Workspace
   ═══════════════════════════════════════════════ */

type Tab = 'businesses' | 'plans' | 'create-business';

function DeveloperWorkspace() {
  const client = useQueryClient();
  const user = useAuth((state) => state.user);
  const logout = useAuth((state) => state.logout);
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<Tab>('businesses');
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [businessSearch, setBusinessSearch] = useState('');
  const [editingPlan, setEditingPlan] = useState<SubscriptionPlan | null>(null);
  const [isCreatingPlan, setIsCreatingPlan] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const businesses = useQuery({ queryKey: ['developer', 'businesses'], queryFn: developerApi.businesses });
  const plans = useQuery({ queryKey: ['developer', 'plans'], queryFn: developerApi.plans });

  const refresh = () => {
    client.invalidateQueries({ queryKey: ['developer'] });
  };

  const showToast = (type: 'success' | 'error', text: string) => {
    setNotification({ type, text });
    setTimeout(() => {
      setNotification((prev) => (prev?.text === text ? null : prev));
    }, 5000);
  };

  const createBusiness = useMutation({
    mutationFn: developerApi.createBusiness,
    onSuccess: (business) => {
      showToast('success', `Created business "${business.name}" successfully!`);
      setActiveTab('businesses');
      refresh();
    },
    onError: () => showToast('error', 'Business could not be created. Check that the owner email is unique.'),
  });

  const assignPlan = useMutation({
    mutationFn: ({ id, planId }: { id: string; planId: string }) => developerApi.assignPlan(id, planId),
    onSuccess: () => {
      showToast('success', 'Plan assigned and feature entitlements updated.');
      refresh();
    },
    onError: () => showToast('error', 'Failed to assign plan.'),
  });

  const updateFeatures = useMutation({
    mutationFn: ({ id, featureFlags }: { id: string; featureFlags: Partial<FeatureFlags> }) =>
      developerApi.updateFeatures(id, featureFlags),
    onSuccess: () => {
      showToast('success', 'Business feature entitlement updated.');
      refresh();
    },
    onError: () => showToast('error', 'Failed to update feature access.'),
  });

  const createPlan = useMutation({
    mutationFn: developerApi.createPlan,
    onSuccess: () => {
      showToast('success', 'Subscription plan created successfully.');
      setIsCreatingPlan(false);
      refresh();
    },
    onError: () => showToast('error', 'Plan could not be created. Plan names must be unique.'),
  });

  const updatePlan = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<Omit<SubscriptionPlan, '_id'>> }) =>
      developerApi.updatePlan(id, body),
    onSuccess: () => {
      showToast('success', 'Subscription plan and features updated.');
      setEditingPlan(null);
      refresh();
    },
    onError: () => showToast('error', 'Plan update failed.'),
  });

  const filteredBusinesses = useMemo(() => {
    if (!businesses.data) return [];
    const query = businessSearch.trim().toLowerCase();
    if (!query) return businesses.data;
    return businesses.data.filter(
      (b) =>
        b.name.toLowerCase().includes(query) ||
        b.businessId.toLowerCase().includes(query) ||
        (b.subscriptionPlanName && b.subscriptionPlanName.toLowerCase().includes(query)) ||
        (b.domainType && b.domainType.toLowerCase().includes(query))
    );
  }, [businesses.data, businessSearch]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(text);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const onCreateBusinessSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    createBusiness.mutate({
      name: String(form.get('name')),
      domainType: String(form.get('domainType')),
      ownerName: String(form.get('ownerName')),
      ownerEmail: String(form.get('ownerEmail')),
      ownerPassword: String(form.get('ownerPassword')),
      currency: String(form.get('currency') || 'PKR'),
      address: String(form.get('address') || ''),
    });
  };

  const onCreatePlanSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const features = Object.fromEntries(
      featureKeys.map((key) => [key, form.get(`feature-${key}`) === 'on'])
    ) as Record<FeatureKey, boolean>;

    createPlan.mutate({
      name: String(form.get('name')),
      description: String(form.get('description') || ''),
      price: Number(form.get('price')),
      billingInterval: String(form.get('billingInterval')) as 'monthly' | 'yearly',
      features,
    });
  };

  const onUpdatePlanSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingPlan) return;
    const form = new FormData(event.currentTarget);
    const features = Object.fromEntries(
      featureKeys.map((key) => [key, form.get(`edit-feature-${key}`) === 'on'])
    ) as Record<FeatureKey, boolean>;

    updatePlan.mutate({
      id: editingPlan._id,
      body: {
        name: String(form.get('name')),
        description: String(form.get('description') || ''),
        price: Number(form.get('price')),
        billingInterval: String(form.get('billingInterval')) as 'monthly' | 'yearly',
        features,
        isActive: form.get('isActive') === 'on',
      },
    });
  };

  const isLoading = businesses.isLoading || plans.isLoading;
  const isError = businesses.isError || plans.isError;

  const tabs: { key: Tab; label: string; icon: ReactNode; badge?: number }[] = [
    { key: 'businesses', label: 'Businesses', icon: <IconBuilding className="w-4 h-4" />, badge: businesses.data?.length },
    { key: 'plans', label: 'Plans', icon: <IconBadge className="w-4 h-4" />, badge: plans.data?.length },
    { key: 'create-business', label: 'Provision', icon: <IconPlus className="w-4 h-4" /> },
  ];

  return (
    <div className="dev-workspace">
      {/* ─── Desktop Sidebar ─── */}
      <aside className="dev-sidebar">
        {/* Brand */}
        <div className="flex items-center gap-3 px-2 pt-1">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 text-white shadow-md shadow-teal-500/20">
            <IconCode className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-bold tracking-tight text-slate-900 dark:text-white truncate">Dev Portal</h1>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">Kazmi POS Engine</p>
          </div>
        </div>

        {/* Nav Items */}
        <nav className="mt-6 flex flex-col gap-1 flex-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`dev-nav-item ${activeTab === tab.key ? 'dev-nav-item-active' : ''}`}
            >
              {tab.icon}
              <span>{tab.label}</span>
              {tab.badge !== undefined && (
                <span className="ml-auto rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </nav>

        {/* Sidebar Footer */}
        <div className="space-y-3 border-t border-slate-200/70 pt-3 dark:border-slate-800/70">
          <div className="flex items-center gap-2 px-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-100 text-[11px] font-bold text-teal-700 dark:bg-teal-900/50 dark:text-teal-300">
              {user?.name?.charAt(0)?.toUpperCase() || 'D'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">{user?.name || 'Developer'}</p>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">{user?.email}</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 px-1">
            <ThemeToggle />
            <button
              onClick={refresh}
              type="button"
              className="dev-icon-btn"
              title="Refresh Data"
              aria-label="Refresh Data"
            >
              <IconRefresh className="w-4 h-4" spinning={businesses.isFetching} />
            </button>
            <button
              type="button"
              onClick={() => {
                logout();
                client.clear();
                navigate('/developer', { replace: true });
              }}
              className="dev-icon-btn text-red-500 dark:text-red-400"
              title="Sign Out"
              aria-label="Sign Out"
            >
              <IconLogout className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* ─── Mobile Header ─── */}
      <header className="dev-mobile-header">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 text-white shadow-sm">
            <IconCode className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-slate-900 dark:text-white">Dev Portal</h1>
            <p className="text-[10px] text-slate-500 dark:text-slate-400">Kazmi POS</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            onClick={refresh}
            type="button"
            className="dev-icon-btn"
            title="Refresh"
          >
            <IconRefresh className="w-4 h-4" spinning={businesses.isFetching} />
          </button>
          <button
            type="button"
            onClick={() => {
              logout();
              client.clear();
              navigate('/developer', { replace: true });
            }}
            className="dev-icon-btn text-red-500 dark:text-red-400"
            title="Sign Out"
          >
            <IconLogout className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* ─── Main Content ─── */}
      <main className="dev-main">
        {/* Page Header */}
        <div className="dev-page-header">
          <div>
            <h2 className="text-lg font-extrabold text-slate-900 dark:text-white sm:text-xl">
              {activeTab === 'businesses' && 'Business Management'}
              {activeTab === 'plans' && 'Subscription Plans'}
              {activeTab === 'create-business' && 'Provision Business'}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {activeTab === 'businesses' && 'Manage businesses, assign plans, and toggle feature access'}
              {activeTab === 'plans' && 'Create and manage subscription tiers with feature bundles'}
              {activeTab === 'create-business' && 'Create a new tenant organization with an owner account'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-teal-50 px-2.5 py-1 text-[10px] font-bold text-teal-700 dark:bg-teal-900/40 dark:text-teal-300 ring-1 ring-inset ring-teal-200 dark:ring-teal-800">
              <span className="h-1.5 w-1.5 rounded-full bg-teal-500 animate-pulse" />
              Dev Mode
            </span>
          </div>
        </div>

        {/* Toast */}
        {notification && (
          <div className="px-4 sm:px-6 pt-0 pb-2">
            <Toast notification={notification} onDismiss={() => setNotification(null)} />
          </div>
        )}

        <div className="px-4 sm:px-6 pb-6 sm:pb-8">
          {/* Stats */}
          <section className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Platform Statistics">
            <StatCard label="Total Businesses" value={businesses.data?.length ?? 0} />
            <StatCard label="Active Plans" value={plans.data?.filter((p) => p.isActive).length ?? 0} accent="text-teal-600 dark:text-teal-400" />
            <StatCard label="Assigned" value={businesses.data?.filter((b) => b.subscriptionPlanId).length ?? 0} />
            <StatCard label="Modules" value={`${featureKeys.length} Features`} accent="text-indigo-600 dark:text-indigo-400" />
          </section>

          {/* Loading / Error */}
          {isLoading && <Spinner />}

          {isError && (
            <div className="dev-card border-red-200 dark:border-red-900 bg-red-50/80 dark:bg-red-950/30 text-center py-10">
              <p className="font-semibold text-red-700 dark:text-red-300">Unable to load developer workspace.</p>
              <p className="mt-1 text-xs text-red-500 dark:text-red-400">Make sure your session is active.</p>
              <button type="button" onClick={refresh} className="dev-btn-secondary mt-4 text-xs">
                Retry Connection
              </button>
            </div>
          )}

          {/* ─── TAB: Businesses ─── */}
          {!isLoading && !isError && activeTab === 'businesses' && (
            <section className="space-y-4">
              {/* Toolbar */}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="relative flex-1 max-w-sm">
                  <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="search"
                    placeholder="Search businesses..."
                    className="input w-full pl-9 text-xs"
                    value={businessSearch}
                    onChange={(e) => setBusinessSearch(e.target.value)}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('create-business')}
                  className="dev-btn-primary text-xs whitespace-nowrap"
                >
                  <IconPlus className="w-3.5 h-3.5" />
                  New Business
                </button>
              </div>

              {/* Business Cards (responsive grid instead of table for mobile) */}
              {filteredBusinesses.length > 0 ? (
                <div className="space-y-3">
                  {filteredBusinesses.map((b) => (
                    <div key={b.businessId} className="dev-card dev-card-hover p-0 overflow-hidden">
                      {/* Card Header */}
                      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">{b.name}</h3>
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                b.status === 'suspended'
                                  ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                                  : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                              }`}
                            >
                              <span className={`h-1.5 w-1.5 rounded-full ${b.status === 'suspended' ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                              {b.status === 'suspended' ? 'Suspended' : 'Active'}
                            </span>
                          </div>
                          <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                            <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] dark:bg-slate-800">{b.businessId}</code>
                            <button
                              type="button"
                              onClick={() => copyToClipboard(b.businessId)}
                              className="text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 transition"
                              title="Copy ID"
                            >
                              {copiedId === b.businessId ? <IconCheck className="w-3 h-3 text-emerald-500" /> : <IconCopy className="w-3 h-3" />}
                            </button>
                            {b.domainType && (
                              <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium capitalize dark:bg-slate-800">
                                {b.domainType}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Plan Assignment */}
                        <div className="flex-shrink-0 w-full sm:w-56">
                          <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1 block">
                            Subscription Plan
                          </label>
                          <select
                            className="input text-xs py-1.5"
                            value={b.subscriptionPlanId ?? ''}
                            disabled={assignPlan.isPending}
                            onChange={(e) => {
                              if (e.target.value) {
                                assignPlan.mutate({ id: b.businessId, planId: e.target.value });
                              }
                            }}
                          >
                            <option value="">Choose Plan...</option>
                            {plans.data
                              ?.filter((p) => p.isActive || p._id === b.subscriptionPlanId)
                              .map((p) => (
                                <option key={p._id} value={p._id}>
                                  {p.name} ({p.price} PKR/{p.billingInterval})
                                </option>
                              ))}
                          </select>
                          {b.subscriptionPlanName && (
                            <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
                              Current: <span className="font-bold text-teal-600 dark:text-teal-400">{b.subscriptionPlanName}</span>
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Features Toggle Row */}
                      <div className="border-t border-slate-100 bg-slate-50/50 px-4 py-3 dark:border-slate-800/80 dark:bg-slate-900/30">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">
                          Feature Entitlements
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {featureKeys.map((key) => {
                            const isEnabled = b.featureFlags?.[key] !== false;
                            return (
                              <button
                                key={key}
                                type="button"
                                onClick={() => {
                                  updateFeatures.mutate({
                                    id: b.businessId,
                                    featureFlags: { [key]: !isEnabled },
                                  });
                                }}
                                className={`dev-feature-pill ${isEnabled ? 'dev-feature-pill-on' : 'dev-feature-pill-off'}`}
                                title={`Click to ${isEnabled ? 'disable' : 'enable'} ${featureNames[key]} for ${b.name}`}
                              >
                                <span className="text-xs">{featureIcons[key]}</span>
                                <span>{featureNames[key]}</span>
                                <span className="text-[10px]">{isEnabled ? '✓' : '✕'}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon="🏢"
                  title={businessSearch ? 'No matches found' : 'No businesses yet'}
                  subtitle={businessSearch ? 'Try a different search term.' : 'Provision your first business to get started.'}
                  action={
                    !businessSearch && (
                      <button type="button" onClick={() => setActiveTab('create-business')} className="dev-btn-primary text-xs">
                        <IconPlus className="w-3.5 h-3.5" /> Provision Business
                      </button>
                    )
                  }
                />
              )}
            </section>
          )}

          {/* ─── TAB: Plans ─── */}
          {!isLoading && !isError && activeTab === 'plans' && (
            <section className="space-y-5">
              <div className="flex items-center justify-between">
                <div />
                <button
                  type="button"
                  onClick={() => setIsCreatingPlan(true)}
                  className="dev-btn-primary text-xs"
                >
                  <IconPlus className="w-3.5 h-3.5" />
                  Create Plan
                </button>
              </div>

              {plans.data && plans.data.length > 0 ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {plans.data.map((plan) => (
                    <div
                      key={plan._id}
                      className={`dev-plan-card ${
                        plan.isActive ? '' : 'opacity-60 border-dashed'
                      }`}
                    >
                      {/* Plan Header */}
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div className="min-w-0">
                          <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">{plan.name}</h3>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                            {plan.description || 'No description'}
                          </p>
                        </div>
                        <span
                          className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${
                            plan.isActive
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300'
                              : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                          }`}
                        >
                          {plan.isActive ? 'Active' : 'Archived'}
                        </span>
                      </div>

                      {/* Price */}
                      <div className="flex items-baseline gap-1 mb-4">
                        <span className="text-2xl font-black text-slate-900 dark:text-white">{plan.price}</span>
                        <span className="text-[11px] font-semibold uppercase text-slate-500">PKR / {plan.billingInterval}</span>
                      </div>

                      {/* Features */}
                      <div className="space-y-1.5 border-t border-slate-100 pt-3 dark:border-slate-800/80 mb-4">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Features</p>
                        <div className="grid grid-cols-2 gap-1">
                          {featureKeys.map((key) => {
                            const has = plan.features[key];
                            return (
                              <div
                                key={key}
                                className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium ${
                                  has
                                    ? 'text-emerald-700 dark:text-emerald-300'
                                    : 'text-slate-400 line-through dark:text-slate-600'
                                }`}
                              >
                                <span className="text-[11px]">{has ? '✓' : '·'}</span>
                                <span>{featureNames[key]}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 border-t border-slate-100 pt-3 dark:border-slate-800/80">
                        <button
                          type="button"
                          onClick={() =>
                            updatePlan.mutate({
                              id: plan._id,
                              body: { isActive: !plan.isActive },
                            })
                          }
                          className="dev-btn-secondary flex-1 text-xs justify-center"
                        >
                          {plan.isActive ? 'Archive' : 'Reactivate'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingPlan(plan)}
                          className="dev-btn-primary flex-1 text-xs justify-center"
                        >
                          Edit Plan
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon="📋"
                  title="No plans configured"
                  subtitle="Create your first subscription tier to start assigning businesses."
                  action={
                    <button type="button" onClick={() => setIsCreatingPlan(true)} className="dev-btn-primary text-xs">
                      <IconPlus className="w-3.5 h-3.5" /> Create Plan
                    </button>
                  }
                />
              )}
            </section>
          )}

          {/* ─── TAB: Provision Business ─── */}
          {!isLoading && !isError && activeTab === 'create-business' && (
            <section className="mx-auto max-w-2xl">
              <form onSubmit={onCreateBusinessSubmit} className="dev-card p-5 sm:p-6 space-y-5">
                {/* Business Info */}
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-teal-100 text-xs text-teal-600 dark:bg-teal-900/50 dark:text-teal-400">1</span>
                    Business Details
                  </h3>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <label className="label">Business Name</label>
                      <input className="input" name="name" placeholder="e.g. Kazmi Supermarket" required minLength={2} maxLength={120} />
                    </div>
                    <div>
                      <label className="label">Domain Type</label>
                      <select className="input" name="domainType" defaultValue="retail">
                        {['retail', 'restaurant', 'pharmacy', 'salon', 'custom'].map((d) => (
                          <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="label">Currency</label>
                      <input className="input uppercase" name="currency" placeholder="PKR" defaultValue="PKR" maxLength={3} />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="label">Address <span className="text-slate-400 font-normal normal-case">(optional)</span></label>
                      <input className="input" name="address" placeholder="Street, City, Area" />
                    </div>
                  </div>
                </div>

                {/* Owner Account */}
                <div className="border-t border-slate-200 pt-5 dark:border-slate-800">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-100 text-xs text-indigo-600 dark:bg-indigo-900/50 dark:text-indigo-400">2</span>
                    Owner Account
                  </h3>
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    This account receives initial login credentials with Owner privileges.
                  </p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="label">Owner Name</label>
                      <input className="input" name="ownerName" placeholder="Full Name" required minLength={2} maxLength={80} />
                    </div>
                    <div>
                      <label className="label">Owner Email</label>
                      <input className="input" name="ownerEmail" type="email" placeholder="owner@business.com" required />
                    </div>
                    <div className="sm:col-span-2">
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="label !mb-0">Temporary Password <span className="text-slate-400 font-normal normal-case">(12+ chars)</span></label>
                        <button type="button" onClick={() => setShowPassword(!showPassword)} className="flex items-center gap-1 text-[11px] text-teal-600 hover:underline dark:text-teal-400">
                          {showPassword ? <IconEyeOff className="w-3 h-3" /> : <IconEye className="w-3 h-3" />}
                          {showPassword ? 'Hide' : 'Show'}
                        </button>
                      </div>
                      <input
                        className="input font-mono"
                        name="ownerPassword"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Min. 12 characters"
                        required
                        minLength={12}
                        maxLength={72}
                        autoComplete="new-password"
                      />
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-4 dark:border-slate-800">
                  <button type="button" onClick={() => setActiveTab('businesses')} className="dev-btn-secondary text-xs">
                    Cancel
                  </button>
                  <button className="dev-btn-primary text-xs" type="submit" disabled={createBusiness.isPending}>
                    {createBusiness.isPending ? 'Provisioning...' : 'Provision Business'}
                  </button>
                </div>
              </form>
            </section>
          )}
        </div>
      </main>

      {/* ─── Mobile Bottom Nav ─── */}
      <nav className="dev-bottom-nav" aria-label="Mobile navigation">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`dev-bottom-nav-item ${activeTab === tab.key ? 'dev-bottom-nav-item-active' : ''}`}
          >
            {tab.icon}
            <span className="text-[10px] mt-0.5">{tab.label}</span>
            {tab.badge !== undefined && tab.badge > 0 && (
              <span className="absolute -top-0.5 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-teal-500 text-[8px] font-bold text-white">
                {tab.badge > 99 ? '99+' : tab.badge}
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* ═══ Modal: Create Plan ═══ */}
      {isCreatingPlan && (
        <ModalOverlay onClose={() => setIsCreatingPlan(false)}>
          <div className="flex items-center justify-between border-b border-slate-200 p-4 dark:border-slate-800">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Create Subscription Plan</h3>
            <button type="button" onClick={() => setIsCreatingPlan(false)} className="dev-icon-btn">
              <IconClose className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={onCreatePlanSubmit} className="p-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="label">Plan Name</label>
                <input className="input" name="name" placeholder="e.g. Enterprise Tier" required minLength={2} maxLength={80} />
              </div>
              <div>
                <label className="label">Price (PKR)</label>
                <input className="input" name="price" type="number" min="0" step="0.01" placeholder="4999" required />
              </div>
              <div>
                <label className="label">Billing Interval</label>
                <select className="input" name="billingInterval" defaultValue="monthly">
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="label">Description</label>
                <input className="input" name="description" placeholder="Brief summary of plan benefits" maxLength={500} />
              </div>
            </div>

            <div className="border-t border-slate-200 pt-3 dark:border-slate-800">
              <label className="label">Included Features</label>
              <div className="grid gap-2 sm:grid-cols-2">
                {featureKeys.map((key) => (
                  <label key={key} className="dev-feature-checkbox">
                    <input type="checkbox" name={`feature-${key}`} defaultChecked className="dev-checkbox" />
                    <div>
                      <div className="text-xs font-semibold">{featureIcons[key]} {featureNames[key]}</div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400">{featureDescriptions[key]}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
              <button type="button" onClick={() => setIsCreatingPlan(false)} className="dev-btn-secondary text-xs">
                Cancel
              </button>
              <button type="submit" disabled={createPlan.isPending} className="dev-btn-primary text-xs">
                {createPlan.isPending ? 'Creating...' : 'Create Plan'}
              </button>
            </div>
          </form>
        </ModalOverlay>
      )}

      {/* ═══ Modal: Edit Plan ═══ */}
      {editingPlan && (
        <ModalOverlay onClose={() => setEditingPlan(null)}>
          <div className="flex items-center justify-between border-b border-slate-200 p-4 dark:border-slate-800">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Edit Plan & Features</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">{editingPlan.name}</p>
            </div>
            <button type="button" onClick={() => setEditingPlan(null)} className="dev-icon-btn">
              <IconClose className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={onUpdatePlanSubmit} className="p-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="label">Plan Name</label>
                <input className="input" name="name" defaultValue={editingPlan.name} required minLength={2} maxLength={80} />
              </div>
              <div>
                <label className="label">Price (PKR)</label>
                <input className="input" name="price" type="number" min="0" step="0.01" defaultValue={editingPlan.price} required />
              </div>
              <div>
                <label className="label">Billing Interval</label>
                <select className="input" name="billingInterval" defaultValue={editingPlan.billingInterval}>
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="label">Description</label>
                <input className="input" name="description" defaultValue={editingPlan.description} placeholder="Brief description" maxLength={500} />
              </div>
              <div className="sm:col-span-2 flex items-center gap-2">
                <input type="checkbox" id="edit-is-active" name="isActive" defaultChecked={editingPlan.isActive} className="dev-checkbox" />
                <label htmlFor="edit-is-active" className="text-xs font-semibold cursor-pointer text-slate-700 dark:text-slate-200">
                  Plan is Active (Available for new assignments)
                </label>
              </div>
            </div>

            <div className="border-t border-slate-200 pt-3 dark:border-slate-800">
              <label className="label">Configure Feature Rights</label>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 mb-2">
                Defines the baseline entitlement for businesses on this plan.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {featureKeys.map((key) => (
                  <label key={key} className="dev-feature-checkbox">
                    <input type="checkbox" name={`edit-feature-${key}`} defaultChecked={editingPlan.features[key]} className="dev-checkbox" />
                    <div>
                      <div className="text-xs font-semibold">{featureIcons[key]} {featureNames[key]}</div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400">{featureDescriptions[key]}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
              <button type="button" onClick={() => setEditingPlan(null)} className="dev-btn-secondary text-xs">
                Cancel
              </button>
              <button type="submit" disabled={updatePlan.isPending} className="dev-btn-primary text-xs">
                {updatePlan.isPending ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </ModalOverlay>
      )}
    </div>
  );
}
