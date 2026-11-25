import { createBackupZip } from '../utils/backup';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import './Developer.css';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FeatureKey, SubscriptionPlan, FeatureFlags, BusinessPlanTarget, BillingInterval, DomainType, ProvisionableRole } from '@pos/shared-types';
import { DOMAIN_ROLE_PACKAGES, MODULE_RIGHTS } from '@pos/shared-types';
import type { DomainRolePackage, ProvisionAccountInput, ClientAccountEntry } from '../api';
import { developerApi, authApi } from '../api';
import { useAuth } from '../store/auth';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import ThemeToggle from '../components/ThemeToggle';
import DevConsoleSearch from '../components/developer/DevConsoleSearch';
import DevNotificationCenter from '../components/developer/DevNotificationCenter';
import { IconHelp, IconBackup } from '../components/Icons';
import { errorMessage } from '../utils/errors';
import { formatMoney } from '../utils/money';
import { fmtDateTime } from '../utils/dates';
import { urduClass, urduInputProps } from '../utils/urdu';

/* ─────────────── Feature Config ─────────────── */

const fallbackFeatureKeys: FeatureKey[] = ['pos', 'inventory', 'reports', 'customers', 'installments', 'barcodes', 'data-sync'];
const fallbackFeatureNames: Record<FeatureKey, string> = {
  pos: 'POS',
  inventory: 'Inventory',
  reports: 'Reports',
  customers: 'Customers',
  installments: 'Installments',
  barcodes: 'Barcode tools',
  'data-sync': 'Data Sync',
};

const featureDescriptions: Record<FeatureKey, string> = {
  pos: 'Point of Sale terminal & checkout',
  inventory: 'Product catalog & stock tracking',
  reports: 'Sales reports & analytics',
  customers: 'Customer ledger & CRM',
  installments: 'Installment plans & schedules',
  barcodes: 'Barcode generator and scanner access',
  'data-sync': 'Owner-triggered business snapshots for provisioned cloud installations',
};

