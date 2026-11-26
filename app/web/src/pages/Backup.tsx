import { useMutation, useQuery } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../store/auth';
import './Support.css';

interface BackupInfo { sync?: { entitled: boolean; configured: boolean }; canExport: boolean; format: string; consistentSnapshot: boolean; includesCredentials: boolean; included: string[]; excluded: string[]; }
interface SupportResponse { backup: BackupInfo; entitlements: { backup: boolean }; }

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export default function Backup() {
  const userId = useAuth((state) => state.user?._id);
  const tenantId = useAuth((state) => state.user?.tenantId);
  const support = useQuery({
    queryKey: ['support', 'backup', tenantId, userId],
    queryFn: ({ signal }) => api.get<SupportResponse>('/support', { signal }).then((response) => response.data),
  });
  const backup = support.data?.backup;
  const canExport = support.isSuccess && !!support.data.entitlements.backup && !!backup?.canExport;
  const download = useMutation({
    mutationFn: async () => {
      try {
        const response = await api.get<Blob>('/support/backup', { responseType: 'blob' });
        if (response.data.type !== 'application/zip' || response.data.size === 0) {
          throw new Error('The server did not return a ZIP file. Try again or contact support.');
        }
        const expectedHash = response.headers['x-snapshot-sha256'];
        if (expectedHash && globalThis.crypto?.subtle) {
          const digest = await crypto.subtle.digest('SHA-256', await response.data.arrayBuffer());
          const actualHash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
          if (actualHash !== expectedHash) throw new Error('The ZIP failed its integrity check. Try downloading it again.');
        }
        const filename = response.headers['content-disposition']?.match(/filename="?([a-zA-Z0-9._-]+\.zip)"?(?:;|$)/i)?.[1]
          ?? `kazmion-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.zip`;
        // A session change while the export is in flight must not save another user's data.
        const current = useAuth.getState().user;
        if (current?._id !== userId || current?.tenantId !== tenantId) {
          throw new Error('The signed-in account changed. Start a new export.');
        }
        downloadBlob(response.data, filename);
      } catch (error) {
        if (!isAxiosError(error)) throw error;
        if (error.response?.status === 403) {
          void support.refetch();
          throw new Error('This account no longer has permission to export business records.');
        }
        if (error.response?.status === 413) {
          const body = error.response.data;
          const details: unknown = body instanceof Blob ? await body.text().then(JSON.parse).catch(() => null) : null;
          const message = details && typeof details === 'object' && 'message' in details ? details.message : null;
          throw new Error(typeof message === 'string' ? message : 'This business exceeds the ZIP export limit. Contact your backup operator for a native backup.');
        }
        throw new Error('The export could not be prepared. Try again or contact support.');
      }
    },
  });

  return (
    <div className="support-page space-y-5">
      <section className="support-hero" aria-labelledby="backup-title">
        <p className="support-eyebrow">Business continuity</p>
        <h1 id="backup-title" className="support-title">Business Backup</h1>
        <p className="support-copy">Export your business records to a ZIP file. The archive contains formatted JSON and a manifest with record counts and checksums. Save it in a restricted folder on an encrypted drive.</p>
        <div className="support-actions"><button type="button" className="support-button support-button--primary" onClick={() => download.mutate()} disabled={!canExport || download.isPending}><DownloadIcon /> {download.isPending ? 'Preparing ZIP…' : 'Download Business Backup (ZIP)'}</button><Link className="support-button" to="/help"><HelpIcon /> Get backup help</Link></div>
        {support.isSuccess && !canExport && <div className="support-alert mt-4" role="status"><InfoIcon /><div><strong>Only the business owner can download an export.</strong> Ask the owner to download and safeguard the file, or contact support for recovery assistance.</div></div>}
      </section>

      {support.isPending && <div className="support-loading" role="status">Loading backup policy…</div>}
      {support.isError && <div className="support-error" role="alert">We could not load the backup policy. <button type="button" className="underline font-semibold" onClick={() => support.refetch()}>Retry</button></div>}
      {download.isError && <div className="support-error" role="alert">{download.error.message}</div>}
      {download.isSuccess && <div className="support-card" role="status"><span className="support-status support-status--ok">ZIP download started</span><p className="mb-0 mt-2">Check your browser downloads. Store the ZIP on encrypted storage with restricted access.</p></div>}

      {canExport && backup?.sync?.entitled && (
        <section className="support-card" aria-labelledby="data-sync-title">
          <h2 id="data-sync-title">Data Sync</h2>
          <p>Send a snapshot of your business records to the cloud.</p>
          <Link className="support-button" to="/data-sync">Open Data Sync</Link>
        </section>
      )}

      {backup && <>
        <section className="support-card" aria-labelledby="export-details-title"><h2 id="export-details-title">What's in the backup</h2><div className="support-export-summary"><div><span>Format</span><strong>{backup.format}</strong></div><div><span>Type</span><strong>{backup.consistentSnapshot ? 'Consistent snapshot' : 'Logical export (ZIP)'}</strong></div><div><span>Credentials</span><strong>{backup.includesCredentials ? 'Included' : 'Excluded for security'}</strong></div></div><div className="support-grid support-grid--two mt-4"><div><h3>Included records</h3><ul className="support-list">{backup.included.map((item) => <li key={item}>{item}</li>)}</ul></div><div><h3>Excluded for security</h3><ul className="support-list">{backup.excluded.map((item) => <li key={item}>{item}</li>)}</ul></div></div></section>
        <div className="support-grid support-grid--two"><section className="support-card"><h2>Store it safely</h2><ul className="support-list"><li>Save the ZIP file outside the active workstation and restrict access.</li><li>Use encrypted storage for customer and sales data.</li><li>Each collection is a separate JSON file inside the ZIP for easy review.</li><li>Check <strong>manifest.json</strong> inside the ZIP for file checksums and record counts.</li></ul></section><section className="support-card"><h2>Recovery</h2><ul className="support-list"><li>Keep native database backups and separate copies of uploaded files and invoice PDFs for full recovery.</li><li>For an operator-reviewed import, keep the original ZIP and manifest intact.</li></ul></section></div>
      </>}
    </div>
  );
}

function DownloadIcon() { return <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0 4-4m-4 4-4-4M5 20h14" /></svg>; }
function HelpIcon() { return <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="9" /><path strokeLinecap="round" strokeLinejoin="round" d="M9.5 9a2.6 2.6 0 1 1 4.4 1.9c-.95.92-1.9 1.43-1.9 3.1m.01 3h.01" /></svg>; }
function InfoIcon() { return <svg aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="9" /><path strokeLinecap="round" d="M12 10v6m0-9h.01" /></svg>; }
