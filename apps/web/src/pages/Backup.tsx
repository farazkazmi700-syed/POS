import { useQuery, useMutation } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../store/auth';

interface Delivery {
  mode: 'offline' | 'cloud';
  emailLimitBytes: number;
  driveLimitBytes: number;
}

interface BackupInfo {
  canExport: boolean;
  format: string;
  consistentSnapshot: boolean;
  includesCredentials: boolean;
  includesFiles: boolean;
  delivery: Delivery;
  included: string[];
  excluded: string[];
}

interface SupportResponse {
  backup: BackupInfo;
  entitlements: { help: boolean; backup: boolean };
}

const DEVELOPER_CONTACT = {
  email: 'kazmitech142@gmail.com',
};

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(2)} KiB`;
  return `${bytes} B`;
}

export default function Backup() {
  const role = useAuth((s) => s.user?.role);
  const info = useQuery({
    queryKey: ['backup'],
    queryFn: () => api.get<SupportResponse>('/support').then((r) => r.data),
  });
  const backupEnabled = !!info.data?.entitlements?.backup;
  const backup = info.data?.backup;

  const download = useMutation({
    mutationFn: async () => {
      const { data } = await api.get('/support/backup');
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `kazmion-backup-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
  });

  const canExport = backupEnabled && role === 'owner' && !!backup?.canExport;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <section className="dev-panel padded">
        <header>
          <p className="kicker">Developer engine</p>
          <h3>Business backup &amp; export</h3>
        </header>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Export a point-in-time snapshot of your business records. Credentials, sessions, external files and Redis jobs
          are intentionally excluded; this is not a full database backup and cannot be used for automatic restore.
        </p>

        {!backupEnabled && (
          <div className="dev-list-item mt-4" style={{ background: 'rgba(245,158,11,0.06)', borderColor: 'rgba(245,158,11,0.18)' }}>
            <div className="dev-list-item-main">
              <span className="dev-list-item-title" style={{ color: '#b45309' }}>Backup export not entitled</span>
              <span className="dev-list-item-sub">Your current role cannot export backups. Ask your business owner to grant backup entitlement.</span>
            </div>
          </div>
        )}
        {backup && (
          <>
            <div className="dev-grid cols-3" style={{ marginTop: 14 }}>
              <div className="dev-stat">
                <p className="kicker">Format</p>
                <p className="value">{backup.format}</p>
                <p className="text-xs text-slate-500">Consistent snapshot: {backup.consistentSnapshot ? 'Yes' : 'No'}</p>
              </div>
              <div className="dev-stat">
                <p className="kicker">Includes credentials</p>
                <p className="value">{backup.includesCredentials ? 'Yes' : 'No'}</p>
                <p className="text-xs text-slate-500">Includes files: {backup.includesFiles ? 'Yes' : 'No'}</p>
              </div>
              <div className="dev-stat">
                <p className="kicker">Delivery mode</p>
                <p className="value">{backup.delivery.mode === 'cloud' ? 'Cloud' : 'Offline'}</p>
                <p className="text-xs text-slate-500">Owner export: {canExport ? 'Allowed' : 'Not allowed'}</p>
              </div>
            </div>

            <div className="dev-panel padded mt-5" style={{ border: 'none', boxShadow: 'none', background: 'transparent' }}>
              <div className="dev-field">
                <label>Included data</label>
                <p className="text-sm text-slate-600 dark:text-slate-400">{backup.included.join(', ') || '—'}</p>
              </div>
              <div className="dev-field">
                <label>Excluded data</label>
                <p className="text-sm text-slate-600 dark:text-slate-400">{backup.excluded.join(', ') || '—'}</p>
              </div>
            </div>

            <div className="mt-5">
              <p className="kicker mb-2">Delivery limits</p>
              <div className="space-y-2">
                <div className="dev-list-item">
                  <div className="dev-list-item-main">
                    <span className="dev-list-item-title">Email delivery</span>
                    <span className="dev-list-item-sub">Limit {formatBytes(backup.delivery.emailLimitBytes)} per export</span>
                  </div>
                </div>
                <div className="dev-list-item">
                  <div className="dev-list-item-main">
                    <span className="dev-list-item-title">Cloud drive delivery</span>
                    <span className="dev-list-item-sub">Limit {formatBytes(backup.delivery.driveLimitBytes)} per export</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex items-center gap-3">
              <button
                className="dev-btn dev-btn-primary"
                onClick={() => download.mutate()}
                disabled={download.isPending || !canExport}
              >
                <IconDownload className="w-4 h-4" /> {download.isPending ? 'Preparing export…' : 'Download backup'}
              </button>
              {!canExport && role === 'owner' && (
                <a className="dev-btn dev-btn-sm dev-btn-ghost" href={`mailto:${DEVELOPER_CONTACT.email}?subject=${encodeURIComponent('Request backup export access')}`}>
                  Request export access
                </a>
              )}
              {download.isError && <p className="text-sm text-red-600 dark:text-red-400">Export failed. Please retry or contact your administrator.</p>}
              {download.isSuccess && <p className="text-sm text-emerald-600 dark:text-emerald-400">Export prepared for download.</p>}
            </div>
          </>
        )}
      </section>

      <section className="dev-panel padded">
        <header>
          <p className="kicker">Need help?</p>
          <h3>Support</h3>
        </header>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Contact the developer engine team for provisioning changes, plan upgrades, or data recovery.
        </p>
        <div className="mt-4 flex items-center gap-3">
          <a className="dev-btn dev-btn-ghost" href={`mailto:${DEVELOPER_CONTACT.email}?subject=${encodeURIComponent('KazmiOn backup support request')}`}>
            <IconMailFallback className="w-4 h-4" /> Email support
          </a>
          <Link className="dev-btn dev-btn-ghost" to="/help">
            <IconShieldCheck className="w-4 h-4" /> Help center
          </Link>
        </div>
      </section>
    </div>
  );
}

function IconMailFallback(props: any) {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8m-5.471 10.538a2 2 0 01-2.22 0L3 16m13-3l-4-2.667a2 2 0 01-2.22 0L3 13m13 3v-6.5L19 6.412" />
    </svg>
  );
}
function IconDownload(props: any) {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
    </svg>
  );
}
function IconShieldCheck(props: any) {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0" />
    </svg>
  );
}