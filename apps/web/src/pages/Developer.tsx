import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FeatureKey, SubscriptionPlan, FeatureFlags, BusinessPlanTarget } from '@pos/shared-types';
import { developerApi, authApi } from '../api';
import { useAuth } from '../store/auth';
import { Link, useNavigate } from 'react-router-dom';
import ThemeToggle from '../components/ThemeToggle';
import { errorMessage } from '../utils/errors';
import { formatMoney } from '../utils/money';
import { fmtDateTime } from '../utils/dates';

/* ─────────────── Feature Config ─────────────── */

const featureKeys: FeatureKey[] = ['pos', 'inventory', 'reports', 'customers', 'installments', 'barcodes'];
const featureNames: Record<FeatureKey, string> = {
  pos: 'POS',
  inventory: 'Inventory',
  reports: 'Reports',
  customers: 'Customers',
  installments: 'Installments',
  barcodes: 'Barcode Studio',
};

const featureDescriptions: Record<FeatureKey, string> = {
  pos: 'Point of Sale terminal & checkout',
  inventory: 'Product catalog & stock tracking',
  reports: 'Sales reports & analytics',
  customers: 'Customer ledger & CRM',
  installments: 'Installment plans & schedules',
  barcodes: 'Barcode generator & camera scanner',
};

/* Feature vector icons */
const featureIcons: Record<FeatureKey, (props: { className?: string }) => ReactNode> = {
  pos: ({ className = 'w-4 h-4' }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
    </svg>
  ),
  inventory: ({ className = 'w-4 h-4' }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10.5 7.5V6a2.25 2.25 0 012.25-2.25h0A2.25 2.25 0 0115 6v1.5m0 0h-4.5M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
    </svg>
  ),
  reports: ({ className = 'w-4 h-4' }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
    </svg>
  ),
  customers: ({ className = 'w-4 h-4' }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
    </svg>
  ),
  installments: ({ className = 'w-4 h-4' }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
    </svg>
  ),
  barcodes: ({ className = 'w-4 h-4' }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 5.25v13.5M6.75 5.25v13.5M9.75 5.25v13.5M13.5 5.25v13.5M17.25 5.25v13.5M20.25 5.25v13.5" />
    </svg>
  ),
};

/* ─────────────── Vector Icons ─────────────── */

function IconCode({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
    </svg>
  );
}

function IconBuilding({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
    </svg>
  );
}

function IconBadge({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
    </svg>
  );
}

function IconPlus({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  );
}