/* Feature vector icons */
const featureIcons: Record<FeatureKey, (props: { className?: string }) => ReactNode> = {
  'data-sync': IconBackup,
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

/** Kazmi brand monogram — geometric "K" seal used across the developer engine. */
function KazmiLogo({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect x="1.5" y="1.5" width="29" height="29" rx="8" fill="currentColor" opacity="0.12" />
      <rect x="1.5" y="1.5" width="29" height="29" rx="8" stroke="currentColor" strokeWidth="1.6" />
      <path d="M10 8v16M22.5 8l-8.5 8 8.5 8" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="23" cy="24" r="1.6" fill="currentColor" />
    </svg>
  );
}

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

function IconShield({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.125 2.25h-4.5A2.25 2.25 0 003.375 4.5v15a2.25 2.25 0 002.25 2.25h12.75a2.25 2.25 0 002.25-2.25v-15a2.25 2.25 0 00-2.25-2.25h-4.5M10.125 2.25h3.75a.75.75 0 01.75.75v.75m-4.5 0v-.75m0 0a.75.75 0 01-.75.75H6.75m0 0v.75M9 12.75l1.5 1.5 3-3.75" />
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
  const dialog = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const focusable = () => Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]') ?? []);
    focusable()[0]?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close.current();
      if (event.key === 'Tab') {
        const items = focusable();
        const first = items[0]; const last = items[items.length - 1];
        if (!first) { event.preventDefault(); return; }
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);

  return (
    <div
      className="dev-modal-backdrop"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="dev-modal"
        ref={dialog}
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
      <span className="min-w-0 flex-1 break-words">{notification.text}</span>
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

/* Domain accent tones used by the standard account-identity pattern. */
const DOMAIN_AVATAR_TONE: Record<string, string> = {
  restaurant: 'from-orange-500 to-rose-600',
  retail: 'from-brand-500 to-brand-700',
  supermarket: 'from-emerald-500 to-teal-600',
  grocery: 'from-lime-500 to-emerald-600',
  pharmacy: 'from-sky-500 to-blue-700',
  electronics: 'from-violet-500 to-indigo-700',
  salon: 'from-fuchsia-500 to-purple-600',
  custom: 'from-slate-500 to-slate-700',
};

/**
 * Standard identity pattern for every business/account surface:
 * tenant logo if uploaded, else a brand-gradient monogram (Urdu names keep
 * their natural letter shape in nastaleeq via urduClass).
 */
function BusinessAvatar({ name, logoUrl, domainType, size = 'md' }: { name: string; logoUrl?: string; domainType?: string; size?: 'sm' | 'md' | 'lg' }) {
  const dims = size === 'lg' ? 'h-14 w-14 text-lg' : size === 'sm' ? 'h-8 w-8 text-[11px]' : 'h-11 w-11';
  const tone = DOMAIN_AVATAR_TONE[domainType ?? 'custom'] ?? DOMAIN_AVATAR_TONE.custom;
  const initials = name.trim().split(/\s+/).slice(0, 2).map((word) => word.charAt(0)).join('') || '?';
  return (
    <span
      className={`relative flex flex-shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br font-bold text-white shadow-sm ring-1 ring-black/5 ${tone} ${dims} ${urduClass(name)}`}
      title={name}
    >
      {logoUrl
        ? <img src={logoUrl} alt={name} className="h-full w-full object-cover" loading="lazy" />
        : <span aria-hidden="true">{initials.toUpperCase()}</span>}
    </span>
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
  return user?.isDeveloper ? <DeveloperWorkspace key={user._id} developerId={user._id} /> : <DeveloperLogin />;
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   Developer Login
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */

function DeveloperLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [step, setStep] = useState<'email' | 'password'>('email');
  const [showPassword, setShowPassword] = useState(false);
  const [showSetupModal, setShowSetupModal] = useState(false);
  const setSession = useAuth((state) => state.setSession);
  const navigate = useNavigate();

  type DeveloperLoginInput = { email: string; password: string };

  const login = useMutation({
    mutationFn: (variables: DeveloperLoginInput) => authApi.developerLogin(variables),
    onSuccess: (session) => {
      setSession(session);
      navigate('/developer', { replace: true });
    },
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedEmail = email.trim();
    if (step === 'email' && normalizedEmail) {
      login.reset();
      setEmail(normalizedEmail);
      setStep('password');
      return;
    }
    if (step === 'password' && normalizedEmail && password && !login.isPending) {
      login.mutate({ email: normalizedEmail, password });
    }
  };

  return (
    <main className="sign-in-page dev-login-page">
      <div className="sign-in-artwork"><img src="/kazmion-store-banner.jpg" srcSet="/kazmion-store-banner.jpg 1024w, /kazmion-store-banner-1670.png 1670w" sizes="(max-aspect-ratio: 16/9) 178svh, 100vw" width="1024" height="577" alt="Kazmion Smart POS Solution — Manage Sales, Inventory, Customers and More" fetchPriority="high" /></div>
      <div className="sign-in-content">
      <div className="sign-in-toolbar"><span>DEVELOPER ENGINE</span>
        <ThemeToggle />
      </div>

      <section className="sign-in-card" aria-labelledby="dev-sign-in-title">
        <div className="grid grid-cols-1">

          <form onSubmit={submit} className="sign-in-form" aria-busy={login.isPending} aria-describedby="dev-sign-in-description">
            {/* Brand header */}
            <div className="sign-in-heading">
              <div className="sign-in-brand">Kazmi<span>On</span><small>DEVELOPER ENGINE</small></div>
              <p className="sign-in-eyebrow">{step === 'email' ? 'STEP 1 OF 2 · IDENTITY' : 'STEP 2 OF 2 · CREDENTIALS'}</p>
              <h1 id="dev-sign-in-title">{step === 'email' ? 'Developer sign in' : 'Enter your password'}</h1>
              <p id="dev-sign-in-description" className="sign-in-description">{step === 'email' ? 'Access the platform workspace with your verified developer account.' : 'Use your account password to continue to the Developer Engine.'}</p>
            </div>

            <ol className="sign-in-steps" aria-label={`Step ${step === 'email' ? 1 : 2} of 2`}>
              <li aria-current={step === 'email' ? 'step' : undefined}><span aria-hidden="true">{step === 'password' ? '✓' : '1'}</span>Email</li>
              <li aria-current={step === 'password' ? 'step' : undefined}><span aria-hidden="true">2</span>Password</li>
            </ol>

            {step === 'password' && (
              <div className="sign-in-account">
                <span><small>Signing in as</small><strong title={email}>{email}</strong></span>
                <button type="button" disabled={login.isPending} onClick={() => { setPassword(''); setShowPassword(false); login.reset(); setStep('email'); }}>Change</button>
              </div>
            )}

            {step === 'email' ? (
              <div>
                <label className="label" htmlFor="developer-email">Verified developer email</label>
                <input id="developer-email" className="input" type="email" autoComplete="username" autoCapitalize="none" spellCheck={false} enterKeyHint="next" placeholder="name@example.com" required disabled={login.isPending} value={email} onChange={(e) => { setEmail(e.target.value); if (login.isError) login.reset(); }} />
                <p className="sign-in-field-hint" style={{ color: 'var(--text-soft)' }}>Use the email address configured for your Developer account.</p>
              </div>
            ) : (
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="label" htmlFor="developer-password">Developer password</label>
                  <button type="button" onClick={() => setShowPassword((v) => !v)} className="dev-link-btn" aria-label={showPassword ? 'Hide password' : 'Show password'}>
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
                <div className="sign-in-password">
                  <input id="developer-password" className="input" type={showPassword ? 'text' : 'password'} autoComplete="current-password" enterKeyHint="go" aria-describedby="developer-password-hint" aria-invalid={login.isError || undefined} maxLength={128} placeholder="Enter your password" required disabled={login.isPending} value={password} onChange={(e) => { setPassword(e.target.value); if (login.isError) login.reset(); }} />
                </div>
                <p id="developer-password-hint" className="sign-in-field-hint" style={{ color: 'var(--text-soft)' }}>Your password is stored as a secure hash, never as plain text.</p>
              </div>
            )}

            {step === 'password' && login.isError && (
              <p className="sign-in-error" role="alert">{errorMessage(login.error)}</p>
            )}

            <button className="sign-in-submit" type="submit" disabled={step === 'email' ? !email.trim() || login.isPending : login.isPending || !password}>
              {login.isPending ? (
                <span className="flex items-center justify-center gap-2"><span className="sign-in-spinner" aria-hidden="true" />Verifying…</span>
              ) : step === 'email' ? (
                <>Continue to password <span aria-hidden="true">→</span></>
              ) : (
                <>Sign in to Developer Engine <span aria-hidden="true">→</span></>
              )}
            </button>

            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
              <button type="button" onClick={() => setShowSetupModal(true)} className="dev-link-btn">
                Set up password
              </button>
              <Link to="/login" className="dev-link-btn">
                POS Sign In
              </Link>
            </div>

            <p className="sign-in-security">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="3" /><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" /></svg>
              <Link to="/recover?purpose=password&source=developer">Forgot password?</Link>
            </p>
          </form>
        </div>
      </section>
      </div>

      {showSetupModal && (
        <DeveloperPasswordSetupModal onClose={() => setShowSetupModal(false)} />
      )}
    </main>
  );
}

/* ─────────────── Developer Setup Modal ─────────────── */

function DeveloperPasswordSetupModal({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState('');
  const [setupToken, setSetupToken] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const setup = useMutation({ mutationFn: authApi.setupDeveloperPassword });

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setup.mutate({ email, setupToken, password }, { onSuccess: () => { setSetupToken(''); setPassword(''); } });
  };

  return (
    <ModalOverlay onClose={onClose} labelledBy="setup-modal-title">
      <ModalHeader
        titleId="setup-modal-title"
        title="Developer password setup"
        subtitle="Use the local setup token to set or replace the Developer password."
        onClose={onClose}
      />
      <div className="dev-modal-body">
        {setup.data ? (
          <div className="space-y-4 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-300">
              <IconCheck className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">Password saved</h4>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Password access is ready for <strong>{setup.data.email}</strong>. The previous Developer PIN was removed.
              </p>
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
                placeholder="name@example.com"
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
            </div>
            <div>
              <label className="label" htmlFor="setup-password">New password</label>
              <div className="flex gap-2">
                <input
                  id="setup-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  minLength={12}
                  maxLength={128}
                  className="input min-w-0 flex-1 text-xs"
                  placeholder="Use at least 12 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="dev-btn-secondary text-xs"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? 'Hide new password' : 'Show new password'}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              <p className="mt-1 text-[11px] text-slate-400">The password is hashed before it is stored.</p>
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
                {setup.isPending ? 'Saving…' : 'Save password'}
              </button>
            </div>
          </form>
        )}
      </div>
    </ModalOverlay>
  );
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   Developer Workspace
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */

type Tab = 'overview' | 'businesses' | 'plans' | 'packages' | 'modules' | 'module-rights' | 'clients' | 'backup' | 'help' | 'create-business' | 'audit' | 'settings';

const INTERVAL_SUFFIX: Record<BillingInterval, string> = { monthly: 'mo', yearly: 'yr', lifetime: 'one-time' };
const ROLE_BADGE: Record<ProvisionableRole, { cls: string; short: string }> = {
  admin: { cls: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/30', short: 'Admin' },
  staff: { cls: 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30', short: 'Staff' },
  cashier: { cls: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30', short: 'Cashier' },
};
const MODULE_RIGHT_LABEL: Record<string, string> = Object.fromEntries(MODULE_RIGHTS.map((r) => [r.key, r.label]));

const navSections: { label: string; keys: readonly Tab[] }[] = [
    { label: 'Workspace', keys: ['overview'] },
    { label: 'Business Management', keys: ['businesses', 'plans', 'packages', 'create-business'] },
    { label: 'Platform Access', keys: ['modules', 'module-rights', 'clients'] },
    { label: 'Operations', keys: ['audit', 'backup', 'help'] },
    { label: 'System', keys: ['settings'] },
  ];

const accentPresets = [
  { name: 'Cobalt', color: '#2463eb' },
  { name: 'Teal', color: '#087d78' },
  { name: 'Violet', color: '#7652ce' },
  { name: 'Copper', color: '#b75528' },
];
const defaultAccent = accentPresets[0].color;

function accentForeground(hex: string) {
  const channels = [1, 3, 5].map((offset) => {
    const channel = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  return luminance > 0.179 ? '#000000' : '#ffffff';
}

function DeveloperWorkspace({ developerId }: { developerId: string }) {
  const accentKey = `pos-developer-accent:${developerId}`;
  const [accent, setAccent] = useState(() => {
    const stored = localStorage.getItem(accentKey);
    return stored && /^#[0-9a-f]{6}$/i.test(stored) ? stored.toLowerCase() : defaultAccent;
  });
  function chooseAccent(color: string) {
    setAccent(color);
    localStorage.setItem(accentKey, color);
  }
  const client = useQueryClient();
  const user = useAuth((state) => state.user);
  const logout = useAuth((state) => state.logout);
  const navigate = useNavigate();

  const [params, setParams] = useSearchParams();
  const activeTab = navSections.flatMap((group) => group.keys).find((key) => key === params.get('section')) ?? 'overview';
  function setActiveTab(tab: Tab) {
    if (tab === activeTab) return;
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      if (tab === 'overview') next.delete('section');
      else next.set('section', tab);
      return next;
    });
  }
  useEffect(() => { window.scrollTo(0, 0); }, [activeTab]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [navSearch, setNavSearch] = useState('');
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [businessSearch, setBusinessSearch] = useState('');
  const [businessSort, setBusinessSort] = useState('default');
  const [businessPage, setBusinessPage] = useState(1);
  const [businessFilter, setBusinessFilter] = useState<'all' | 'active' | 'suspended' | 'has-plan' | 'no-plan'>('all');
  const [editingPlan, setEditingPlan] = useState<SubscriptionPlan | null>(null);
  const [isCreatingPlan, setIsCreatingPlan] = useState(false);
  const [resetClient, setResetClient] = useState<ClientAccountEntry | null>(null);
  const resetClientPassword = useMutation({
    mutationFn: ({ businessId, accountId }: { businessId: string; accountId: string }) =>
      developerApi.resetClientPassword(businessId, accountId),
  });
  const [inspectingBusiness, setInspectingBusiness] = useState<BusinessPlanTarget | null>(null);
  const [renamingBusiness, setRenamingBusiness] = useState<BusinessPlanTarget | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [generatedPassword, setGeneratedPassword] = useState('');
  /* Package manager state */
  const [accountsForBusiness, setAccountsForBusiness] = useState<BusinessPlanTarget | null>(null);
  const [pendingAccounts, setPendingAccounts] = useState<(ProvisionAccountInput & { _key: string })[]>([]);
  const [seedAccountsOnProvision, setSeedAccountsOnProvision] = useState(true);
  const [provisionDomain, setProvisionDomain] = useState<DomainType>('retail');
  const [applyDomainDefaults] = useState(true);

  /** When the selected domain changes, refresh the pending accounts with that domain's package. */
  const applyDomainPackage = (domain: DomainType) => {
    setProvisionDomain(domain);
    const pkg = rolePackages.data?.[domain] ?? DOMAIN_ROLE_PACKAGES[domain] ?? DOMAIN_ROLE_PACKAGES.custom;
    setPendingAccounts(pkg.accounts.map((entry, i) => ({
      _key: `${entry.role}-${i}-${Date.now()}`,
      role: entry.role,
      name: '', email: '', password: '',
      moduleRights: [...entry.moduleRights],
    })));
  };

  /* Data Queries */
  const overview = useQuery({ queryKey: ['developer', 'overview'], queryFn: developerApi.overview });
  const catalog = useQuery({ queryKey: ['developer', 'features'], queryFn: developerApi.features });
  const featureKeys = Array.isArray(catalog.data) ? catalog.data.map((feature) => feature.key) : fallbackFeatureKeys;
  const featureNames = { ...fallbackFeatureNames, ...Object.fromEntries((Array.isArray(catalog.data) ? catalog.data : []).map((feature) => [feature.key, feature.label])) } as Record<FeatureKey, string>;
  const businesses = useQuery({ queryKey: ['developer', 'businesses'], queryFn: developerApi.businesses });
  const plans = useQuery({ queryKey: ['developer', 'plans'], queryFn: developerApi.plans });
  const rolePackages = useQuery({ queryKey: ['developer', 'role-packages'], queryFn: developerApi.rolePackages });
  const platformModules = useQuery({ queryKey: ['developer', 'modules'], queryFn: developerApi.modules, enabled: activeTab === 'modules' || activeTab === 'module-rights' });
  const clientAccounts = useQuery({ queryKey: ['developer', 'clients'], queryFn: developerApi.clients, enabled: activeTab === 'clients' || activeTab === 'module-rights' });
  const deliveryOptions = useQuery({ queryKey: ['developer', 'backup-options'], queryFn: developerApi.backupOptions, enabled: activeTab === 'backup' });
  const cloudDelivery = useMutation({ mutationFn: developerApi.deliverBackup, onSuccess: (result) => showToast('success', `Backup ${result.status}.`), onError: () => showToast('error', 'Delivery could not be confirmed. Check the destination before retrying or download ZIP.') });
  const [backupBusy, setBackupBusy] = useState(false);
  const backupQuery = useQuery({ queryKey: ['developer', 'backup-preview'], queryFn: developerApi.backup, enabled: activeTab === 'backup' });
  const auditLogs = useQuery({
    queryKey: ['developer', 'audit'],
    queryFn: () => developerApi.audit(50),
    enabled: activeTab === 'audit' || activeTab === 'overview',
  });

  const refresh = () => {
    return client.invalidateQueries({ queryKey: ['developer'] });
  };

  const sectionQueries = {
    overview: [overview, businesses, plans, auditLogs], businesses: [businesses, plans, catalog],
    plans: [plans, catalog], packages: [rolePackages, businesses], modules: [platformModules],
    'module-rights': [platformModules, businesses], clients: [clientAccounts],
    backup: [backupQuery, deliveryOptions], help: [], 'create-business': [rolePackages, plans],
    audit: [auditLogs], settings: [],
  }[activeTab];
  const failedQueries = sectionQueries.filter((query) => query.isError);

  /* Seed the recommended role package once the catalogue loads (or the provision tab opens empty). */
  useEffect(() => {
    if (pendingAccounts.length === 0 && seedAccountsOnProvision) {
      const pkg = rolePackages.data?.[provisionDomain] ?? DOMAIN_ROLE_PACKAGES[provisionDomain] ?? DOMAIN_ROLE_PACKAGES.custom;
      setPendingAccounts(pkg.accounts.map((entry, i) => ({
        _key: `${entry.role}-${i}-${Date.now()}`,
        role: entry.role,
        name: '', email: '', password: '',
        moduleRights: [...entry.moduleRights],
      })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rolePackages.data]);

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
      showToast('success', `Business “${business.name}â€ provisioned successfully.`);
      setActiveTab('businesses');
      setGeneratedPassword('');
      return refresh();
    },
    onError: (error) => showToast('error', errorMessage(error)),
  });

  const updateBusiness = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { name?: string; status?: 'active' | 'suspended'; deploymentMode?: 'cloud' | 'offline' | 'hybrid'; branchLimit?: number; licenseExpiresAt?: string } }) =>
      developerApi.updateBusiness(id, body),
    onSuccess: (_, vars) => {
      showToast('success', vars.body.status ? `Business status set to ${vars.body.status}.` : 'Business updated.');
      setRenamingBusiness(null);
      return refresh();
    },
    onError: (error) => showToast('error', errorMessage(error)),
  });

  const assignPlan = useMutation({
    mutationFn: ({ id, planId }: { id: string; planId: string }) => developerApi.assignPlan(id, planId),
    onSuccess: () => {
      showToast('success', 'Plan assigned and feature entitlements synchronized.');
      return refresh();
    },
    onError: (error) => showToast('error', errorMessage(error)),
  });

  const createModule = useMutation({
    mutationFn: developerApi.createModule,
    onSuccess: () => { showToast('success', 'Module entitlement registered.'); return refresh(); },
    onError: (error) => showToast('error', errorMessage(error)),
  });
  const updateModule = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { label?: string; description?: string; isActive?: boolean } }) => developerApi.updateModule(id, body),
    onSuccess: () => { showToast('success', 'Module updated.'); return refresh(); },
    onError: (error) => showToast('error', errorMessage(error)),
  });
  const deleteModule = useMutation({
    mutationFn: developerApi.deleteModule,
    onSuccess: () => { showToast('success', 'Module removed.'); return refresh(); },
    onError: (error) => showToast('error', errorMessage(error)),
  });

  const provisionAccounts = useMutation({
    mutationFn: ({ id, accounts }: { id: string; accounts: ProvisionAccountInput[] }) => developerApi.provisionAccounts(id, accounts),
    onSuccess: (result, vars) => {
      const business = businesses.data?.find((b) => b.businessId === vars.id);
      showToast('success', `${result.created.length} account${result.created.length === 1 ? '' : 's'} provisioned for ${business?.name ?? 'tenant'}.`);
      setAccountsForBusiness(null);
      setPendingAccounts([]);
      return refresh();
    },
    onError: (error) => showToast('error', errorMessage(error)),
  });

  const updateFeatures = useMutation({
    mutationFn: ({ id, featureFlags }: { id: string; featureFlags: Partial<FeatureFlags> }) =>
      developerApi.updateFeatures(id, featureFlags),
    onSuccess: () => {
      showToast('success', 'Feature entitlement updated.');
      return refresh();
    },
    onError: (error) => showToast('error', errorMessage(error)),
  });

  const createPlan = useMutation({
    mutationFn: developerApi.createPlan,
    onSuccess: () => {
      showToast('success', 'Subscription plan created successfully.');
      setIsCreatingPlan(false);
      return refresh();
    },
    onError: (error) => showToast('error', errorMessage(error)),
  });

  const updatePlan = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<Omit<SubscriptionPlan, '_id'>> }) =>
      developerApi.updatePlan(id, body),
    onSuccess: () => {
      showToast('success', 'Subscription plan updated.');
      setEditingPlan(null);
      return refresh();
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
    return businessSort === 'default' ? list : [...list].sort((a, b) =>
      businessSort === 'name-desc' ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name));
  }, [businesses.data, businessSearch, businessFilter, businessSort]);
  const businessPageCount = Math.max(1, Math.ceil(filteredBusinesses.length / 12));
  const currentBusinessPage = Math.min(businessPage, businessPageCount);
  const visibleBusinesses = filteredBusinesses.slice((currentBusinessPage - 1) * 12, currentBusinessPage * 12);
  useEffect(() => { setBusinessPage(1); }, [businessSearch, businessFilter, businessSort]);

  useEffect(() => {
    if (!businesses.data) return;
    setInspectingBusiness((current) => current ? businesses.data.find((business) => business.businessId === current.businessId) ?? null : null);
  }, [businesses.data]);

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(text);
      showToast('success', 'Business ID copied.');
      setTimeout(() => setCopiedId(null), 2500);
    } catch {
      showToast('error', 'Clipboard access is unavailable. Select and copy the business ID manually.');
    }
  };

  /** Opens the account-provisioning modal pre-loaded with a domain role package. */
  const openAccountsModal = (business: BusinessPlanTarget, pkg?: DomainRolePackage) => {
    const preset = pkg ?? DOMAIN_ROLE_PACKAGES[(business.domainType ?? 'custom') as DomainType] ?? DOMAIN_ROLE_PACKAGES.custom;
    setAccountsForBusiness(business);
    setPendingAccounts(preset.accounts.map((entry, idx) => ({
      _key: `${entry.role}-${idx}-${Date.now()}`,
      role: entry.role,
      name: '',
      email: '',
      password: '',
      moduleRights: [...entry.moduleRights],
    })));
  };

  const generateStrongPassword = () => {
    const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*';
    let pwd = '';
    for (const value of crypto.getRandomValues(new Uint32Array(16))) {
      pwd += chars.charAt(value % chars.length);
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
        ownerPhone: String(form.get('ownerPhone') || '').replace(/[^0-9+]/g, ''),
        ownerPassword: String(form.get('ownerPassword')),
        currency: String(form.get('currency') || 'PKR'),
        address: String(form.get('address') || ''),
        initialPlanId: initialPlanId || undefined,
        ...(seedAccountsOnProvision && pendingAccounts.length
          ? { accounts: pendingAccounts.map(({ role, name, email, password, moduleRights }) => ({ role, name, email, password, moduleRights })) }
          : {}),
      },
      {
        onSuccess: (business) => {
          if (business.seededAccounts?.length) {
            showToast('success', `${business.seededAccounts.length} role account${business.seededAccounts.length === 1 ? '' : 's'} seeded alongside the owner.`);
          }
        },
      },
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
      domainType: (String(form.get('domainType') || '') || undefined) as DomainType | undefined,
      name: String(form.get('name')),
      description: String(form.get('description') || ''),
      price: Number(form.get('price')),
      billingInterval: String(form.get('billingInterval')) as BillingInterval,
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
        domainType: (String(form.get('domainType') || '') || null) as DomainType | null,
        name: String(form.get('name')),
        description: String(form.get('description') || ''),
        price: Number(form.get('price')),
        billingInterval: String(form.get('billingInterval')) as BillingInterval,
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
      if (!b.subscriptionPlanId || b.status === 'suspended') return acc;
      const plan = planMap.get(b.subscriptionPlanId);
      if (!plan) return acc;
      const monthlyAmount = plan.billingInterval === 'yearly' ? plan.price / 12 : plan.billingInterval === 'lifetime' ? plan.price / 36 : plan.price;
      return acc + monthlyAmount;
    }, 0);
  }, [businesses.data, plans.data]);

  const tabs: { key: Tab; label: string; icon: ReactNode; badge?: number }[] = [
    { key: 'overview', label: 'Overview', icon: <IconActivity className="w-[18px] h-[18px]" /> },
    { key: 'businesses', label: 'Businesses', icon: <IconBuilding className="w-[18px] h-[18px]" />, badge: totalBusinesses },
    { key: 'plans', label: 'Plans', icon: <IconBadge className="w-[18px] h-[18px]" />, badge: plans.data?.length },
    { key: 'packages', label: 'Packages', icon: <IconCube className="w-[18px] h-[18px]" /> },
    { key: 'modules', label: 'Modules', icon: <IconSettings className="w-[18px] h-[18px]" /> },
    { key: 'module-rights', label: 'Module Rights', icon: <IconShield className="w-[18px] h-[18px]" /> },
    { key: 'clients', label: 'Clients', icon: <IconBuilding className="w-[18px] h-[18px]" /> },
    { key: 'backup', label: 'Backup', icon: <IconBackup className="w-[18px] h-[18px]" /> },
    { key: 'help', label: 'Help', icon: <IconHelp className="w-[18px] h-[18px]" /> },
    { key: 'create-business', label: 'Provision', icon: <IconPlus className="w-[18px] h-[18px]" /> },
    { key: 'audit', label: 'Audit Log', icon: <IconClock className="w-[18px] h-[18px]" />, badge: auditLogs.data?.length },
    { key: 'settings', label: 'Settings', icon: <IconSettings className="w-[18px] h-[18px]" /> },
  ];
  const normalizedNavSearch = navSearch.trim().toLowerCase();
  const visibleNavSections = navSections.map((section) => {
    const sectionMatches = section.label.toLowerCase().includes(normalizedNavSearch);
    const items = section.keys.flatMap((key) => {
      const tab = tabs.find((item) => item.key === key);
      return tab && (!normalizedNavSearch || sectionMatches || tab.label.toLowerCase().includes(normalizedNavSearch)) ? [tab] : [];
    });
    return { ...section, items };
  }).filter((section) => section.items.length > 0);

  const pageTitle =
    activeTab === 'overview' ? 'Developer Dashboard'
      : activeTab === 'businesses' ? 'Business Tenants'
        : activeTab === 'plans' ? 'Subscription Plans'
          : activeTab === 'packages' ? 'Account Packages'
            : activeTab === 'modules' ? 'Module Entitlements'
              : activeTab === 'module-rights' ? 'Module Rights Control'
                : activeTab === 'clients' ? 'Client Accounts'
                : activeTab === 'backup' ? 'Backup & Snapshot'
                  : activeTab === 'help' ? 'Help & Playbook'
                    : activeTab === 'create-business' ? 'Provision Tenant'
                  : activeTab === 'audit' ? 'Audit & Telemetry'
                    : 'Console Settings';

  const pageSubtitle =
    activeTab === 'overview' ? 'Review business activity, plan coverage, and estimated monthly revenue.'
      : activeTab === 'businesses' ? 'Manage tenant organizations, assign plans, and toggle module entitlements.'
        : activeTab === 'plans' ? 'Configure subscription tiers, pricing, and baseline features.'
          : activeTab === 'packages' ? 'Per-industry account bundles the owner rolls out as admin, staff & cashier accounts.'
            : activeTab === 'modules' ? 'Register new module entitlements and manage the platform catalogue.'
              : activeTab === 'module-rights' ? 'Assign MOD- ids, enable/disable modules and manage sub-module rights per account package.'
                : activeTab === 'clients' ? 'Every account across all tenants — contacts and verification status (no secrets).'
                : activeTab === 'backup' ? 'Download a ZIP export of platform and business records, with a checksum manifest.'
                  : activeTab === 'help' ? 'Standard patterns, account hierarchy, and step-by-step playbooks for the engine.'
                    : activeTab === 'create-business' ? 'Onboard a new organization with root Owner credentials.'
                  : activeTab === 'audit' ? 'Live security and administrative event stream from the POS platform.'
                    : 'Developer console appearance and workspace preferences.';

  const signOut = () => {
    logout();
    client.clear();
    navigate('/developer', { replace: true });
  };

  /* License & subscription alerts derived only from real backend records. */
  const consoleAlerts = (() => {
    const alerts: { id: string; tone: 'warning' | 'danger'; title: string; detail: string; actionLabel: string; onAction: () => void }[] = [];
    const now = Date.now();
    const in30Days = now + 30 * 24 * 60 * 60 * 1000;
    for (const b of businesses.data ?? []) {
      if (b.status === 'suspended') {
        alerts.push({ id: `susp-${b.businessId}`, tone: 'danger', title: `${b.name} suspended`, detail: 'Tenant API access is disabled until reactivation.', actionLabel: 'Review', onAction: () => { setActiveTab('businesses'); setInspectingBusiness(b); } });
      }
      if (b.licenseExpiresAt) {
        const expiry = new Date(b.licenseExpiresAt).getTime();
        if (!Number.isNaN(expiry) && expiry <= in30Days) {
          alerts.push({
            id: `lic-${b.businessId}`,
            tone: expiry <= now ? 'danger' : 'warning',
            title: expiry <= now ? `${b.name} license expired` : `${b.name} license expiring`,
            detail: expiry <= now ? 'Expired license — review deployment entitlement.' : `Expires ${fmtDateTime(b.licenseExpiresAt)}.`,
            actionLabel: 'Open',
            onAction: () => { setActiveTab('businesses'); setInspectingBusiness(b); },
          });
        }
      }
    }
    return alerts;
  })();

  const userInitial = (user?.name?.charAt(0) || 'D').toUpperCase();

  const accountControls = (
    <div className="dev-header-account" role="group" aria-label="Developer account">
      <span className="dev-avatar !h-8 !w-8 !text-xs" aria-hidden="true">{userInitial}</span>
      <div className="dev-header-identity">
        <strong dir="auto" title={user?.name}>{user?.name || 'Developer'}</strong>
        {user?.email && <span title={user.email}>{user.email}</span>}
      </div>
      <button type="button" className="dev-header-signout" onClick={signOut}>
        <IconLogout className="h-4 w-4" /> Sign out
      </button>
    </div>
  );

  return (
    <div style={{ '--dev-accent': accent, '--dev-on-accent': accentForeground(accent) } as CSSProperties} className={`dev-workspace${sidebarCollapsed ? ' dev-workspace-collapsed' : ''}`}>
      <a className="dev-skip-link" href="#developer-content">Skip to content</a>
      {/* ─── Desktop Sidebar ─── */}
      <aside className="dev-sidebar">
        {/* Brand */}
        <div className="dev-sidebar-brand flex items-center gap-3 px-2 pt-1">
          <span className="dev-brand-mark !h-10 !w-10">
            <KazmiLogo className="w-5 h-5" />
          </span>
          <div className="dev-brand-copy min-w-0">
            <h1 className="truncate text-sm font-bold tracking-tight text-slate-900 dark:text-white">Developer Engine</h1>
            <p className="dev-brand-subtitle"><span className="dev-brand-status" aria-hidden="true" /> Platform console</p>
          </div>
        </div>

        {/* Nav Items */}
        <nav id="developer-navigation" className="dev-nav-list flex-1" aria-label="Developer navigation">
          <div className="dev-nav-filter">
            <IconSearch className="dev-nav-filter-icon" />
            <input
              type="text"
              aria-label="Filter navigation"
              placeholder="Find a section"
              autoComplete="off"
              value={navSearch}
              onChange={(event) => setNavSearch(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Escape') setNavSearch(''); }}
            />
            {navSearch && (
              <button type="button" className="dev-nav-filter-clear" aria-label="Clear navigation filter" onClick={() => setNavSearch('')}>
                <IconClose className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          {visibleNavSections.map((section) => (
            <div key={section.label} className="dev-nav-section">
              <h2 className="dev-nav-caption">{section.label}</h2>
              <div className="dev-nav-items">
                {section.items.map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setActiveTab(tab.key)}
                      className={`dev-nav-item ${activeTab === tab.key ? 'dev-nav-item-active' : ''}`}
                      aria-current={activeTab === tab.key ? 'page' : undefined}
                      aria-label={tab.label}
                      title={sidebarCollapsed ? tab.label : undefined}
                    >
                      <span className="dev-nav-icon">{tab.icon}</span>
                      <span className="dev-nav-label">{tab.label}</span>
                      {tab.badge !== undefined && tab.badge > 0 && (
                        <span className="dev-nav-badge">{tab.badge > 99 ? '99+' : tab.badge}</span>
                      )}
                    </button>
                ))}
              </div>
            </div>
          ))}
          {visibleNavSections.length === 0 && <p className="dev-nav-empty" role="status">No sections found</p>}
        </nav>

        {/* Sidebar Footer */}
        <div className="dev-sidebar-footer">
          <div className="dev-sidebar-tools">
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

          </div>
        </div>
      </aside>

      {/* ─── Mobile Header ─── */}
      <header className="dev-mobile-header">
        <div className="flex items-center gap-2.5">
          <div>
            <h1 className="text-sm font-bold text-slate-900 dark:text-white">Dev Engine</h1>
            <p className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">Kazmi POS</p>
          </div>
        </div>
        {accountControls}
      </header>

      {/* ─── Main Content ─── */}
      <main className="dev-main" id="developer-content" tabIndex={-1}>
        <header className="dev-topbar">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <button type="button" className="dev-icon-btn dev-collapse-toggle"
              onClick={() => setSidebarCollapsed((value) => !value)}
              aria-expanded={!sidebarCollapsed} aria-controls="developer-navigation"
              aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
              <IconArrowLeft className={`w-4 h-4${sidebarCollapsed ? ' rotate-180' : ''}`} />
            </button>
            <span className="dev-topbar-brand whitespace-nowrap">KazmiOn <span aria-hidden="true">/</span> <strong>Developer Engine</strong></span>
            {businesses.data && plans.data && (
              <DevConsoleSearch
                businesses={businesses.data}
                plans={plans.data}
                onOpenBusiness={(business) => { setActiveTab('businesses'); setInspectingBusiness(business); }}
                onOpenPlan={(plan) => { setActiveTab('plans'); setEditingPlan(plan); }}
              />
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div className="dev-mobile-tools">
              <Link className="dev-icon-btn" to="/recover?purpose=password&source=developer" title="Account security" aria-label="Account security"><IconLock className="w-4 h-4" /></Link>
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
            </div>
            <DevNotificationCenter alerts={consoleAlerts} />
            <Link to="/recover?purpose=password&source=developer" className="dev-topbar-security"><IconLock className="w-4 h-4" /> Account security</Link>
            <div className="dev-desktop-account">{accountControls}</div>
          </div>
        </header>
        <div className="dev-mobile-section">
          <label htmlFor="developer-section">Workspace section</label>
          <select id="developer-section" className="input" value={activeTab} onChange={(event) => setActiveTab(event.target.value as Tab)}>
            {navSections.map((section) => (
              <optgroup key={section.label} label={section.label}>
                {section.keys.map((key) => {
                  const tab = tabs.find((item) => item.key === key);
                  return tab ? <option key={tab.key} value={tab.key}>{tab.label}</option> : null;
                })}
              </optgroup>
            ))}
          </select>
        </div>
        {/* Page Header */}
        <div className={`dev-page-header${activeTab === 'overview' ? ' dev-overview-header' : ''}`}>
          <div className="min-w-0">
            
            <h2 className="dev-page-title" aria-live="polite">{pageTitle}</h2>
            <p className="dev-page-subtitle">{pageSubtitle}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="dev-live-pill" data-state={failedQueries.length || isError || overview.isError ? 'error' : isLoading || overview.isPending ? 'loading' : 'ready'} role="status" title="Status of developer API requests">
              <span className="dev-live-dot" />
              {failedQueries.length || isError || overview.isError ? 'Connection issue' : isLoading || overview.isPending ? 'Connecting…' : 'Engine connected'}
            </span>
            {['businesses', 'plans', 'overview'].includes(activeTab) && (
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
          {failedQueries.length > 0 && (
            <div className="dev-card dev-query-state" role="alert">
              <div><strong>Some section data could not be loaded.</strong><p>Displayed records may be incomplete or outdated.</p></div>
              <button type="button" className="dev-btn-secondary" disabled={failedQueries.some((query) => query.isFetching)}
                onClick={() => { void Promise.all(failedQueries.map((query) => query.refetch())); }}>Retry section</button>
            </div>
          )}
          {sectionQueries.some((query) => query.isLoading) && <p className="dev-query-state" role="status">Loading section data...</p>}
          {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
             TAB: OVERVIEW
             â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Platform Statistics */}
              <section className="dev-metrics-grid" aria-label="Platform telemetry">
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
                  hint="Platform features"
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

              {businesses.data && (
                <section className="dev-card dev-business-review" aria-labelledby="review-heading">
                  <h3 id="review-heading">Business review</h3>
                  <div className="dev-review-actions">
                    {([
                      ['suspended', 'Suspended businesses', totalBusinesses - activeBusinesses],
                      ['no-plan', 'Businesses without a plan', totalBusinesses - assignedBusinesses],
                    ] as const).map(([filter, label, count]) => (
                      <button key={filter} type="button" onClick={() => {
                        setBusinessSearch('');
                        setBusinessPage(1);
                        setBusinessFilter(filter);
                        setActiveTab('businesses');
                      }}>
                        <span>{label}</span><strong>{count}</strong><span aria-hidden="true">&rarr;</span>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {/* Recent Activity Stream */}
              <div className="dev-card p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">Recent platform activity</h3>
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

          {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
             TAB: BUSINESSES
             â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
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
                        aria-label="Clear business search"
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
                      aria-pressed={businessFilter === filter}
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
              <div className="flex flex-wrap gap-3 items-center justify-between text-xs text-slate-500 dark:text-slate-400 px-1">
                <p role="status">
                  <strong>{filteredBusinesses.length}</strong> of {totalBusinesses} tenants · Page {currentBusinessPage} of {businessPageCount}
                </p>
                <label className="flex items-center gap-2">Sort by
                  <select className="input" value={businessSort} onChange={(event) => setBusinessSort(event.target.value)}>
                    <option value="default">Default order</option><option value="name-asc">Name: A–Z</option><option value="name-desc">Name: Z–A</option>
                  </select>
                </label>
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
                  {visibleBusinesses.map((b) => {
                    const isSuspended = b.status === 'suspended';
                    const assigning = assignPlan.isPending && assignPlan.variables?.id === b.businessId;
                    const toggling = updateFeatures.isPending && updateFeatures.variables?.id === b.businessId;
                    const updatingBiz = updateBusiness.isPending && updateBusiness.variables?.id === b.businessId;

                    return (
                      <article key={b.businessId} className="dev-card dev-card-hover p-0 overflow-hidden">
                        {/* Card Header */}
                        <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between">
                          <div className="flex min-w-0 flex-1 items-start gap-3">
                            <BusinessAvatar name={b.name} logoUrl={b.logoUrl} domainType={b.domainType} />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className={`truncate text-sm font-bold text-slate-900 dark:text-white ${urduClass(b.name)}`} dir={urduClass(b.name) ? 'rtl' : undefined}>{b.name}</h3>
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
                                disabled={assignPlan.isPending || updateFeatures.isPending || !plans.data?.some((plan) => plan.isActive)}
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
                                    <option key={p._id} value={p._id} disabled={!p.isActive}>
                                      {p.name} — {formatMoney(p.price)}/{INTERVAL_SUFFIX[p.billingInterval] ?? p.billingInterval}
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
                                disabled={updateBusiness.isPending}
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
                              <button
                                type="button"
                                onClick={() => openAccountsModal(b)}
                                className="text-[11px] font-semibold px-2.5 py-1 rounded-lg border border-indigo-500/30 bg-indigo-500/10 text-indigo-600 hover:bg-indigo-500/20 dark:text-indigo-300 transition"
                              >
                                <IconCube className="mr-1 inline w-3 h-3" /> Accounts
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
                              const isEnabled = key === 'data-sync' ? b.featureFlags?.['data-sync'] === true : b.featureFlags?.[key] !== false;
                              return (
                                <button
                                  key={key}
                                  type="button"
                                  role="switch"
                                  aria-checked={isEnabled}
                                  disabled={updateFeatures.isPending || assignPlan.isPending}
                                  onClick={() => {
                                    updateFeatures.mutate({
                                      id: b.businessId,
                                      featureFlags: { [key]: !isEnabled },
                                    });
                                  }}
                                  className={`dev-switch-pill ${isEnabled ? 'is-on' : 'is-off'}`}
                                  title={`Click to ${isEnabled ? 'disable' : 'enable'} ${featureNames[key]} module`}
                                >
                                  <span className="dev-switch-icon">{featureIcons[key]?.({ className: 'w-3.5 h-3.5' })}</span>
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
                      ? `No businesses found matching “${businessSearch}â€. Try clearing your search.`
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

          {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
             TAB: PLANS
             â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
          {activeTab === 'businesses' && businessPageCount > 1 && (
            <nav className="dev-pagination" aria-label="Business pages">
              <button type="button" className="dev-btn-secondary" disabled={currentBusinessPage === 1} onClick={() => setBusinessPage(currentBusinessPage - 1)}>Previous page</button>
              <span role="status">Page {currentBusinessPage} of {businessPageCount}</span>
              <button type="button" className="dev-btn-secondary" disabled={currentBusinessPage === businessPageCount} onClick={() => setBusinessPage(currentBusinessPage + 1)}>Next page</button>
            </nav>
          )}
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
                          <span className="dev-plan-interval">/ {INTERVAL_SUFFIX[plan.billingInterval] ?? plan.billingInterval}</span>
                          {plan.billingInterval === 'lifetime' && (
                            <span className="ml-2 rounded-md bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-bold uppercase text-violet-700 dark:text-violet-300">Lifetime</span>
                          )}
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
                                    {featureIcons[key]?.({ className: 'w-3.5 h-3.5' })}
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

          {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
             TAB: ACCOUNT PACKAGES (Package Manager)
             â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
          {activeTab === 'packages' && (
            <section className="space-y-4">
              <div className="dev-card p-4">
                <div className="flex items-start gap-3">
                  <span className="dev-avatar !h-10 !w-10 !rounded-xl"><IconCube className="w-5 h-5" /></span>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">Business Account Packages</h3>
                    <p className="mt-0.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                      Every business type ships with a bundle of recommended accounts. The developer provisions the business owner,
                      and the owner (or you, on their behalf) creates admins, staff and cashiers as the business demands — a restaurant
                      gets a Manager, Kitchen/Wait Staff and Cashier; a pharmacy gets a Pharmacy Manager, Dispensary Staff and Cashier, and so on.
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {(Object.entries(rolePackages.data ?? DOMAIN_ROLE_PACKAGES) as [DomainType, DomainRolePackage][]).map(([domain, pkg]) => (
                  <div key={domain} className="dev-plan-card">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="flex items-center gap-2 text-[15px] font-bold tracking-tight text-slate-900 dark:text-white">
                          <span aria-hidden="true">{pkg.icon}</span> {pkg.label}
                        </h3>
                        <p className="mt-0.5 text-[11px] capitalize text-slate-500 dark:text-slate-400">domain: {domain}</p>
                      </div>
                      <span className="dev-plan-badge is-active">{pkg.accounts.length} roles</span>
                    </div>

                    <div className="mt-3 space-y-2">
                      {pkg.accounts.map((entry, idx) => (
                        <div key={`${domain}-${entry.role}-${idx}`} className="rounded-lg border border-slate-200 p-2.5 dark:border-slate-700">
                          <div className="flex items-center justify-between gap-2">
                            <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${ROLE_BADGE[entry.role].cls}`}>
                              {ROLE_BADGE[entry.role].short}
                            </span>
                            <span className="text-xs font-bold text-slate-800 dark:text-slate-100">{entry.title}</span>
                          </div>
                          <p className="mt-1 text-[10px] leading-snug text-slate-500 dark:text-slate-400">{entry.description}</p>
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {entry.moduleRights.map((right) => (
                              <span key={right} className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                {MODULE_RIGHT_LABEL[right] ?? right}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="dev-plan-actions mt-3">
                      <button
                        type="button"
                        onClick={() => { setSeedAccountsOnProvision(true); setActiveTab('create-business'); }}
                        className="dev-btn-secondary flex-1 text-xs justify-center"
                      >
                        <IconBuilding className="w-3.5 h-3.5" /> Provision with
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const candidates = businesses.data?.filter((b) => (b.domainType ?? 'custom') === domain && b.status !== 'suspended') ?? [];
                          if (candidates.length === 1) {
                            openAccountsModal(candidates[0], pkg);
                          } else {
                            if (candidates.length > 1) {
                              showToast('success', `${candidates.length} ${pkg.label} tenants found — pick one under Businesses → Accounts.`);
                            } else {
                              showToast('error', `No ${pkg.label} tenant yet — provision one first.`);
                            }
                          }
                        }}
                        className="dev-btn-primary flex-1 text-xs justify-center"
                      >
                        <IconPlus className="w-3.5 h-3.5" /> Apply to Tenant
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
             TAB: BACKUP
             â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
          {activeTab === 'backup' && (() => {
            const snap = backupQuery.data;
            const downloadSnapshot = async () => {
              setBackupBusy(true);
              try {
                const fresh = await developerApi.backup();
                const file = await createBackupZip(fresh);
                const url = URL.createObjectURL(file);
                const link = document.createElement('a');
                link.href = url; link.download = file.name; link.click();
                setTimeout(() => URL.revokeObjectURL(url), 10_000);
                showToast('success', 'ZIP prepared. Attach it to an email or upload it to your Drive folder.');
              } catch { showToast('error', 'Backup failed. Please retry.'); }
              finally { setBackupBusy(false); }
            };
            return (
              <section className="space-y-4">
                <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                  <StatCard icon={<IconBuilding className="w-4 h-4" />} label="Businesses" value={snap?.meta.counts.businesses ?? '—'} hint={`${snap?.meta.counts.activeBusinesses ?? '—'} active`} tone="accent" />
                  <StatCard icon={<IconCube className="w-4 h-4" />} label="Accounts" value={snap?.meta.counts.accounts ?? '—'} hint="Owners, admins, staff, cashiers" tone="success" />
                  <StatCard icon={<IconBadge className="w-4 h-4" />} label="Plans" value={snap?.meta.counts.plans ?? '—'} hint={`${snap?.meta.counts.customModules ?? '—'} custom modules`} tone="default" />
                  <StatCard icon={<IconClock className="w-4 h-4" />} label="Audit Tail" value={snap?.meta.counts.auditEvents ?? '—'} hint="Total events on record" tone="warning" />
                </div>

                <div className="dev-card p-5 space-y-4">
                  <div className="flex items-start gap-3">
                    <span className="dev-avatar !h-10 !w-10 !rounded-xl"><IconCube className="w-5 h-5" /></span>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">Platform & Business ZIP Export</h3>
                      <p className="mt-0.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                        Downloads a ZIP containing platform settings, accounts, branches, products, customers, orders, installment records, stock adjustments and audit events.
                        All credentials (password hashes, PINs, verification codes) are stripped before download.
                      </p>
                    </div>
                  </div>
                  {snap && (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-500 dark:border-slate-700 dark:bg-slate-800/60">
                      <span className="font-semibold text-slate-700 dark:text-slate-200">Last preview:</span> generated {fmtDateTime(snap.meta.generatedAt)} · v{snap.meta.version} · {snap.meta.generator}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="dev-btn-primary text-xs" disabled={backupQuery.isFetching} onClick={() => backupQuery.refetch()}>
                      <IconRefresh className={`w-3.5 h-3.5 ${backupQuery.isFetching ? 'spinning' : ''}`} /> Refresh Preview
                    </button>
                    <button type="button" className="dev-btn-secondary text-xs" disabled={backupBusy || backupQuery.isFetching} onClick={() => void downloadSnapshot()}>
                      <IconCopy className="w-3.5 h-3.5" /> {backupBusy ? 'Preparing ZIP...' : 'Download ZIP Backup'}
                    </button>
                  </div>
                  <p className="text-xs text-slate-500">Offline/local mode: download ZIP using the local server. Cloud mode: send to a configured email or Drive destination. ZIP download remains available.</p>
                  <div className="flex flex-wrap gap-2">
                    <button className="dev-btn-secondary text-xs" disabled={!deliveryOptions.data?.email || cloudDelivery.isPending} onClick={() => cloudDelivery.mutate('email')}>Send ZIP by email{deliveryOptions.data?.emailTo ? ` to ${deliveryOptions.data.emailTo}` : ' (not configured)'}</button>
                    <button className="dev-btn-secondary text-xs" disabled={!deliveryOptions.data?.drive || cloudDelivery.isPending} onClick={() => cloudDelivery.mutate('drive')}>Upload ZIP to Drive{!deliveryOptions.data?.drive ? ' (not configured)' : ''}</button>
                    {cloudDelivery.isPending && <span role="status">Preparing and delivering backup...</span>}
                  </div>
                  <a className="dev-btn-secondary text-xs" href="https://drive.google.com/drive/my-drive" target="_blank" rel="noopener noreferrer">Open Google Drive</a>
                  {backupQuery.isError && (
                    <div className="dev-inline-alert" role="alert"><IconAlert className="w-4 h-4 flex-shrink-0" /><span>Snapshot failed — retry in a moment.</span></div>
                  )}
                </div>

                <div className="dev-card p-5">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Restore Guidance</h3>
                  <ul className="mt-2 space-y-1.5 text-xs text-slate-500 dark:text-slate-400">
                    <li>Store the ZIP securely in your mail archive, Drive folder, or backup storage.</li>
                    <li>This is a sanitized logical export, not a point-in-time recovery image. Keep MongoDB backups and uploaded files separately.</li>
                    <li>Credentials and sessions are excluded. Restore requires an operator-reviewed import and an account recovery plan.</li>
                    <li>Verify manifest checksums and original record relationships before importing.</li>
                  </ul>
                </div>
              </section>
            );
          })()}

          {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
             TAB: HELP
             â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
          {activeTab === 'help' && (
            <section className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="dev-card p-5 space-y-3">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Access Hierarchy</h3>
                  <ol className="space-y-2 text-xs text-slate-500 dark:text-slate-400">
                    <li><strong className="text-slate-800 dark:text-slate-200">1. Developer Engine</strong> — provisions tenants, assigns plans/modules, seeds accounts, holds backups.</li>
                    <li><strong className="text-slate-800 dark:text-slate-200">2. Business Owner</strong> — full control of their own tenant; manages settings, staff and module usage.</li>
                    <li><strong className="text-slate-800 dark:text-slate-200">3. Admin</strong> — delegated back-office manager; cannot manage other admins.</li>
                    <li><strong className="text-slate-800 dark:text-slate-200">4. Staff / Cashier</strong> — scoped module rights only (POS, orders, scanning…).</li>
                  </ol>
                </div>

                <div className="dev-card p-5 space-y-3">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Standard Identity Pattern</h3>
                  <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                    Every account surface renders the same identity: tenant logo if uploaded, else a brand-gradient monogram keyed to the business domain.
                    Names typed in Urdu automatically render right-to-left in <span className="font-semibold">Noori Nastaleeq</span>.
                  </p>
                  <div className="flex flex-wrap gap-2 text-[10px] font-semibold">
                    {[['restaurant', 'Orange'], ['retail', 'Kazmi Blue'], ['supermarket', 'Emerald'], ['grocery', 'Lime'], ['pharmacy', 'Sky'], ['electronics', 'Violet'], ['salon', 'Fuchsia'], ['custom', 'Slate']].map(([domain, tone]) => (
                      <span key={domain} className="rounded-md bg-slate-100 px-2 py-1 capitalize text-slate-600 dark:bg-slate-800 dark:text-slate-300">{domain}: {tone}</span>
                    ))}
                  </div>
                </div>

                <div className="dev-card p-5 space-y-3">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Playbook: Onboard a Business</h3>
                  <ol className="list-inside list-decimal space-y-1.5 text-xs text-slate-500 dark:text-slate-400">
                    <li>Pick the domain — its <strong>account package</strong> loads (admin/staff/cashier presets).</li>
                    <li>Fill business name, owner name/email, <strong>phone</strong> (used for reset &amp; verification) and password.</li>
                    <li>Optionally attach an initial plan — module entitlements sync instantly.</li>
                    <li>Provision — role accounts are created with the owner in one transaction.</li>
                  </ol>
                </div>

                <div className="dev-card p-5 space-y-3">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Playbook: Plans & Modules</h3>
                  <ol className="list-inside list-decimal space-y-1.5 text-xs text-slate-500 dark:text-slate-400">
                    <li>Create plans under <strong>Plans</strong> — monthly, yearly or lifetime billing.</li>
                    <li>Tick the modules each tier includes; new custom modules from <strong>Modules</strong> appear automatically.</li>
                    <li>Assign/switch a plan on a business card — entitlements propagate to the tenant in real time.</li>
                    <li>Archived plans stay assignable-history; new tenants can only pick active ones.</li>
                  </ol>
                </div>

                <div className="dev-card p-5 space-y-3 lg:col-span-2">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Safety & Recovery</h3>
                  <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                    Owner email and phone captured at provisioning power password reset and account verification (Mail/SMS badges in Clients).
                    Suspend/reactivate tenants anytime from their card; suspended tenants lose API access but keep their data.
                    Use <strong>Backup</strong> regularly — the JSON snapshot is secrets-free and portable. Forgot your Developer password? Use the recovery link on the sign-in card.
                  </p>
                </div>
              </div>
            </section>
          )}

          {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
             TAB: MODULE ENTITLEMENTS
             â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
          {activeTab === 'modules' && (
            <section className="space-y-4">
              <form
                className="dev-card p-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (createModule.isPending) return;
                  const form = new FormData(event.currentTarget);
                  createModule.mutate({
                    key: String(form.get('key') || ''),
                    label: String(form.get('label') || ''),
                    description: String(form.get('description') || '') || undefined,
                  });
                  (event.target as HTMLFormElement).reset();
                }}
              >
                <div className="dev-step-head">
                  <span className="dev-step-badge tone-accent">+</span>
                  <div>
                    <h3 className="dev-step-title">Register New Module Entitlement</h3>
                    <p className="dev-step-sub">Register a planned module. It becomes available to packages when its implementation is installed and active.</p>
                  </div>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_1.5fr_auto]">
                  <label className="label">Key (slug)<input className="input font-mono text-xs" name="key" placeholder="kitchen-display" pattern="[a-z0-9][a-z0-9-]*" required minLength={2} maxLength={40} /></label>
                  <label className="label">Display Label<input className="input text-xs" name="label" placeholder="Kitchen Display" required minLength={2} maxLength={60} /></label>
                  <label className="label">Description<input className="input text-xs" name="description" placeholder="What this module unlocks" maxLength={300} /></label>
                  <button type="submit" className="dev-btn-primary text-xs self-end" disabled={createModule.isPending}>
                    <IconPlus className="w-3.5 h-3.5" /> Add Module
                  </button>
                </div>
                {createModule.isError && (
                  <div className="dev-inline-alert mt-3" role="alert">
                    <IconAlert className="w-4 h-4 flex-shrink-0" />
                    <span>{errorMessage(createModule.error)}</span>
                  </div>
                )}
              </form>

              <div className="dev-card p-0 overflow-hidden">
                {platformModules.isLoading ? (
                  <div className="p-8 text-center text-xs text-slate-400">Loading module catalogue…</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 dark:bg-slate-800/60 text-[10px] uppercase font-bold text-slate-500 border-b border-slate-200 dark:border-slate-800">
                        <tr>
                          <th className="py-3 px-4">Module</th>
                          <th className="py-3 px-4">Key</th>
                          <th className="py-3 px-4">Description</th>
                          <th className="py-3 px-4">Type</th>
                          <th className="py-3 px-4">State</th>
                          <th className="py-3 px-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                        {(platformModules.data ?? []).map((mod) => (
                          <tr key={mod.key} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                            <td className="py-3 px-4 font-semibold text-slate-800 dark:text-slate-100">
                              {featureIcons[(mod.key as FeatureKey)]?.({ className: 'w-3.5 h-3.5 inline mr-1.5 -mt-0.5 text-slate-400' }) ?? <IconCube className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5 text-slate-400" />}
                              {mod.label}
                              <span className="ml-1.5 rounded bg-teal-500/10 px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-wider text-teal-700 dark:text-teal-300">{mod.moduleId ?? `MOD-${mod.key.toUpperCase()}`}</span>
                              {mod.universal && <span className="ml-1.5 rounded bg-sky-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-sky-700 dark:text-sky-300">Universal</span>}
                              {mod.releaseState === 'coming-soon' && <span className="ml-1.5 rounded bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-300">Coming soon</span>}
                              {mod.releaseState === 'retired' && <span className="ml-1.5 rounded bg-red-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-red-700 dark:text-red-300">Retired</span>}
                              {mod.submodules?.length ? <ul className="mt-2 pl-4 space-y-1 text-slate-500" aria-label={`${mod.label} submodules`}>
                                {mod.submodules.map((child) => <li key={child.key}>{child.label}</li>)}
                              </ul> : null}
                            </td>
                            <td className="py-3 px-4 font-mono text-[11px] text-slate-500">{mod.key}</td>
                            <td className="py-3 px-4 max-w-xs truncate text-slate-500">{mod.description || '—'}</td>
                            <td className="py-3 px-4"><span className={`dev-meta-chip ${mod.builtin ? '' : '!text-emerald-600 dark:!text-emerald-400'}`}>{mod.builtin ? 'Built-in' : 'Custom'}</span></td>
                            <td className="py-3 px-4">
                              <span className="block mb-2">{mod.releaseState === 'coming-soon' ? 'Coming Soon' : mod.installed ? `Installed ${mod.version ?? ''}` : 'Not installed'}</span>
                              {mod.universal ? <span>Included on all accounts</span> : mod._id ? (
                                <button
                                  type="button"
                                  role="switch"
                                  aria-checked={mod.isActive}
                                  disabled={updateModule.isPending}
                                  onClick={() => updateModule.mutate({ id: mod._id!, body: { isActive: !mod.isActive } })}
                                  className={`dev-switch-pill ${mod.isActive ? 'is-on' : 'is-off'} !text-[11px]`}
                                >
                                  {mod.isActive ? 'Active' : 'Disabled'}
                                  <span className={`dev-switch-track ${mod.isActive ? 'is-on' : ''}`} aria-hidden="true"><span className="dev-switch-thumb" /></span>
                                </button>
                              ) : <span>{mod.isActive ? 'Active' : 'Disabled'}</span>}
                            </td>
                            <td className="py-3 px-4 text-right">
                              {!mod.builtin && (
                                <button
                                  type="button"
                                  className="text-[11px] font-semibold px-2 py-1 rounded-lg border border-red-500/30 text-red-600 bg-red-500/10 hover:bg-red-500/20 transition"
                                  disabled={deleteModule.isPending}
                                  onClick={() => { if (window.confirm(`Remove module “${mod.label}â€?`)) deleteModule.mutate(mod._id!); }}
                                >
                                  Delete
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
          {/* MODULE RIGHTS CONTROL TAB */}
          {activeTab === 'module-rights' && (
            <section className="space-y-4">
              <div className="dev-card p-5">
                <div className="dev-step-head">
                  <span className="dev-step-badge tone-info"><IconShield className="w-4 h-4" /></span>
                  <div>
                    <h3 className="dev-step-title">Every module has a MOD- id</h3>
                    <p className="dev-step-sub">Grant, revoke or audit module rights by id. Package assignment drives account bundles; universal modules stay on every account.</p>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {(platformModules.data ?? []).map((mod) => (
                    <article key={mod.key} className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-4 shadow-sm transition hover:shadow-md dark:border-slate-700 dark:from-slate-900 dark:to-slate-800/60">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-1.5">
                            {featureIcons[(mod.key as FeatureKey)]?.({ className: 'w-4 h-4 text-teal-600 dark:text-teal-300' }) ?? <IconCube className="w-4 h-4 text-teal-600 dark:text-teal-300" />}
                            <span className="font-bold text-slate-900 dark:text-slate-100">{mod.label}</span>
                          </div>
                          <span className="mt-1 inline-block rounded-md bg-teal-500/10 px-2 py-0.5 font-mono text-[10px] font-bold tracking-wider text-teal-700 dark:text-teal-300">{mod.moduleId ?? `MOD-${mod.key.toUpperCase()}`}</span>
                        </div>
                        <span className="dev-meta-chip">{mod.releaseState === 'coming-soon' ? 'Coming soon' : mod.installed ? `v${mod.version ?? '1.0.0'}` : 'Not installed'}</span>
                      </div>
                      {mod.description && <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{mod.description}</p>}
                      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-[11px] dark:border-slate-800">
                        <span className="text-slate-500">{mod.universal ? 'Universal' : 'Controlled by business entitlement'}</span>
                        {mod.universal ? <span className="font-semibold text-emerald-600 dark:text-emerald-400">On every account</span>
                          : mod._id ? (
                            <button type="button" role="switch" aria-checked={mod.isActive} disabled={updateModule.isPending}
                              onClick={() => updateModule.mutate({ id: mod._id!, body: { isActive: !mod.isActive } })}
                              className={`dev-switch-pill ${mod.isActive ? 'is-on' : 'is-off'} !text-[11px]`}>
                              {mod.isActive ? 'Active' : 'Disabled'}
                              <span className={`dev-switch-track ${mod.isActive ? 'is-on' : ''}`} aria-hidden="true"><span className="dev-switch-thumb" /></span>
                            </button>
                          ) : <span>{mod.isActive ? 'Active' : 'Disabled'}</span>}
                      </div>
                    </article>
                  ))}
                </div>
              </div>
              <div className="dev-card p-5">
                <h3 className="dev-step-title">Per-business effective grants</h3>
                <p className="dev-step-sub">Modules each tenant currently receives, with their MOD- ids.</p>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="text-[10px] uppercase font-bold text-slate-500 border-b border-slate-200 dark:border-slate-800">
                      <tr><th className="py-2 px-3">Business</th><th className="py-2 px-3">Plan</th><th className="py-2 px-3">Effective modules</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                      {(businesses.data ?? []).map((b) => (
                        <tr key={b.businessId}>
                          <td className="py-2 px-3 font-semibold text-slate-800 dark:text-slate-100">{b.name}<div className="font-mono text-[10px] text-slate-400">{b.domainType}</div></td>
                          <td className="py-2 px-3">{b.subscriptionPlanName ?? 'No plan'}</td>
                          <td className="py-2 px-3">
                            <div className="flex flex-wrap gap-1">
                              {(platformModules.data ?? []).filter((mod) => mod.executable && (mod.universal || b.featureFlags?.[mod.key as FeatureKey] === true)).map((mod) => (
                                <span key={mod.key} className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-300" title={mod.label}>{mod.moduleId ?? mod.key}</span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}
          {/* TAB: CLIENT ACCOUNTS DIRECTORY */}
          {activeTab === 'clients' && (() => {
            /* Group accounts under each business - businesses are the main clients of the developer. */
            const clientGroups = (() => {
              const map = new Map<string, { business: NonNullable<ClientAccountEntry['business']>; accounts: ClientAccountEntry[] }>();
              for (const acct of clientAccounts.data ?? []) {
                if (!acct.business) continue;
                const group = map.get(acct.business.id) ?? { business: acct.business, accounts: [] };
                group.accounts.push(acct);
                map.set(acct.business.id, group);
              }
              return [...map.values()];
            })();
            const groups = clientGroups;
            const hasUnassigned = (clientAccounts.data ?? []).some((a) => !a.business);
            return (
              <section className="space-y-4">
                <div className="flex items-center justify-between text-xs text-slate-500 px-1">
                  <p>
                    {groups.length} client businesses ? {clientAccounts.data?.length ?? 0} accounts
                  </p>
                  <button type="button" onClick={() => clientAccounts.refetch()} className="dev-link-btn font-semibold">
                    <IconRefresh className="w-3.5 h-3.5" spinning={clientAccounts.isFetching} /> Refresh
                  </button>
                </div>

                {clientAccounts.isLoading ? (
                  <div className="dev-card p-8 text-center text-xs text-slate-400">Loading client accounts…</div>
                ) : clientAccounts.isError ? (
                  <div className="dev-card p-8 text-center text-xs text-red-500">Could not load client accounts.</div>
                ) : groups.length === 0 && !hasUnassigned ? (
                  <div className="dev-card p-8 text-center text-xs text-slate-400">No client businesses yet — provision one under Provision.</div>
                ) : (
                  <div className="space-y-4">
                    {groups.map((group) => {
                      const staffCount = group.accounts.filter((a) => a.role !== 'owner').length;
                      return (
                        <article key={group.business.id} className="dev-card p-0 overflow-hidden">
                          {/* Business header — the main client */}
                          <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex min-w-0 items-center gap-3">
                              <BusinessAvatar size="lg" name={group.business.name} domainType={group.business.domainType} />
                              <div className="min-w-0">
                                <h3 className={`text-sm font-bold text-slate-900 dark:text-white ${urduClass(group.business.name)}`} dir={urduClass(group.business.name) ? 'rtl' : undefined}>
                                  {group.business.name}
                                </h3>
                                <p className="text-[11px] capitalize text-slate-500">{group.business.domainType} · {group.accounts.length} account{group.accounts.length === 1 ? '' : 's'} · {staffCount} role account{staffCount === 1 ? '' : 's'}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <button type="button" className="dev-link-btn" onClick={() => {
                                const target = businesses.data?.find((business) => business.businessId === group.business.id);
                                if (target) setInspectingBusiness(target);
                              }} disabled={!businesses.data?.some((business) => business.businessId === group.business.id)}>
                                Module Entitlements
                              </button>
                              <StatusBadge status={group.business.status as 'active' | 'suspended'} />
                              <button
                                type="button"
                                onClick={() => { const target = businesses.data?.find((b) => b.businessId === group.business.id); if (target) openAccountsModal(target); }}
                                className="text-[11px] font-semibold px-2.5 py-1 rounded-lg border border-indigo-500/30 bg-indigo-500/10 text-indigo-600 hover:bg-indigo-500/20 dark:text-indigo-300 transition"
                              >
                                <IconCube className="mr-1 inline w-3 h-3" /> Add Accounts
                              </button>
                            </div>
                          </div>

                          {/* Account roster */}
                          <div className="overflow-x-auto border-t border-slate-100 dark:border-slate-800/70">
                            <table className="w-full text-left text-xs">
                              <thead className="bg-slate-50 dark:bg-slate-800/60 text-[10px] uppercase font-bold text-slate-500 border-b border-slate-200 dark:border-slate-800">
                                <tr>
                                  <th className="py-2.5 px-4">Account</th>
                                  <th className="py-2.5 px-4">Role</th>
                                  <th className="py-2.5 px-4">Email</th>
                                  <th className="py-2.5 px-4">Phone</th>
                                  <th className="py-2.5 px-4">Verified</th>
                                  <th className="py-2.5 px-4">Status</th>
                                  <th className="py-2.5 px-4">Created</th>
                                  <th className="py-2.5 px-4">Actions</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                                {group.accounts.map((acct) => (
                                  <tr key={acct._id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                                    <td className="py-2.5 px-4">
                                      <p className={`font-semibold text-slate-700 dark:text-slate-200 ${urduClass(acct.name)}`} dir={urduClass(acct.name) ? 'rtl' : undefined}>{acct.name}</p>
                                      {acct.role === 'owner' && <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">Main client contact</span>}
                                    </td>
                                    <td className="py-2.5 px-4">
                                      <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                                        acct.role === 'owner' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                                          : ROLE_BADGE[(acct.role as 'admin' | 'staff' | 'cashier')]?.cls ?? ''
                                      }`}>
                                        {acct.role}
                                      </span>
                                    </td>
                                    <td className="py-2.5 px-4 font-mono text-[11px] text-slate-500">{acct.email}</td>
                                    <td className="py-2.5 px-4 font-mono text-[11px] text-slate-500">{acct.phone || <span className="text-slate-300">not set</span>}</td>
                                    <td className="py-2.5 px-4">
                                      <div className="flex gap-1" title={`Email ${acct.emailVerified ? 'verified' : 'unverified'} · Phone ${acct.phoneVerified ? 'verified' : 'unverified'}`}>
                                        <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ${acct.emailVerified ? 'bg-emerald-500/10 text-emerald-600' : 'bg-amber-500/10 text-amber-600'}`}>
                                          {acct.emailVerified ? '✓' : '!'} Mail
                                        </span>
                                        <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ${acct.phoneVerified ? 'bg-emerald-500/10 text-emerald-600' : acct.phone ? 'bg-amber-500/10 text-amber-600' : 'bg-slate-100 text-slate-400 dark:bg-slate-800'}`}>
                                          {acct.phone ? (acct.phoneVerified ? '✓' : '!') : '–'} SMS
                                        </span>
                                      </div>
                                    </td>
                                    <td className="py-2.5 px-4"><StatusBadge status={acct.isActive ? 'active' : 'suspended'} /></td>
                                    <td className="py-2.5 px-4 text-[11px] text-slate-400 whitespace-nowrap">{acct.createdAt ? fmtDateTime(acct.createdAt) : '—'}</td>
                                    <td className="py-2.5 px-4">
                                      <button type="button" className="dev-link-btn whitespace-nowrap"
                                        aria-label={`Reset password for ${acct.name}`}
                                        onClick={() => { resetClientPassword.reset(); setResetClient(acct); }}>
                                        Reset password
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </article>
                      );
                    })}
                    {hasUnassigned && (
                      <div className="dev-card p-4 text-xs text-slate-500">
                        <strong className="text-slate-700 dark:text-slate-200">Unlinked accounts:</strong>{' '}
                        {(clientAccounts.data ?? []).filter((a) => !a.business).map((a) => a.email).join(', ')}
                      </div>
                    )}
                  </div>
                )}
              </section>
            );
          })()}


          {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
             TAB: PROVISION BUSINESS
             â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
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
                      <input className="input" id="biz-name" name="name" placeholder="e.g. Kazmi Supermarket یا اردو نام" required minLength={2} maxLength={120} {...urduInputProps} />
                      {(() => {
                        const nameInput = document.getElementById('biz-name') as HTMLInputElement | null;
                        const name = nameInput?.value ?? '';
                        return name.trim() ? (
                          <div className="mt-2 flex items-center gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 dark:border-slate-700 dark:bg-slate-800/60">
                            <BusinessAvatar size="sm" name={name} domainType={provisionDomain} />
                            <div className="min-w-0">
                              <p className={`text-xs font-semibold text-slate-800 dark:text-slate-100 ${urduClass(name)}`} dir={urduClass(name) ? 'rtl' : undefined}>{name}</p>
                              <p className="text-[10px] text-slate-400">Identity preview — monogram + domain accent</p>
                            </div>
                          </div>
                        ) : null;
                      })()}
                    </div>
                    <div>
                      <label className="label" htmlFor="biz-domain">Domain Type</label>
                      <select
                        className="input" id="biz-domain" name="domainType" value={provisionDomain}
                        onChange={(e) => {
                          setProvisionDomain(e.target.value as DomainType);
                          if (applyDomainDefaults) applyDomainPackage(e.target.value as DomainType);
                        }}
                      >
                        {['retail', 'supermarket', 'grocery', 'electronics', 'restaurant', 'pharmacy', 'salon', 'custom'].map((d) => (
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
                            {p.name} ({formatMoney(p.price)}/{INTERVAL_SUFFIX[p.billingInterval] ?? p.billingInterval})
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
                      <input className="input" id="owner-name" name="ownerName" placeholder="e.g. Ali Kazmi یا علی کاظمی" required minLength={2} maxLength={80} {...urduInputProps} />
                    </div>
                    <div>
                      <label className="label" htmlFor="owner-email">Owner Email</label>
                      <input className="input" id="owner-email" name="ownerEmail" type="email" autoComplete="email" placeholder="owner@business.com" required />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="label" htmlFor="owner-phone">
                        Owner Phone Number
                        <span className="font-normal normal-case text-slate-400"> — used for password reset &amp; verification</span>
                      </label>
                      <input
                        className="input font-mono"
                        id="owner-phone" name="ownerPhone" type="tel" inputMode="tel"
                        autoComplete="tel" placeholder="+923001234567"
                        pattern="\+?[0-9]{7,15}" required
                      />
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

                {/* Role Package — accounts created as per business demand */}
                <div className="dev-form-section">
                  <div className="dev-step-head">
                    <span className="dev-step-badge tone-warning">3</span>
                    <div>
                      <h3 className="dev-step-title">Role Accounts per Business Type</h3>
                      <p className="dev-step-sub">Based on the domain, seed the admin / staff / cashier accounts the business will need from day one.</p>
                    </div>
                  </div>
                  <label className="dev-feature-checkbox mt-3 !items-center">
                    <input
                      type="checkbox"
                      className="dev-checkbox"
                      checked={seedAccountsOnProvision}
                      onChange={(e) => setSeedAccountsOnProvision(e.target.checked)}
                    />
                    <span className="dev-feature-checkbox-icon"><IconCube className="w-4 h-4" /></span>
                    <span>
                      <span className="block text-xs font-semibold">Create role accounts with the owner</span>
                      <span className="block text-[10px] text-slate-500 dark:text-slate-400">Uncheck to provision the owner only — accounts can be added later via Businesses → Accounts.</span>
                    </span>
                  </label>

                  {(() => {
                    const pkg = rolePackages.data?.[provisionDomain] ?? DOMAIN_ROLE_PACKAGES[provisionDomain] ?? DOMAIN_ROLE_PACKAGES.custom;
                    return (
                      <div className="mt-3 space-y-2">
                        <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                          {pkg.icon} Recommended for {pkg.label}:
                        </p>
                        {pkg.accounts.map((entry, idx) => {
                          const pending = pendingAccounts[idx];
                          return (
                            <div key={`${entry.role}-${idx}`} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                              <div className="flex items-center justify-between gap-2">
                                <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase ${ROLE_BADGE[entry.role].cls}`}>
                                  {ROLE_BADGE[entry.role].short} · {entry.title}
                                </span>
                                {pending && (
                                  <button
                                    type="button"
                                    className="dev-link-btn"
                                    onClick={() => setPendingAccounts((list) => list.filter((_, i) => i !== idx))}
                                  >
                                    Remove
                                  </button>
                                )}
                              </div>
                              {pending && (
                                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                                  <input className={`input text-xs ${urduClass(pending.name)}`} placeholder="Full name / Ù¾ÙˆØ±Ø§ Ù†Ø§Ù…" required dir={urduClass(pending.name) ? 'rtl' : undefined}
                                    value={pending.name}
                                    onChange={(e) => setPendingAccounts((list) => list.map((a, i) => i === idx ? { ...a, name: e.target.value } : a))}
                                  />
                                  <input className="input text-xs" type="email" placeholder="email@business.com" required
                                    value={pending.email}
                                    onChange={(e) => setPendingAccounts((list) => list.map((a, i) => i === idx ? { ...a, email: e.target.value } : a))}
                                  />
                                  <input className="input text-xs font-mono" type="password" placeholder="Password (min 8)" required minLength={8}
                                    value={pending.password}
                                    onChange={(e) => setPendingAccounts((list) => list.map((a, i) => i === idx ? { ...a, password: e.target.value } : a))}
                                  />
                                </div>
                              )}
                              <div className="mt-1.5 flex flex-wrap gap-1">
                                {entry.moduleRights.map((right) => (
                                  <span key={right} className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                    {MODULE_RIGHT_LABEL[right] ?? right}
                                  </span>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                        {pendingAccounts.length === 0 && (
                          <button
                            type="button"
                            className="dev-link-btn"
                            onClick={() => setPendingAccounts(pkg.accounts.map((entry, i) => ({
                              _key: `${entry.role}-${i}-${Date.now()}`,
                              role: entry.role,
                              name: '', email: '', password: '',
                              moduleRights: [...entry.moduleRights],
                            })))}
                          >
                            <IconPlus className="w-3.5 h-3.5" /> Restore recommended accounts
                          </button>
                        )}
                      </div>
                    );
                  })()}
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

          {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
             TAB: AUDIT LOG
             â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
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
                ) : auditLogs.isError ? (
                  <div className="dev-empty-state" role="alert"><p>Unable to load audit records.</p><button type="button" className="dev-btn-secondary mt-3" onClick={() => auditLogs.refetch()}>Retry</button></div>
                ) : auditLogs.data && auditLogs.data.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs" aria-label="Platform audit records">
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
                            <td className="py-3 px-4 max-w-xs font-mono text-[10px] text-slate-500">
                              <details className="dev-audit-details"><summary>View details</summary><pre>{JSON.stringify(entry.details, null, 2)}</pre></details>
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

          {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
             TAB: CONSOLE SETTINGS
             â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
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
                <fieldset className="dev-palette">
                  <legend>Accent color</legend>
                  <p>Choose a preset or pick a custom color. Your choice is saved in this browser.</p>
                  <div className="dev-palette-options">
                    {accentPresets.map((preset) => (
                      <button type="button" key={preset.color} aria-pressed={accent === preset.color}
                        onClick={() => chooseAccent(preset.color)}>
                        <span aria-hidden="true" style={{ background: preset.color }} />{preset.name}
                      </button>
                    ))}
                  </div>
                  <div className="dev-custom-accent">
                    <label>Custom color <input type="color" value={accent} onChange={(event) => chooseAccent(event.target.value)} /></label>
                    <output>{accent.toUpperCase()}</output>
                    <button type="button" onClick={() => chooseAccent(defaultAccent)} disabled={accent === defaultAccent}>Reset to default</button>
                  </div>
                </fieldset>
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

      {/* â•â•â• Modal: Create Plan â•â•â• */}
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
                  <option value="lifetime">Lifetime (one-time)</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor="plan-description">Description</label>
                <input className="input" id="plan-description" name="description" placeholder="Brief summary of plan benefits" maxLength={500} />
                <label className="label mt-3" htmlFor="plan-domain">Business type</label>
                <select className="input" id="plan-domain" name="domainType" defaultValue=""><option value="">All business types</option>{Object.entries(DOMAIN_ROLE_PACKAGES).map(([key, pkg]) => <option key={key} value={key}>{pkg.label}</option>)}</select>
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
                    <input type="checkbox" name={`feature-${key}`} defaultChecked={key !== 'data-sync'} className="dev-checkbox" />
                    <span className="dev-feature-checkbox-icon">{featureIcons[key]?.({ className: 'w-4 h-4' })}</span>
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

      {/* â•â•â• Modal: Edit Plan â•â•â• */}
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
                  <option value="lifetime">Lifetime (one-time)</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor="edit-plan-description">Description</label>
                <input className="input" id="edit-plan-description" name="description" defaultValue={editingPlan.description} placeholder="Brief description" maxLength={500} />
                <label className="label mt-3" htmlFor="edit-plan-domain">Business type</label>
                <select className="input" id="edit-plan-domain" name="domainType" defaultValue={editingPlan.domainType ?? ''}><option value="">All business types</option>{Object.entries(DOMAIN_ROLE_PACKAGES).map(([key, pkg]) => <option key={key} value={key}>{pkg.label}</option>)}</select>
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
                    <span className="dev-feature-checkbox-icon">{featureIcons[key]?.({ className: 'w-4 h-4' })}</span>
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

      {/* â•â•â• Modal: Rename Business â•â•â• */}
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
                dir={urduClass(renamingBusiness.name) ? 'rtl' : undefined}
                {...urduInputProps}
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

      {/* â•â•â• Modal: Inspect Business Details â•â•â• */}
      {resetClient && (
        <ModalOverlay onClose={() => { if (!resetClientPassword.isPending) setResetClient(null); }} labelledBy="client-reset-title">
          <ModalHeader title="Reset client password" titleId="client-reset-title"
            subtitle={`${resetClient.name} ? ${resetClient.business?.name ?? ''}`}
            onClose={() => { if (!resetClientPassword.isPending) setResetClient(null); }} />
          <div className="space-y-3 p-4 text-sm">
            {resetClientPassword.isSuccess ? <p role="status">{resetClientPassword.data.message}</p> : (
              <>
                <p>The account holder receives a single-use link at their verified email and chooses their new password. Their sessions are revoked after the reset.</p>
                {!resetClient.isActive ? <p role="status">Reactivate this account before requesting a reset.</p> :
                  !resetClient.emailVerified && <p role="status">This account needs a verified email.</p>}
                {resetClientPassword.isError && <p role="alert">{errorMessage(resetClientPassword.error)}</p>}
                <button type="button" className="dev-btn-primary"
                  disabled={!resetClient.business || !resetClient.isActive || !resetClient.emailVerified || resetClientPassword.isPending}
                  onClick={() => {
                    if (resetClient.business) resetClientPassword.mutate({ businessId: resetClient.business.id, accountId: resetClient._id });
                  }}>
                  {resetClientPassword.isPending ? 'Sending...' : 'Send reset link'}
                </button>
              </>
            )}
          </div>
        </ModalOverlay>
      )}

      {inspectingBusiness && (
        <ModalOverlay onClose={() => setInspectingBusiness(null)} labelledBy="inspect-modal-title">
          <ModalHeader
            titleId="inspect-modal-title"
            title={inspectingBusiness.name}
            subtitle={`Tenant ID: ${inspectingBusiness.businessId}`}
            onClose={() => setInspectingBusiness(null)}
          />
          <div className="flex items-center gap-3 px-5 pt-4">
            <BusinessAvatar name={inspectingBusiness.name} logoUrl={inspectingBusiness.logoUrl} domainType={inspectingBusiness.domainType} size="lg" />
            <div className="min-w-0">
              <p className={`text-sm font-bold text-slate-900 dark:text-white ${urduClass(inspectingBusiness.name)}`} dir={urduClass(inspectingBusiness.name) ? 'rtl' : undefined}>{inspectingBusiness.name}</p>
              <p className="text-[11px] capitalize text-slate-500">{inspectingBusiness.domainType || 'retail'} · {inspectingBusiness.currency || 'PKR'}</p>
            </div>
          </div>
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

            <form className="space-y-3 pt-3" onSubmit={(event) => { event.preventDefault(); const values = new FormData(event.currentTarget); updateBusiness.mutate({ id: inspectingBusiness.businessId, body: { deploymentMode: values.get('mode') as 'cloud' | 'offline' | 'hybrid', branchLimit: Number(values.get('limit')), ...(values.get('expiry') ? { licenseExpiresAt: new Date(String(values.get('expiry'))).toISOString() } : {}) } }); }}><label className="label">Permitted deployment<select className="input" name="mode" defaultValue={inspectingBusiness.deploymentMode ?? 'cloud'}><option value="cloud">Cloud</option><option value="offline">Offline installation</option><option value="hybrid">Hybrid installation</option></select></label><p className="text-xs text-slate-500">Selecting a mode records the entitlement. Offline installation and sync must be provisioned separately.</p><label className="label">Branch limit<input name="limit" className="input" type="number" min={1} max={1000} defaultValue={inspectingBusiness.branchLimit ?? 1} required /></label><label className="label">License expiry<input name="expiry" className="input" type="date" defaultValue={inspectingBusiness.licenseExpiresAt?.slice(0, 10) ?? ''} /></label><button className="dev-btn-primary" disabled={updateBusiness.isPending}>Save deployment & license</button></form>
            <div className="pt-2">
              <p className="dev-field-label">Active Modules</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {featureKeys.map((k) => {
                  const enabled = k === 'data-sync' ? inspectingBusiness.featureFlags?.['data-sync'] === true : inspectingBusiness.featureFlags?.[k] !== false;
                  return (
                    <span
                      key={k}
                      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold ${
                        enabled
                          ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                          : 'bg-slate-100 text-slate-400 dark:bg-slate-800'
                      }`}
                    >
                      {featureIcons[k]?.({ className: 'w-3 h-3' })}
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

      {/* â•â•â• Modal: Provision Role Accounts (Package Manager) â•â•â• */}
      {accountsForBusiness && (
        <ModalOverlay onClose={() => { setAccountsForBusiness(null); setPendingAccounts([]); }} labelledBy="accounts-modal-title">
          <ModalHeader
            titleId="accounts-modal-title"
            title="Provision Role Accounts"
            subtitle={`${accountsForBusiness.name} · ${DOMAIN_ROLE_PACKAGES[(accountsForBusiness.domainType ?? 'custom') as DomainType]?.label ?? 'Custom'} package`}
            onClose={() => { setAccountsForBusiness(null); setPendingAccounts([]); }}
          />
          <form
            className="dev-modal-body"
            onSubmit={(event) => {
              event.preventDefault();
              if (provisionAccounts.isPending || pendingAccounts.length === 0) return;
              provisionAccounts.mutate({
                id: accountsForBusiness.businessId,
                accounts: pendingAccounts.map(({ role, name, email, password, moduleRights }) => ({ role, name, email, password, moduleRights })),
              });
            }}
          >
            {provisionAccounts.isError && (
              <div className="dev-inline-alert" role="alert">
                <IconAlert className="w-4 h-4 flex-shrink-0" />
                <span>{errorMessage(provisionAccounts.error)}</span>
              </div>
            )}

            <div className="space-y-3">
              {pendingAccounts.length === 0 && (
                <p className="py-3 text-center text-xs text-slate-400">No accounts staged. Pick a preset below.</p>
              )}
              {pendingAccounts.map((account, idx) => (
                <div key={account._key} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <select
                        className="input !w-auto text-xs py-1"
                        value={account.role}
                        onChange={(e) => setPendingAccounts((list) => list.map((a, i) => i === idx ? { ...a, role: e.target.value as ProvisionableRole } : a))}
                        aria-label="Account role"
                      >
                        <option value="admin">Admin</option>
                        <option value="staff">Staff</option>
                        <option value="cashier">Cashier</option>
                      </select>
                      <input
                        className="input !w-36 text-xs"
                        placeholder="Title (e.g. Manager)"
                        value={(account as ProvisionAccountInput & { title?: string }).title ?? ''}
                        onChange={(e) => setPendingAccounts((list) => list.map((a, i) => i === idx ? { ...a, ...{ title: e.target.value } } : a))}
                      />
                    </div>
                    <button
                      type="button"
                      className="dev-link-btn"
                      onClick={() => setPendingAccounts((list) => list.filter((_, i) => i !== idx))}
                    >
                      Remove
                    </button>
                  </div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    <input className={`input text-xs ${urduClass(account.name)}`} placeholder="Full name / Ù¾ÙˆØ±Ø§ Ù†Ø§Ù…" required dir={urduClass(account.name) ? 'rtl' : undefined}
                      value={account.name}
                      onChange={(e) => setPendingAccounts((list) => list.map((a, i) => i === idx ? { ...a, name: e.target.value } : a))}
                    />
                    <input className="input text-xs" type="email" placeholder="email@business.com" required
                      value={account.email}
                      onChange={(e) => setPendingAccounts((list) => list.map((a, i) => i === idx ? { ...a, email: e.target.value } : a))}
                    />
                    <input className="input text-xs font-mono" type="password" placeholder="Password (min 8)" required minLength={8}
                      value={account.password}
                      onChange={(e) => setPendingAccounts((list) => list.map((a, i) => i === idx ? { ...a, password: e.target.value } : a))}
                    />
                  </div>
                  <div className="mt-2">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Module rights</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {MODULE_RIGHTS.map((right) => {
                        const on = account.moduleRights?.includes(right.key) ?? false;
                        return (
                          <button
                            key={right.key}
                            type="button"
                            onClick={() => setPendingAccounts((list) => list.map((a, i) => i === idx ? {
                              ...a,
                              moduleRights: on
                                ? (a.moduleRights ?? []).filter((r) => r !== right.key)
                                : [...(a.moduleRights ?? []), right.key],
                            } : a))}
                            className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold transition ${
                              on
                                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                                : 'border-slate-200 text-slate-400 dark:border-slate-700'
                            }`}
                          >
                            {right.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="dev-modal-divider">
              <p className="dev-field-label">Quick presets</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {Object.entries(rolePackages.data ?? DOMAIN_ROLE_PACKAGES).map(([domain, pkg]) => (
                  <button
                    key={domain}
                    type="button"
                    className="dev-meta-chip hover:!text-emerald-600"
                    onClick={() => setPendingAccounts((pkg as DomainRolePackage).accounts.map((entry, i) => ({
                      _key: `${entry.role}-${i}-${Date.now()}`,
                      role: entry.role,
                      name: '', email: '', password: '',
                      moduleRights: [...entry.moduleRights],
                    })))}
                  >
                    <span aria-hidden="true">{(pkg as DomainRolePackage).icon}</span> {(pkg as DomainRolePackage).label}
                  </button>
                ))}
              </div>
            </div>

            <div className="dev-modal-foot">
              <button type="button" onClick={() => { setAccountsForBusiness(null); setPendingAccounts([]); }} className="dev-btn-secondary text-xs">
                Cancel
              </button>
              <button type="submit" disabled={provisionAccounts.isPending || pendingAccounts.length === 0} className="dev-btn-primary text-xs">
                {provisionAccounts.isPending ? (
                  <><IconRefresh className="w-3.5 h-3.5 spinning" /> Provisioning…</>
                ) : (
                  <><IconShieldCheck className="w-3.5 h-3.5" /> Create {pendingAccounts.length} Account{pendingAccounts.length === 1 ? '' : 's'}</>
                )}
              </button>
            </div>
          </form>
        </ModalOverlay>
      )}
    </div>
  );
}