function IconRefresh({ className = 'w-5 h-5', spinning = false }: { className?: string; spinning?: boolean }) {
  return (
    <svg className={`${className} ${spinning ? 'spinning' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
    </svg>
  );
}

function IconSearch({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
    </svg>
  );
}

function IconLogout({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
    </svg>
  );
}

function IconClose({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function IconCopy({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
    </svg>
  );
}

function IconCheck({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}

function IconMinus({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
    </svg>
  );
}

function IconEye({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function IconEyeOff({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243" />
    </svg>
  );
}

function IconShieldCheck({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
    </svg>
  );
}

function IconAlert({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0 3.75h.008v.008H12v-.008zM21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function IconArrowLeft({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
    </svg>
  );
}

function IconLock({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
    </svg>
  );
}

function IconCube({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
    </svg>
  );
}

function IconClock({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function IconActivity({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
    </svg>
  );
}

function IconSettings({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.188.698.29 1.094.29.606 0 1.172-.24 1.586-.679l.83-.832c.312-.312.817-.312 1.13 0l1.832 1.833c.313.312.313.817 0 1.13l-.832.829c-.44.414-.68.98-.68 1.586 0 .395.101.77.29 1.094.043.073.086.146.126.22.185.331.486.582.86.645l1.282.213c.54.09.939.56.939 1.109v2.594c0 .55-.398 1.02-.94 1.11l-1.281.213c-.374.063-.686.313-.87.645-.04.074-.083.147-.127.22-.188.324-.29.698-.29 1.094 0 .606.24 1.172.679 1.586l.83.83c.313.312.313.817 0 1.13l-1.833 1.833c-.312.312-.817.312-1.13 0l-.83-.832c-.414-.44-.98-.68-1.586-.68-.395 0-.77.102-1.094.29-.073.04-.146.086-.22.126-.331.185-.582.486-.645.86l-.213 1.281c-.09.541-.56.939-1.11.939h-2.593c-.55 0-1.02-.398-1.11-.94l-.213-1.28c-.063-.375-.313-.687-.645-.87-.074-.04-.147-.083-.22-.127-.324-.188-.698-.29-1.094-.29-.606 0-1.172.24-1.586.679l-.83.83c-.312.313-.817.313-1.13 0L4.51 19.49c-.313-.312-.313-.817 0-1.13l.83-.83c.44-.414.68-.98.68-1.586 0-.395-.102-.77-.29-1.094-.04-.073-.086-.146-.126-.22-.185-.331-.486-.582-.86-.645l-1.281-.213c-.541-.09-.939-.56-.939-1.11v-2.593c0-.55.398-1.02.94-1.11l1.28-.213c.375-.063.687-.313.87-.645.04-.074.083-.147.127-.22.188-.324.29-.698.29-1.094 0-.606-.24-1.172-.679-1.586l-.83-.83c-.313-.312-.313-.817 0-1.13L4.51 4.51c.312-.313.817-.313 1.13 0l.83.83c.414.44.98.68 1.586.68.395 0 .77-.102 1.094-.29.073-.04.146-.086.22-.126.331-.185.582-.486.645-.86l.213-1.28z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function IconEdit({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
    </svg>
  );
}

function IconKey({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
    </svg>
  );
}

/* ─────────────── Reusable UI Atoms ─────────────── */

function StatCard({
  icon,
  label,
  value,
  hint,
  tone = 'default',
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: 'default' | 'accent' | 'success' | 'warning';
}) {
  return (
    <div className="dev-stat-card group">
      <div className="flex items-start justify-between gap-2">
        <span className="dev-stat-label">{label}</span>
        <span className={`dev-stat-icon tone-${tone}`}>{icon}</span>
      </div>
      <div className="mt-2">
        <span className="dev-stat-value">{value}</span>
        {hint && <p className="dev-stat-hint">{hint}</p>}
      </div>
    </div>
  );
}

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`dev-skeleton ${className}`} aria-hidden="true" />;
}

function WorkspaceSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading workspace data">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="dev-stat-card">
            <div className="flex items-start justify-between">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-8 w-8 !rounded-lg" />
            </div>
            <Skeleton className="mt-3 h-7 w-16" />
          </div>
        ))}
      </div>
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="dev-card p-4 space-y-3">
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 !rounded-xl" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-60" />
              </div>
            </div>
            <Skeleton className="h-8 w-full !rounded-lg" />
          </div>
        ))}
      </div>
      <span className="sr-only">Loading workspace…</span>
    </div>
  );
}

function ModalOverlay({ children, onClose, labelledBy }: { children: ReactNode; onClose: () => void; labelledBy?: string }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return (
    <div
      className="dev-modal-backdrop"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="dev-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

function ModalHeader({ title, subtitle, titleId, onClose }: { title: string; subtitle?: string; titleId?: string; onClose: () => void }) {
  return (
    <div className="dev-modal-head">
      <div className="min-w-0">
        <h3 id={titleId} className="text-[15px] font-bold tracking-tight text-slate-900 dark:text-white">
          {title}
        </h3>
        {subtitle && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>}
      </div>
      <button type="button" onClick={onClose} className="dev-icon-btn" aria-label="Close dialog" title="Close (Esc)">
        <IconClose className="w-4 h-4" />
      </button>
    </div>
  );
}

function Toast({ notification, onDismiss }: { notification: { type: 'success' | 'error'; text: string }; onDismiss: () => void }) {
  return (
    <div
      role={notification.type === 'error' ? 'alert' : 'status'}
      aria-live={notification.type === 'error' ? 'assertive' : 'polite'}
      className={`dev-toast ${notification.type === 'success' ? 'dev-toast-success' : 'dev-toast-error'}`}
    >
      <span className="dev-toast-icon">
        {notification.type === 'success' ? <IconCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> : <IconAlert className="w-4 h-4 text-red-600 dark:text-red-400" />}
      </span>
      <span className="min-w-0 flex-1 truncate">{notification.text}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss notification"
        className="dev-toast-dismiss"
      >
        <IconClose className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function EmptyState({ icon, title, subtitle, action }: { icon: ReactNode; title: string; subtitle: string; action?: ReactNode }) {
  return (
    <div className="dev-card dev-empty-state">
      <span className="dev-empty-icon">{icon}</span>
      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</p>
      <p className="mt-1 max-w-sm text-xs leading-relaxed text-slate-500 dark:text-slate-400">{subtitle}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

function StatusBadge({ status }: { status?: 'active' | 'suspended' }) {
  const suspended = status === 'suspended';
  return (
    <span className={`dev-status-badge ${suspended ? 'is-suspended' : 'is-active'}`}>
      <span className="dev-status-dot" />
      {suspended ? 'Suspended' : 'Active'}
    </span>
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
  const [showPin, setShowPin] = useState(false);
  const [showSetupModal, setShowSetupModal] = useState(false);
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
    if (pin.length === 8 && !login.isPending) {
      login.mutate();
    }
  };

  const fillDemoPin = () => {
    setPin('52909063');
  };

  return (
    <div className="dev-login-bg">
      {/* Ambient glowing orbs */}
      <div className="dev-login-orb dev-login-orb-1" />
      <div className="dev-login-orb dev-login-orb-2" />
      <div className="dev-login-orb dev-login-orb-3" />

      <div className="absolute right-4 top-4 z-10 sm:right-6 sm:top-6">
        <ThemeToggle />
      </div>

      <div className="relative z-10 w-full max-w-sm px-4">
        <form onSubmit={submit} className="dev-login-card" noValidate={false}>
          <header className="space-y-3 text-center">
            <div className="dev-brand-mark mx-auto">
              <IconCode className="w-7 h-7" />
            </div>
            <div>
              <p className="dev-eyebrow justify-center">Kazmi POS Engine</p>
              <h1 className="mt-1.5 text-xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                Developer Engine
              </h1>
            </div>
            <p className="mx-auto max-w-[280px] text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              Enter your 8-digit Developer PIN to manage businesses, subscriptions, and platform APIs.
            </p>
          </header>

          <div className="mt-7">
            <div className="mb-2 flex items-center justify-between">
              <label
                className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400"
                htmlFor="developer-pin"
              >
                Developer PIN
              </label>
              <button
                type="button"
                onClick={() => setShowPin((v) => !v)}
                className="dev-link-btn"
                aria-label={showPin ? 'Hide PIN' : 'Show PIN'}
              >
                {showPin ? <IconEyeOff className="w-3.5 h-3.5" /> : <IconEye className="w-3.5 h-3.5" />}
                {showPin ? 'Hide' : 'Show'}
              </button>
            </div>
            <input
              id="developer-pin"
              className="dev-pin-input"
              type={showPin ? 'text' : 'password'}
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              minLength={8}
              maxLength={8}
              pattern="[0-9]{8}"
              placeholder="••••••••"
              required
              aria-describedby="developer-pin-hint"
              value={pin}
              onChange={(event) => {
                setPin(event.target.value.replace(/\D/g, '').slice(0, 8));
                if (login.isError) login.reset();
              }}
            />
            <div className="mt-2.5 flex justify-center gap-1.5" aria-hidden="true">
              {Array.from({ length: 8 }).map((_, i) => (
                <span
                  key={i}
                  className={`dev-pin-dot ${i < pin.length ? 'is-filled' : ''}`}
                />
              ))}
            </div>

            <div className="mt-3 flex items-center justify-between text-[11px]">
              <span id="developer-pin-hint" className="text-slate-400 dark:text-slate-500">
                {pin.length === 8 ? 'PIN ready to verify' : `${8 - pin.length} digit${8 - pin.length === 1 ? '' : 's'} left`}
              </span>
              <button
                type="button"
                onClick={fillDemoPin}
                className="dev-link-btn !px-1.5 !py-0.5 text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded"
                title="Quickly fill default PIN 52909063"
              >
                Quick PIN: 52909063
              </button>
            </div>
          </div>

          {login.isError && (
            <div className="dev-inline-alert" role="alert">
              <IconAlert className="w-4 h-4 flex-shrink-0" />
              <span>{errorMessage(login.error)}</span>
            </div>
          )}

          <button className="dev-login-btn mt-6" type="submit" disabled={login.isPending || pin.length !== 8}>
            {login.isPending ? (
              <span className="flex items-center justify-center gap-2">
                <IconRefresh className="w-4 h-4 spinning" />
                Verifying…
              </span>
            ) : (
              'Access Developer Engine'
            )}
          </button>

          <div className="mt-4 flex items-center justify-between text-xs">
            <button
              type="button"
              onClick={() => setShowSetupModal(true)}
              className="dev-link-btn"
            >
              <IconKey className="w-3.5 h-3.5" />
              Setup / Reset PIN
            </button>
            <Link to="/login" className="dev-link-btn">
              <IconArrowLeft className="w-3.5 h-3.5" />
              POS Sign In
            </Link>
          </div>

          <p className="dev-secure-note">
            <IconLock className="w-3.5 h-3.5" />
            Confined to Developer Engine APIs with audit logging.
          </p>
        </form>
      </div>

      {/* Developer Setup Modal */}
      {showSetupModal && (
        <DeveloperSetupModal onClose={() => setShowSetupModal(false)} />
      )}
    </div>
  );
}

/* ─────────────── Developer Setup Modal ─────────────── */

function DeveloperSetupModal({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState('');
  const [setupToken, setSetupToken] = useState('');
  const setup = useMutation({ mutationFn: authApi.setupDeveloperPin });

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setup.mutate({ email, setupToken }, { onSuccess: () => setSetupToken('') });
  };

  return (
    <ModalOverlay onClose={onClose} labelledBy="setup-modal-title">
      <ModalHeader
        titleId="setup-modal-title"
        title="Developer PIN Setup"
        subtitle="Authorize or reset developer access using your server setup token."
        onClose={onClose}
      />
      <div className="dev-modal-body">
        {setup.data ? (
          <div className="space-y-4 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-300">
              <IconCheck className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">Developer PIN Generated</h4>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Created for <strong>{setup.data.email}</strong>. Copy and store this PIN securely:
              </p>
            </div>
            <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 font-mono text-2xl font-bold tracking-widest text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100">
              {setup.data.pin}
            </div>
            <button type="button" onClick={onClose} className="dev-btn-primary w-full text-xs">
              Return to Login
            </button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-3">
            <div>
              <label className="label" htmlFor="setup-email">Configured Developer Email</label>
              <input
                id="setup-email"
                type="email"
                required
                className="input text-xs"
                placeholder="developer@pos.local"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor="setup-token">One-Time Setup Token</label>
              <input
                id="setup-token"
                type="password"
                required
                minLength={32}
                className="input text-xs font-mono"
                placeholder="Paste server setup token"
                value={setupToken}
                onChange={(e) => setSetupToken(e.target.value)}
              />
              <p className="mt-1 text-[11px] text-slate-400">Default fallback PIN in development is <code>52909063</code>.</p>
            </div>
            {setup.isError && (
              <div className="dev-inline-alert" role="alert">
                <IconAlert className="w-4 h-4 flex-shrink-0" />
                <span>{errorMessage(setup.error)}</span>
              </div>
            )}
            <div className="dev-modal-foot">
              <button type="button" onClick={onClose} className="dev-btn-secondary text-xs">
                Cancel
              </button>
              <button type="submit" disabled={setup.isPending} className="dev-btn-primary text-xs">
                {setup.isPending ? 'Generating…' : 'Generate PIN'}
              </button>
            </div>
          </form>
        )}
      </div>
    </ModalOverlay>
  );
}

/* ═══════════════════════════════════════════════
   Developer Workspace
   ═══════════════════════════════════════════════ */

type Tab = 'overview' | 'businesses' | 'plans' | 'create-business' | 'audit' | 'settings';

function DeveloperWorkspace() {
  const client = useQueryClient();
  const user = useAuth((state) => state.user);
  const logout = useAuth((state) => state.logout);
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [businessSearch, setBusinessSearch] = useState('');
  const [businessFilter, setBusinessFilter] = useState<'all' | 'active' | 'suspended' | 'has-plan' | 'no-plan'>('all');
  const [editingPlan, setEditingPlan] = useState<SubscriptionPlan | null>(null);
  const [isCreatingPlan, setIsCreatingPlan] = useState(false);
  const [inspectingBusiness, setInspectingBusiness] = useState<BusinessPlanTarget | null>(null);
  const [renamingBusiness, setRenamingBusiness] = useState<BusinessPlanTarget | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [generatedPassword, setGeneratedPassword] = useState('');

  /* Data Queries */
  const overview = useQuery({ queryKey: ['developer', 'overview'], queryFn: developerApi.overview });
  const businesses = useQuery({ queryKey: ['developer', 'businesses'], queryFn: developerApi.businesses });
  const plans = useQuery({ queryKey: ['developer', 'plans'], queryFn: developerApi.plans });
  const auditLogs = useQuery({
    queryKey: ['developer', 'audit'],
    queryFn: () => developerApi.audit(50),
    enabled: activeTab === 'audit' || activeTab === 'overview',
  });

  const refresh = () => {
    client.invalidateQueries({ queryKey: ['developer'] });
  };

  const showToast = (type: 'success' | 'error', text: string) => {
    setNotification({ type, text });
    setTimeout(() => {
      setNotification((prev) => (prev?.text === text ? null : prev));
    }, 5000);
  };

  /* Mutations */
  const createBusiness = useMutation({
    mutationFn: developerApi.createBusiness,
    onSuccess: (business) => {
      showToast('success', `Business “${business.name}” provisioned successfully.`);
      setActiveTab('businesses');
      refresh();
    },
    onError: (error) => showToast('error', errorMessage(error)),
  });

  const updateBusiness = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { name?: string; status?: 'active' | 'suspended' } }) =>
      developerApi.updateBusiness(id, body),
    onSuccess: (_, vars) => {
      showToast('success', vars.body.status ? `Business status set to ${vars.body.status}.` : 'Business updated.');
      setRenamingBusiness(null);
      refresh();
    },
    onError: (error) => showToast('error', errorMessage(error)),
  });

  const assignPlan = useMutation({
    mutationFn: ({ id, planId }: { id: string; planId: string }) => developerApi.assignPlan(id, planId),
    onSuccess: () => {
      showToast('success', 'Plan assigned and feature entitlements synchronized.');
      refresh();
    },
    onError: (error) => showToast('error', errorMessage(error)),
  });

  const updateFeatures = useMutation({
    mutationFn: ({ id, featureFlags }: { id: string; featureFlags: Partial<FeatureFlags> }) =>
      developerApi.updateFeatures(id, featureFlags),
    onSuccess: () => {
      showToast('success', 'Feature entitlement updated.');
      refresh();
    },
    onError: (error) => showToast('error', errorMessage(error)),
  });

  const createPlan = useMutation({
    mutationFn: developerApi.createPlan,
    onSuccess: () => {
      showToast('success', 'Subscription plan created successfully.');
      setIsCreatingPlan(false);
      refresh();
    },
    onError: (error) => showToast('error', errorMessage(error)),
  });

  const updatePlan = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<Omit<SubscriptionPlan, '_id'>> }) =>
      developerApi.updatePlan(id, body),
    onSuccess: () => {
      showToast('success', 'Subscription plan updated.');
      setEditingPlan(null);
      refresh();
    },
    onError: (error) => showToast('error', errorMessage(error)),
  });

  /* Filtered Businesses */
  const filteredBusinesses = useMemo(() => {
    if (!businesses.data) return [];
    let list = businesses.data;
    const query = businessSearch.trim().toLowerCase();
    if (query) {
      list = list.filter(
        (b) =>
          b.name.toLowerCase().includes(query) ||
          b.businessId.toLowerCase().includes(query) ||
          (b.subscriptionPlanName && b.subscriptionPlanName.toLowerCase().includes(query)) ||
          (b.domainType && b.domainType.toLowerCase().includes(query))
      );
    }
    if (businessFilter === 'active') {
      list = list.filter((b) => b.status !== 'suspended');
    } else if (businessFilter === 'suspended') {
      list = list.filter((b) => b.status === 'suspended');
    } else if (businessFilter === 'has-plan') {
      list = list.filter((b) => !!b.subscriptionPlanId);
    } else if (businessFilter === 'no-plan') {
      list = list.filter((b) => !b.subscriptionPlanId);
    }
    return list;
  }, [businesses.data, businessSearch, businessFilter]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(text);
    showToast('success', `Copied ID: ${text}`);
    setTimeout(() => setCopiedId(null), 2500);
  };

  const generateStrongPassword = () => {
    const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*';
    let pwd = '';
    for (let i = 0; i < 16; i++) {
      pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setGeneratedPassword(pwd);
    setShowPassword(true);
  };

  const onCreateBusinessSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (createBusiness.isPending) return;
    const form = new FormData(event.currentTarget);
    const initialPlanId = String(form.get('initialPlanId') || '');

    createBusiness.mutate(
      {
        name: String(form.get('name')),
        domainType: String(form.get('domainType')),
        ownerName: String(form.get('ownerName')),
        ownerEmail: String(form.get('ownerEmail')),
        ownerPassword: String(form.get('ownerPassword')),
        currency: String(form.get('currency') || 'PKR'),
        address: String(form.get('address') || ''),
      },
      {
        onSuccess: (newBiz) => {
          if (initialPlanId && newBiz.businessId) {
            assignPlan.mutate({ id: newBiz.businessId, planId: initialPlanId });
          }
        },
      }
    );
  };

  const onCreatePlanSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (createPlan.isPending) return;
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
    if (!editingPlan || updatePlan.isPending) return;
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

  const onRenameBusinessSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!renamingBusiness || updateBusiness.isPending) return;
    const form = new FormData(event.currentTarget);
    const name = String(form.get('name') || '').trim();
    if (name) {
      updateBusiness.mutate({ id: renamingBusiness.businessId, body: { name } });
    }
  };

  const isLoading = businesses.isLoading || plans.isLoading;
  const isError = businesses.isError || plans.isError;
  const totalBusinesses = businesses.data?.length ?? overview.data?.businesses ?? 0;
  const activeBusinesses = businesses.data?.filter((b) => b.status !== 'suspended').length ?? overview.data?.activeBusinesses ?? 0;
  const activePlans = plans.data?.filter((p) => p.isActive).length ?? overview.data?.plans ?? 0;
  const assignedBusinesses = businesses.data?.filter((b) => b.subscriptionPlanId).length ?? 0;

  // Approximate MRR
  const estimatedMonthlyRevenue = useMemo(() => {
    if (!businesses.data || !plans.data) return 0;
    const planMap = new Map(plans.data.map((p) => [p._id, p]));
    return businesses.data.reduce((acc, b) => {
      if (!b.subscriptionPlanId) return acc;
      const plan = planMap.get(b.subscriptionPlanId);
      if (!plan) return acc;
      const monthlyAmount = plan.billingInterval === 'yearly' ? plan.price / 12 : plan.price;
      return acc + monthlyAmount;
    }, 0);
  }, [businesses.data, plans.data]);

  const tabs: { key: Tab; label: string; icon: ReactNode; badge?: number }[] = [
    { key: 'overview', label: 'Overview', icon: <IconActivity className="w-[18px] h-[18px]" /> },
    { key: 'businesses', label: 'Businesses', icon: <IconBuilding className="w-[18px] h-[18px]" />, badge: totalBusinesses },
    { key: 'plans', label: 'Plans', icon: <IconBadge className="w-[18px] h-[18px]" />, badge: plans.data?.length },
    { key: 'create-business', label: 'Provision', icon: <IconPlus className="w-[18px] h-[18px]" /> },
    { key: 'audit', label: 'Audit Log', icon: <IconClock className="w-[18px] h-[18px]" />, badge: auditLogs.data?.length },
    { key: 'settings', label: 'Settings', icon: <IconSettings className="w-[18px] h-[18px]" /> },
  ];

  const pageTitle =
    activeTab === 'overview' ? 'Developer Dashboard'
      : activeTab === 'businesses' ? 'Business Tenants'
        : activeTab === 'plans' ? 'Subscription Plans'
          : activeTab === 'create-business' ? 'Provision Tenant'
            : activeTab === 'audit' ? 'Audit & Telemetry'
              : 'Console Settings';

  const pageSubtitle =
    activeTab === 'overview' ? 'High-level engine analytics, tenant health, and quick actions.'
      : activeTab === 'businesses' ? 'Manage tenant organizations, assign plans, and toggle module entitlements.'
        : activeTab === 'plans' ? 'Configure subscription tiers, pricing, and baseline features.'
          : activeTab === 'create-business' ? 'Onboard a new organization with root Owner credentials.'
            : activeTab === 'audit' ? 'Live security and administrative event stream from the POS platform.'
              : 'Developer console appearance and workspace preferences.';

  const signOut = () => {
    logout();
    client.clear();
    navigate('/developer', { replace: true });
  };

  const userInitial = (user?.name?.charAt(0) || 'D').toUpperCase();

  return (
    <div className="dev-workspace">
      {/* ─── Desktop Sidebar ─── */}
      <aside className="dev-sidebar">
        {/* Brand */}
        <div className="flex items-center gap-3 px-2 pt-1">
          <span className="dev-brand-mark !h-10 !w-10">
            <IconCode className="w-5 h-5" />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-bold tracking-tight text-slate-900 dark:text-white">Dev Engine</h1>
            <p className="truncate text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">Kazmi POS Core</p>
          </div>
        </div>

        {/* Nav Items */}
        <nav className="mt-7 flex-1 space-y-1" aria-label="Developer navigation">
          <p className="dev-nav-caption">Console Modules</p>
          <div className="mt-1 flex flex-col gap-0.5">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`dev-nav-item ${activeTab === tab.key ? 'dev-nav-item-active' : ''}`}
                aria-current={activeTab === tab.key ? 'page' : undefined}
              >
                {tab.icon}
                <span>{tab.label}</span>
                {tab.badge !== undefined && (
                  <span className="dev-nav-badge">{tab.badge}</span>
                )}
              </button>
            ))}
          </div>
        </nav>

        {/* Sidebar Footer */}
        <div className="space-y-3 border-t border-slate-200/70 pt-3 dark:border-slate-800/70">
          <div className="flex items-center gap-2.5 px-2">
            <span className="dev-avatar !h-8 !w-8 !text-xs">{userInitial}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-slate-800 dark:text-slate-200">{user?.name || 'Developer'}</p>
              <p className="truncate text-[10px] text-slate-500 dark:text-slate-400">{user?.email || 'developer@pos.local'}</p>
            </div>
          </div>

          <div className="flex items-center justify-between gap-1 px-1">
            <ThemeToggle />
            <button
              onClick={refresh}
              type="button"
              className="dev-icon-btn"
              title="Refresh all developer data"
              aria-label="Refresh data"
            >
              <IconRefresh className="w-4 h-4" spinning={businesses.isFetching || plans.isFetching || overview.isFetching} />
            </button>
            <button
              type="button"
              onClick={signOut}
              className="dev-icon-btn dev-icon-btn-danger"
              title="Sign out of developer portal"
              aria-label="Sign out"
            >
              <IconLogout className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* ─── Mobile Header ─── */}
      <header className="dev-mobile-header">
        <div className="flex items-center gap-2.5">
          <span className="dev-brand-mark !h-9 !w-9">
            <IconCode className="w-4 h-4" />
          </span>
          <div>
            <h1 className="text-sm font-bold text-slate-900 dark:text-white">Dev Engine</h1>
            <p className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">Kazmi POS</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <ThemeToggle />
          <button
            onClick={refresh}
            type="button"
            className="dev-icon-btn"
            title="Refresh data"
            aria-label="Refresh data"
          >
            <IconRefresh className="w-4 h-4" spinning={businesses.isFetching || plans.isFetching} />
          </button>
          <button
            type="button"
            onClick={signOut}
            className="dev-icon-btn dev-icon-btn-danger"
            title="Sign out"
            aria-label="Sign out"
          >
            <IconLogout className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* ─── Main Content ─── */}
      <main className="dev-main">
        {/* Page Header */}
        <div className="dev-page-header">
          <div className="min-w-0">
            <p className="dev-eyebrow">Developer Engine</p>
            <h2 className="dev-page-title">{pageTitle}</h2>
            <p className="dev-page-subtitle">{pageSubtitle}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="dev-live-pill" title="Connected to POS Backend Engine">
              <span className="dev-live-dot" />
              Engine Online
            </span>
            {activeTab !== 'create-business' && (
              <button
                type="button"
                onClick={() => (activeTab === 'plans' ? setIsCreatingPlan(true) : setActiveTab('create-business'))}
                className="dev-btn-primary text-xs"
              >
                <IconPlus className="w-3.5 h-3.5" />
                {activeTab === 'plans' ? 'New Plan' : 'Provision Tenant'}
              </button>
            )}
            {activeTab === 'create-business' && (
              <button
                type="button"
                onClick={() => setActiveTab('businesses')}
                className="dev-btn-secondary text-xs"
              >
                View Tenants
              </button>
            )}
          </div>
        </div>

        {/* Toast Region */}
        {notification && (
          <div className="dev-content pb-0">
            <Toast notification={notification} onDismiss={() => setNotification(null)} />
          </div>
        )}

        <div className="dev-content">
          {/* ════════════════════════════════════════
             TAB: OVERVIEW
             ════════════════════════════════════════ */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Platform Statistics */}
              <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6" aria-label="Platform telemetry">
                <StatCard
                  icon={<IconBuilding className="w-4 h-4" />}
                  label="Total Businesses"
                  value={totalBusinesses}
                  hint={`${activeBusinesses} active`}
                  tone="accent"
                />
                <StatCard
                  icon={<IconShieldCheck className="w-4 h-4" />}
                  label="Active Tenants"
                  value={activeBusinesses}
                  hint={`${totalBusinesses - activeBusinesses} suspended`}
                  tone="success"
                />
                <StatCard
                  icon={<IconBadge className="w-4 h-4" />}
                  label="Active Plans"
                  value={activePlans}
                  hint="Subscription tiers"
                  tone="default"
                />
                <StatCard
                  icon={<IconCheck className="w-4 h-4" />}
                  label="Plan Coverage"
                  value={`${totalBusinesses > 0 ? Math.round((assignedBusinesses / totalBusinesses) * 100) : 0}%`}
                  hint={`${assignedBusinesses} assigned`}
                  tone="success"
                />
                <StatCard
                  icon={<IconCube className="w-4 h-4" />}
                  label="Modules"
                  value={featureKeys.length}
                  hint="POS, Inv, Rep, Cust, Inst, Barcode"
                  tone="default"
                />
                <StatCard
                  icon={<IconActivity className="w-4 h-4" />}
                  label="Est. MRR"
                  value={formatMoney(estimatedMonthlyRevenue)}
                  hint="From active plans"
                  tone="accent"
                />
              </section>

              {/* Quick Actions & Status */}
              <div className="grid gap-4 md:grid-cols-3">
                <div className="dev-card p-5 md:col-span-2 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">Quick Engine Actions</h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Instant shortcuts to configure and provision platform entities.</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                    <button
                      type="button"
                      onClick={() => setActiveTab('create-business')}
                      className="dev-card dev-card-hover flex flex-col items-start gap-1 p-3.5 text-left"
                    >
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-400">
                        <IconPlus className="w-4 h-4" />
                      </span>
                      <span className="text-xs font-bold text-slate-900 dark:text-white">Provision Tenant</span>
                      <span className="text-[10px] text-slate-500">Create business & owner account</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsCreatingPlan(true)}
                      className="dev-card dev-card-hover flex flex-col items-start gap-1 p-3.5 text-left"
                    >
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                        <IconBadge className="w-4 h-4" />
                      </span>
                      <span className="text-xs font-bold text-slate-900 dark:text-white">Create New Plan</span>
                      <span className="text-[10px] text-slate-500">Define pricing & module rights</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('audit')}
                      className="dev-card dev-card-hover flex flex-col items-start gap-1 p-3.5 text-left"
                    >
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-400">
                        <IconClock className="w-4 h-4" />
                      </span>
                      <span className="text-xs font-bold text-slate-900 dark:text-white">View Audit Trail</span>
                      <span className="text-[10px] text-slate-500">Inspect latest mutations</span>
                    </button>
                  </div>
                </div>

                <div className="dev-card p-5 space-y-3">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Developer Session</h3>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                      <span className="text-slate-500">Role</span>
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400">Platform Developer</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                      <span className="text-slate-500">Identity</span>
                      <span className="font-mono text-[11px] text-slate-700 dark:text-slate-300">{user?.email}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                      <span className="text-slate-500">Environment</span>
                      <span className="font-semibold">Local / Production API</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-slate-500">Engine API Status</span>
                      <span className="inline-flex items-center gap-1 font-semibold text-emerald-600">
                        <span className="h-2 w-2 rounded-full bg-emerald-500" /> Operational
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={refresh}
                    className="dev-btn-secondary w-full text-xs justify-center"
                  >
                    <IconRefresh className="w-3.5 h-3.5" spinning={businesses.isFetching} />
                    Sync Platform Data
                  </button>
                </div>
              </div>

              {/* Recent Activity Stream */}
              <div className="dev-card p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">Recent Platform Mutations</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Real-time log of business, plan, and entitlement changes.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('audit')}
                    className="dev-link-btn"
                  >
                    Full Log →
                  </button>
                </div>

                {auditLogs.data && auditLogs.data.length > 0 ? (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
                    {auditLogs.data.slice(0, 5).map((log) => (
                      <div key={log._id} className="py-2.5 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                            <IconCode className="w-3.5 h-3.5" />
                          </span>
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-slate-800 dark:text-slate-200">
                              <code>{log.action}</code>
                            </p>
                            <p className="truncate text-[10px] text-slate-400">
                              by {log.actorEmail} · Entity {log.entityType} ({log.entityId})
                            </p>
                          </div>
                        </div>
                        <span className="text-[10px] text-slate-400 flex-shrink-0">
                          {fmtDateTime(log.createdAt)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="py-4 text-center text-xs text-slate-400">No recent audit logs available.</p>
                )}
              </div>
            </div>
          )}

          {/* ════════════════════════════════════════
             TAB: BUSINESSES
             ════════════════════════════════════════ */}
          {activeTab === 'businesses' && (
            <section className="space-y-4">
              {/* Search & Filter Toolbar */}
              <div className="dev-card p-3.5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-1 items-center gap-2 max-w-md">
                  <div className="relative w-full">
                    <IconSearch className="pointer-events-none absolute left-3 top-1/2 w-4 h-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="search"
                      placeholder="Search name, Business ID, plan, or domain…"
                      className="input w-full pl-9 text-[13px]"
                      aria-label="Search businesses"
                      value={businessSearch}
                      onChange={(e) => setBusinessSearch(e.target.value)}
                    />
                    {businessSearch && (
                      <button
                        type="button"
                        onClick={() => setBusinessSearch('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        title="Clear search"
                      >
                        <IconClose className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Filter buttons */}
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  {(['all', 'active', 'suspended', 'has-plan', 'no-plan'] as const).map((filter) => (
                    <button
                      key={filter}
                      type="button"
                      onClick={() => setBusinessFilter(filter)}
                      className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold capitalize transition ${
                        businessFilter === filter
                          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-bold'
                          : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      {filter.replace('-', ' ')}
                    </button>
                  ))}
                </div>
              </div>

              {/* Status Header */}
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 px-1">
                <p>
                  Showing <strong>{filteredBusinesses.length}</strong> of {totalBusinesses} tenants
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab('create-business')}
                  className="dev-link-btn font-semibold"
                >
                  <IconPlus className="w-3.5 h-3.5" />
                  Provision Tenant
                </button>
              </div>

              {/* Business Cards */}
              {isLoading ? (
                <WorkspaceSkeleton />
              ) : isError ? (
                <div className="dev-card dev-error-card" role="alert">
                  <span className="dev-error-icon">
                    <IconAlert className="w-5 h-5" />
                  </span>
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Unable to load businesses.</p>
                  <button type="button" onClick={refresh} className="dev-btn-secondary mt-3 text-xs">
                    <IconRefresh className="w-3.5 h-3.5" /> Retry
                  </button>
                </div>
              ) : filteredBusinesses.length > 0 ? (
                <div className="space-y-3">
                  {filteredBusinesses.map((b) => {
                    const isSuspended = b.status === 'suspended';
                    const assigning = assignPlan.isPending && assignPlan.variables?.id === b.businessId;
                    const toggling = updateFeatures.isPending && updateFeatures.variables?.id === b.businessId;
                    const updatingBiz = updateBusiness.isPending && updateBusiness.variables?.id === b.businessId;

                    return (
                      <article key={b.businessId} className="dev-card dev-card-hover p-0 overflow-hidden">
                        {/* Card Header */}
                        <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between">
                          <div className="flex min-w-0 flex-1 items-start gap-3">
                            <span className="dev-avatar !h-11 !w-11">
                              {b.name.charAt(0).toUpperCase()}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="truncate text-sm font-bold text-slate-900 dark:text-white">{b.name}</h3>
                                <StatusBadge status={b.status} />
                                <button
                                  type="button"
                                  onClick={() => setRenamingBusiness(b)}
                                  className="dev-icon-btn !p-1 text-slate-400 hover:text-slate-600"
                                  title="Rename business"
                                  aria-label={`Rename ${b.name}`}
                                >
                                  <IconEdit className="w-3.5 h-3.5" />
                                </button>
                              </div>

                              <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                                <button
                                  type="button"
                                  onClick={() => copyToClipboard(b.businessId)}
                                  className="dev-copy-chip"
                                  title="Copy Business ID"
                                  aria-label={`Copy Business ID ${b.businessId}`}
                                >
                                  <code>{b.businessId}</code>
                                  {copiedId === b.businessId ? (
                                    <IconCheck className="w-3 h-3 text-emerald-500" />
                                  ) : (
                                    <IconCopy className="w-3 h-3" />
                                  )}
                                </button>
                                {b.domainType && (
                                  <span className="dev-meta-chip capitalize">{b.domainType}</span>
                                )}
                                {b.currency && (
                                  <span className="dev-meta-chip uppercase">{b.currency}</span>
                                )}
                                {b.createdAt && (
                                  <span className="inline-flex items-center gap-1">
                                    <IconClock className="w-3 h-3" />
                                    {fmtDateTime(b.createdAt)}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Plan Assignment & Status Toggle */}
                          <div className="w-full shrink-0 sm:w-64 space-y-2">
                            <div>
                              <label
                                className="dev-field-label"
                                htmlFor={`plan-select-${b.businessId}`}
                              >
                                Subscription Plan
                              </label>
                              <select
                                id={`plan-select-${b.businessId}`}
                                className="input text-xs py-1.5"
                                value={b.subscriptionPlanId ?? ''}
                                disabled={assigning || plans.data?.length === 0}
                                aria-busy={assigning}
                                onChange={(e) => {
                                  if (e.target.value) {
                                    assignPlan.mutate({ id: b.businessId, planId: e.target.value });
                                  }
                                }}
                              >
                                <option value="">{assigning ? 'Assigning…' : 'Choose Plan…'}</option>
                                {plans.data
                                  ?.filter((p) => p.isActive || p._id === b.subscriptionPlanId)
                                  .map((p) => (
                                    <option key={p._id} value={p._id}>
                                      {p.name} — {formatMoney(p.price)}/{p.billingInterval === 'monthly' ? 'mo' : 'yr'}
                                    </option>
                                  ))}
                              </select>
                              {b.subscriptionPlanName ? (
                                <p className="dev-plan-current">
                                  Current: <strong>{b.subscriptionPlanName}</strong>
                                </p>
                              ) : (
                                <p className="dev-plan-current is-empty">No plan assigned yet.</p>
                              )}
                            </div>

                            {/* Actions Bar: Suspend / Reactivate & Inspect */}
                            <div className="flex items-center gap-2 pt-1">
                              <button
                                type="button"
                                disabled={updatingBiz}
                                onClick={() =>
                                  updateBusiness.mutate({
                                    id: b.businessId,
                                    body: { status: isSuspended ? 'active' : 'suspended' },
                                  })
                                }
                                className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg border transition ${
                                  isSuspended
                                    ? 'border-emerald-500/30 text-emerald-600 bg-emerald-500/10 hover:bg-emerald-500/20'
                                    : 'border-red-500/30 text-red-600 bg-red-500/10 hover:bg-red-500/20'
                                }`}
                              >
                                {updatingBiz ? 'Updating…' : isSuspended ? 'Reactivate Tenant' : 'Suspend Tenant'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setInspectingBusiness(b)}
                                className="text-[11px] font-semibold px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                              >
                                Details
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Features Toggle Row */}
                        <div className="dev-feature-strip">
                          <div className="mb-2.5 flex items-center justify-between gap-2">
                            <p className="dev-strip-label">Module Entitlements</p>
                            {toggling && (
                              <span className="dev-inline-busy" role="status">
                                <IconRefresh className="w-3 h-3 spinning" />
                                Synchronizing with Tenant…
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-2" role="group" aria-label={`Feature entitlements for ${b.name}`}>
                            {featureKeys.map((key) => {
                              const isEnabled = b.featureFlags?.[key] !== false;
                              return (
                                <button
                                  key={key}
                                  type="button"
                                  role="switch"
                                  aria-checked={isEnabled}
                                  disabled={toggling}
                                  onClick={() => {
                                    updateFeatures.mutate({
                                      id: b.businessId,
                                      featureFlags: { [key]: !isEnabled },
                                    });
                                  }}
                                  className={`dev-switch-pill ${isEnabled ? 'is-on' : 'is-off'}`}
                                  title={`Click to ${isEnabled ? 'disable' : 'enable'} ${featureNames[key]} module`}
                                >
                                  <span className="dev-switch-icon">{featureIcons[key]({ className: 'w-3.5 h-3.5' })}</span>
                                  <span>{featureNames[key]}</span>
                                  <span className={`dev-switch-track ${isEnabled ? 'is-on' : ''}`} aria-hidden="true">
                                    <span className="dev-switch-thumb" />
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <EmptyState
                  icon={<IconBuilding className="w-6 h-6" />}
                  title={businessSearch ? 'No matching businesses' : 'No businesses provisioned'}
                  subtitle={
                    businessSearch
                      ? `No businesses found matching “${businessSearch}”. Try clearing your search.`
                      : 'Provision your first tenant organization to begin managing subscription plans and features.'
                  }
                  action={
                    !businessSearch && (
                      <button type="button" onClick={() => setActiveTab('create-business')} className="dev-btn-primary text-xs">
                        <IconPlus className="w-3.5 h-3.5" /> Provision Tenant
                      </button>
                    )
                  }
                />
              )}
            </section>
          )}

          {/* ════════════════════════════════════════
             TAB: PLANS
             ════════════════════════════════════════ */}
          {activeTab === 'plans' && (
            <section className="space-y-4">
              <div className="flex items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
                <p>
                  {plans.data?.length ?? 0} plan{(plans.data?.length ?? 0) === 1 ? '' : 's'} configured · <strong>{activePlans}</strong> active
                </p>
                <button
                  type="button"
                  onClick={() => setIsCreatingPlan(true)}
                  className="dev-btn-primary text-xs"
                >
                  <IconPlus className="w-3.5 h-3.5" />
                  New Plan Tier
                </button>
              </div>

              {plans.data && plans.data.length > 0 ? (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {plans.data.map((plan) => {
                    const includedCount = featureKeys.filter((key) => plan.features?.[key]).length;
                    const archiving = updatePlan.isPending && updatePlan.variables?.id === plan._id;

                    return (
                      <div
                        key={plan._id}
                        className={`dev-plan-card ${plan.isActive ? '' : 'is-archived'}`}
                      >
                        {/* Plan Header */}
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="truncate text-[15px] font-bold tracking-tight text-slate-900 dark:text-white">
                              {plan.name}
                            </h3>
                            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                              {plan.description || 'No description provided.'}
                            </p>
                          </div>
                          <span className={`dev-plan-badge ${plan.isActive ? 'is-active' : 'is-archived'}`}>
                            {plan.isActive ? 'Active' : 'Archived'}
                          </span>
                        </div>

                        {/* Price */}
                        <div className="dev-plan-price-row">
                          <span className="dev-plan-price">{formatMoney(plan.price)}</span>
                          <span className="dev-plan-interval">/ {plan.billingInterval}</span>
                        </div>

                        {/* Features Checklist */}
                        <div className="dev-plan-features">
                          <p className="dev-strip-label">
                            Included Modules ({includedCount}/{featureKeys.length})
                          </p>
                          <ul className="mt-2 space-y-1">
                            {featureKeys.map((key) => {
                              const has = plan.features?.[key];
                              return (
                                <li key={key} className={`dev-plan-feature-row ${has ? 'is-included' : 'is-excluded'}`}>
                                  <span className={`dev-plan-feature-mark ${has ? 'is-included' : 'is-excluded'}`}>
                                    {has ? <IconCheck className="w-2.5 h-2.5" /> : <IconMinus className="w-2.5 h-2.5" />}
                                  </span>
                                  <span className="flex items-center gap-1.5">
                                    {featureIcons[key]({ className: 'w-3.5 h-3.5' })}
                                    {featureNames[key]}
                                  </span>
                                </li>
                              );
                            })}
                          </ul>
                        </div>

                        {/* Actions */}
                        <div className="dev-plan-actions">
                          <button
                            type="button"
                            disabled={archiving}
                            onClick={() =>
                              updatePlan.mutate({
                                id: plan._id,
                                body: { isActive: !plan.isActive },
                              })
                            }
                            className="dev-btn-secondary flex-1 text-xs justify-center"
                          >
                            {archiving ? 'Saving…' : plan.isActive ? 'Archive' : 'Reactivate'}
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
                    );
                  })}
                </div>
              ) : (
                <EmptyState
                  icon={<IconBadge className="w-6 h-6" />}
                  title="No subscription plans configured"
                  subtitle="Create your first subscription tier to establish pricing and module rights for your tenants."
                  action={
                    <button type="button" onClick={() => setIsCreatingPlan(true)} className="dev-btn-primary text-xs">
                      <IconPlus className="w-3.5 h-3.5" /> Create Plan
                    </button>
                  }
                />
              )}
            </section>
          )}

          {/* ════════════════════════════════════════
             TAB: PROVISION BUSINESS
             ════════════════════════════════════════ */}
          {activeTab === 'create-business' && (
            <section className="mx-auto max-w-2xl">
              <form onSubmit={onCreateBusinessSubmit} className="dev-card p-5 sm:p-6">
                {/* Business Info */}
                <div className="dev-form-section">
                  <div className="dev-step-head">
                    <span className="dev-step-badge tone-accent">1</span>
                    <div>
                      <h3 className="dev-step-title">Business Profile</h3>
                      <p className="dev-step-sub">Brand identity, industry domain, and currency.</p>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <label className="label" htmlFor="biz-name">Business Name</label>
                      <input className="input" id="biz-name" name="name" placeholder="e.g. Kazmi Supermarket" required minLength={2} maxLength={120} />
                    </div>
                    <div>
                      <label className="label" htmlFor="biz-domain">Domain Type</label>
                      <select className="input" id="biz-domain" name="domainType" defaultValue="retail">
                        {['retail', 'restaurant', 'pharmacy', 'salon', 'custom'].map((d) => (
                          <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="label" htmlFor="biz-currency">Currency Code</label>
                      <input className="input uppercase font-mono" id="biz-currency" name="currency" placeholder="PKR" defaultValue="PKR" maxLength={3} />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="label" htmlFor="biz-address">
                        Physical Address <span className="font-normal normal-case text-slate-400">(optional)</span>
                      </label>
                      <input className="input" id="biz-address" name="address" placeholder="Store street address or plaza number" />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="label" htmlFor="initial-plan">Initial Subscription Plan (optional)</label>
                      <select className="input" id="initial-plan" name="initialPlanId" defaultValue="">
                        <option value="">No initial plan (assign later)</option>
                        {plans.data?.filter((p) => p.isActive).map((p) => (
                          <option key={p._id} value={p._id}>
                            {p.name} ({formatMoney(p.price)}/{p.billingInterval})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Owner Account */}
                <div className="dev-form-section">
                  <div className="dev-step-head">
                    <span className="dev-step-badge tone-success">2</span>
                    <div>
                      <h3 className="dev-step-title">Root Owner Account</h3>
                      <p className="dev-step-sub">The merchant owner credentials to access their store terminal.</p>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="label" htmlFor="owner-name">Owner Full Name</label>
                      <input className="input" id="owner-name" name="ownerName" placeholder="e.g. Ali Kazmi" required minLength={2} maxLength={80} />
                    </div>
                    <div>
                      <label className="label" htmlFor="owner-email">Owner Email</label>
                      <input className="input" id="owner-email" name="ownerEmail" type="email" autoComplete="email" placeholder="owner@business.com" required />
                    </div>
                    <div className="sm:col-span-2">
                      <div className="mb-1.5 flex items-center justify-between">
                        <label className="label !mb-0" htmlFor="owner-password">
                          Temporary Password <span className="font-normal normal-case text-slate-400">(min 12 characters)</span>
                        </label>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={generateStrongPassword}
                            className="dev-link-btn"
                          >
                            Generate Strong
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="dev-link-btn"
                            aria-label={showPassword ? 'Hide password' : 'Show password'}
                          >
                            {showPassword ? <IconEyeOff className="w-3.5 h-3.5" /> : <IconEye className="w-3.5 h-3.5" />}
                            {showPassword ? 'Hide' : 'Show'}
                          </button>
                        </div>
                      </div>
                      <input
                        className="input font-mono"
                        id="owner-password"
                        name="ownerPassword"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="At least 12 characters"
                        required
                        minLength={12}
                        maxLength={72}
                        autoComplete="new-password"
                        value={generatedPassword || undefined}
                        onChange={(e) => setGeneratedPassword(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                {createBusiness.isError && (
                  <div className="dev-inline-alert" role="alert">
                    <IconAlert className="w-4 h-4 flex-shrink-0" />
                    <span>{errorMessage(createBusiness.error)}</span>
                  </div>
                )}

                {/* Actions */}
                <div className="dev-form-actions">
                  <button
                    type="button"
                    onClick={() => setActiveTab('businesses')}
                    className="dev-btn-secondary text-xs"
                  >
                    Cancel
                  </button>
                  <button className="dev-btn-primary text-xs" type="submit" disabled={createBusiness.isPending}>
                    {createBusiness.isPending ? (
                      <>
                        <IconRefresh className="w-3.5 h-3.5 spinning" />
                        Provisioning Tenant…
                      </>
                    ) : (
                      <>
                        <IconShieldCheck className="w-3.5 h-3.5" />
                        Provision Tenant
                      </>
                    )}
                  </button>
                </div>
              </form>
            </section>
          )}

          {/* ════════════════════════════════════════
             TAB: AUDIT LOG
             ════════════════════════════════════════ */}
          {activeTab === 'audit' && (
            <section className="space-y-4">
              <div className="flex items-center justify-between text-xs text-slate-500 px-1">
                <p>Recent platform security and tenant modifications</p>
                <button
                  type="button"
                  onClick={() => auditLogs.refetch()}
                  className="dev-link-btn font-semibold"
                >
                  <IconRefresh className="w-3.5 h-3.5" spinning={auditLogs.isFetching} />
                  Refresh Log
                </button>
              </div>

              <div className="dev-card p-0 overflow-hidden">
                {auditLogs.isLoading ? (
                  <div className="p-8 text-center text-xs text-slate-400">Loading audit records…</div>
                ) : auditLogs.data && auditLogs.data.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 dark:bg-slate-800/60 text-[10px] uppercase font-bold text-slate-500 border-b border-slate-200 dark:border-slate-800">
                        <tr>
                          <th className="py-3 px-4">Action</th>
                          <th className="py-3 px-4">Actor</th>
                          <th className="py-3 px-4">Entity</th>
                          <th className="py-3 px-4">Details</th>
                          <th className="py-3 px-4">Time</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                        {auditLogs.data.map((entry) => (
                          <tr key={entry._id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                            <td className="py-3 px-4 font-mono font-semibold text-emerald-700 dark:text-emerald-400">
                              {entry.action}
                            </td>
                            <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                              {entry.actorEmail}
                            </td>
                            <td className="py-3 px-4">
                              <span className="dev-meta-chip !text-[10px]">{entry.entityType}</span>
                              <span className="ml-1 text-[11px] font-mono text-slate-400">{entry.entityId}</span>
                            </td>
                            <td className="py-3 px-4 max-w-xs truncate font-mono text-[10px] text-slate-500">
                              {JSON.stringify(entry.details)}
                            </td>
                            <td className="py-3 px-4 text-[11px] text-slate-400 whitespace-nowrap">
                              {fmtDateTime(entry.createdAt)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-8 text-center text-xs text-slate-400">No audit records found.</div>
                )}
              </div>
            </section>
          )}

          {/* ════════════════════════════════════════
             TAB: CONSOLE SETTINGS
             ════════════════════════════════════════ */}
          {activeTab === 'settings' && (
            <section className="space-y-4">
              <div className="dev-card p-5 space-y-5">
                <div>
                  <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Console preferences</h3>
                  <p className="mt-1 text-xs text-slate-500">Personal workspace settings for this developer account. These do not affect business tenants.</p>
                </div>
                <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                  <div>
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">Dark mode</p>
                    <p className="mt-0.5 text-[11px] text-slate-500">Use a dark theme across the developer console.</p>
                  </div>
                  <ThemeToggle />
                </div>
                <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">Account</p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    Signed in as <span className="font-mono font-semibold">{user?.email}</span> — developer scope. Use the header profile menu to sign out.
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">Hierarchy reference</p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    Developer → grants module rights to Business Admin (owner) → Business Admin assigns rights to Staff & Cashier accounts from Settings → Staff.
                  </p>
                </div>
              </div>
            </section>
          )}
        </div>
      </main>

      {/* ─── Mobile Bottom Nav ─── */}
      <nav className="dev-bottom-nav" aria-label="Developer tabs">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`dev-bottom-nav-item ${activeTab === tab.key ? 'dev-bottom-nav-item-active' : ''}`}
            aria-current={activeTab === tab.key ? 'page' : undefined}
          >
            {tab.icon}
            <span className="mt-0.5 text-[10px] font-semibold">{tab.label}</span>
            {tab.badge !== undefined && tab.badge > 0 && (
              <span className="dev-bottom-badge" aria-hidden="true">
                {tab.badge > 99 ? '99+' : tab.badge}
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* ═══ Modal: Create Plan ═══ */}
      {isCreatingPlan && (
        <ModalOverlay onClose={() => setIsCreatingPlan(false)} labelledBy="create-plan-title">
          <ModalHeader
            titleId="create-plan-title"
            title="Create Subscription Plan"
            subtitle="Pricing, billing cadence, and baseline module rights."
            onClose={() => setIsCreatingPlan(false)}
          />

          <form onSubmit={onCreatePlanSubmit} className="dev-modal-body">
            {createPlan.isError && (
              <div className="dev-inline-alert" role="alert">
                <IconAlert className="w-4 h-4 flex-shrink-0" />
                <span>{errorMessage(createPlan.error)}</span>
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="label" htmlFor="plan-name">Plan Name</label>
                <input className="input" id="plan-name" name="name" placeholder="e.g. Premium Tier" required minLength={2} maxLength={80} />
              </div>
              <div>
                <label className="label" htmlFor="plan-price">Price (PKR)</label>
                <input className="input" id="plan-price" name="price" type="number" min="0" step="0.01" placeholder="4999" required />
              </div>
              <div>
                <label className="label" htmlFor="plan-interval">Billing Interval</label>
                <select className="input" id="plan-interval" name="billingInterval" defaultValue="monthly">
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor="plan-description">Description</label>
                <input className="input" id="plan-description" name="description" placeholder="Brief summary of plan benefits" maxLength={500} />
              </div>
            </div>

            <div className="dev-modal-divider">
              <label className="dev-field-label">Included Modules</label>
              <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                All modules enabled by default. Uncheck any you want to restrict.
              </p>
              <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
                {featureKeys.map((key) => (
                  <label key={key} className="dev-feature-checkbox">
                    <input type="checkbox" name={`feature-${key}`} defaultChecked className="dev-checkbox" />
                    <span className="dev-feature-checkbox-icon">{featureIcons[key]({ className: 'w-4 h-4' })}</span>
                    <span>
                      <span className="block text-xs font-semibold">{featureNames[key]}</span>
                      <span className="block text-[10px] text-slate-500 dark:text-slate-400">{featureDescriptions[key]}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className="dev-modal-foot">
              <button type="button" onClick={() => setIsCreatingPlan(false)} className="dev-btn-secondary text-xs">
                Cancel
              </button>
              <button type="submit" disabled={createPlan.isPending} className="dev-btn-primary text-xs">
                {createPlan.isPending ? (
                  <>
                    <IconRefresh className="w-3.5 h-3.5 spinning" />
                    Creating…
                  </>
                ) : (
                  <>
                    <IconPlus className="w-3.5 h-3.5" />
                    Create Plan
                  </>
                )}
              </button>
            </div>
          </form>
        </ModalOverlay>
      )}

      {/* ═══ Modal: Edit Plan ═══ */}
      {editingPlan && (
        <ModalOverlay onClose={() => setEditingPlan(null)} labelledBy="edit-plan-title">
          <ModalHeader
            titleId="edit-plan-title"
            title="Edit Subscription Plan"
            subtitle={editingPlan.name}
            onClose={() => setEditingPlan(null)}
          />

          <form onSubmit={onUpdatePlanSubmit} className="dev-modal-body">
            {updatePlan.isError && (
              <div className="dev-inline-alert" role="alert">
                <IconAlert className="w-4 h-4 flex-shrink-0" />
                <span>{errorMessage(updatePlan.error)}</span>
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="label" htmlFor="edit-plan-name">Plan Name</label>
                <input className="input" id="edit-plan-name" name="name" defaultValue={editingPlan.name} required minLength={2} maxLength={80} />
              </div>
              <div>
                <label className="label" htmlFor="edit-plan-price">Price (PKR)</label>
                <input className="input" id="edit-plan-price" name="price" type="number" min="0" step="0.01" defaultValue={editingPlan.price} required />
              </div>
              <div>
                <label className="label" htmlFor="edit-plan-interval">Billing Interval</label>
                <select className="input" id="edit-plan-interval" name="billingInterval" defaultValue={editingPlan.billingInterval}>
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor="edit-plan-description">Description</label>
                <input className="input" id="edit-plan-description" name="description" defaultValue={editingPlan.description} placeholder="Brief description" maxLength={500} />
              </div>
              <div className="sm:col-span-2">
                <label className="dev-feature-checkbox !items-center">
                  <input type="checkbox" id="edit-is-active" name="isActive" defaultChecked={editingPlan.isActive} className="dev-checkbox" />
                  <span className="dev-feature-checkbox-icon">{featureIcons.pos({ className: 'w-4 h-4' })}</span>
                  <span>
                    <span className="block text-xs font-semibold">Active Plan</span>
                    <span className="block text-[10px] text-slate-500 dark:text-slate-400">Available for assignment to tenants.</span>
                  </span>
                </label>
              </div>
            </div>

            <div className="dev-modal-divider">
              <label className="dev-field-label">Included Modules</label>
              <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
                {featureKeys.map((key) => (
                  <label key={key} className="dev-feature-checkbox">
                    <input type="checkbox" name={`edit-feature-${key}`} defaultChecked={editingPlan.features?.[key]} className="dev-checkbox" />
                    <span className="dev-feature-checkbox-icon">{featureIcons[key]({ className: 'w-4 h-4' })}</span>
                    <span>
                      <span className="block text-xs font-semibold">{featureNames[key]}</span>
                      <span className="block text-[10px] text-slate-500 dark:text-slate-400">{featureDescriptions[key]}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className="dev-modal-foot">
              <button type="button" onClick={() => setEditingPlan(null)} className="dev-btn-secondary text-xs">
                Cancel
              </button>
              <button type="submit" disabled={updatePlan.isPending} className="dev-btn-primary text-xs">
                {updatePlan.isPending ? 'Saving…' : 'Save Plan Changes'}
              </button>
            </div>
          </form>
        </ModalOverlay>
      )}

      {/* ═══ Modal: Rename Business ═══ */}
      {renamingBusiness && (
        <ModalOverlay onClose={() => setRenamingBusiness(null)} labelledBy="rename-modal-title">
          <ModalHeader
            titleId="rename-modal-title"
            title="Update Tenant Name"
            subtitle={`ID: ${renamingBusiness.businessId}`}
            onClose={() => setRenamingBusiness(null)}
          />
          <form onSubmit={onRenameBusinessSubmit} className="dev-modal-body">
            <div>
              <label className="label" htmlFor="rename-biz-name">Business Organization Name</label>
              <input
                id="rename-biz-name"
                name="name"
                className="input"
                defaultValue={renamingBusiness.name}
                required
                minLength={2}
                maxLength={120}
              />
            </div>
            <div className="dev-modal-foot">
              <button type="button" onClick={() => setRenamingBusiness(null)} className="dev-btn-secondary text-xs">
                Cancel
              </button>
              <button type="submit" disabled={updateBusiness.isPending} className="dev-btn-primary text-xs">
                {updateBusiness.isPending ? 'Saving…' : 'Save Name'}
              </button>
            </div>
          </form>
        </ModalOverlay>
      )}

      {/* ═══ Modal: Inspect Business Details ═══ */}
      {inspectingBusiness && (
        <ModalOverlay onClose={() => setInspectingBusiness(null)} labelledBy="inspect-modal-title">
          <ModalHeader
            titleId="inspect-modal-title"
            title={inspectingBusiness.name}
            subtitle={`Tenant ID: ${inspectingBusiness.businessId}`}
            onClose={() => setInspectingBusiness(null)}
          />
          <div className="dev-modal-body space-y-3 text-xs">
            <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
              <span className="text-slate-500">Status</span>
              <StatusBadge status={inspectingBusiness.status} />
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
              <span className="text-slate-500">Domain Category</span>
              <span className="font-semibold capitalize text-slate-800 dark:text-slate-200">{inspectingBusiness.domainType || 'retail'}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
              <span className="text-slate-500">Operating Currency</span>
              <span className="font-mono font-bold uppercase">{inspectingBusiness.currency || 'PKR'}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
              <span className="text-slate-500">Subscription Plan</span>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                {inspectingBusiness.subscriptionPlanName || 'No plan assigned'}
              </span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
              <span className="text-slate-500">Provisioned On</span>
              <span className="text-slate-600 dark:text-slate-400">{inspectingBusiness.createdAt ? fmtDateTime(inspectingBusiness.createdAt) : '—'}</span>
            </div>

            <div className="pt-2">
              <p className="dev-field-label">Active Modules</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {featureKeys.map((k) => {
                  const enabled = inspectingBusiness.featureFlags?.[k] !== false;
                  return (
                    <span
                      key={k}
                      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold ${
                        enabled
                          ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                          : 'bg-slate-100 text-slate-400 dark:bg-slate-800'
                      }`}
                    >
                      {featureIcons[k]({ className: 'w-3 h-3' })}
                      {featureNames[k]}
                    </span>
                  );
                })}
              </div>
            </div>

            <div className="dev-modal-foot">
              <button
                type="button"
                onClick={() => copyToClipboard(inspectingBusiness.businessId)}
                className="dev-btn-secondary text-xs"
              >
                <IconCopy className="w-3.5 h-3.5" />
                Copy ID
              </button>
              <button
                type="button"
                onClick={() => setInspectingBusiness(null)}
                className="dev-btn-primary text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}
