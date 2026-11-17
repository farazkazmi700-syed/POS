import { useMutation, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import './Support.css';

interface BackupInfo { canExport: boolean; format: string; consistentSnapshot: boolean; includesCredentials: boolean; included: string[]; excluded: string[]; }
interface SupportResponse { backup: BackupInfo; entitlements: { backup: boolean }; }
interface BackupExport { format: string; consistentSnapshot: boolean; sha256: string; payload: string; }

function downloadJson(exportData: BackupExport) {
  const file = new Blob([JSON.stringify({ ...exportData, payload: JSON.parse(exportData.payload) }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = `kazmion-business-export-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export default function Backup() {
  const support = useQuery({ queryKey: ['support'], queryFn: () => api.get<SupportResponse>('/support').then((response) => response.data) });
  const backup = support.data?.backup;
  const canExport = !!support.data?.entitlements.backup && !!backup?.canExport;
  const download = useMutation({ mutationFn: async () => { const response = await api.get<BackupExport>('/support/backup'); downloadJson(response.data); return response.data; } });

  return (
    <div className="support-page space-y-5">
      <section className="support-hero" aria-labelledby="backup-title">
        <p className="support-eyebrow">Business continuity</p>
        <h1 id="backup-title" className="support-title">Download a secure copy of your business records.</h1>
        <p className="support-copy">This creates a tenant-scoped logical export. Keep it securely and use it only with an operator-reviewed recovery process.</p>
        <div className="support-actions"><button type="button" className="support-button support-button--primary" onClick={() => download.mutate()} disabled={!canExport || download.isPending}><DownloadIcon /> {download.isPending ? 'Preparing export…' : 'Download business export'}</button><Link className="support-button" to="/help"><HelpIcon /> Get backup help</Link></div>
        {!support.isPending && !canExport && <div className="support-alert mt-4" role="status"><InfoIcon /><div><strong>Only the business owner can download an export.</strong> Ask the owner to download and safeguard the file, or contact support for recovery assistance.</div></div>}
      </section>

      {support.isPending && <div className="support-loading" role="status">Loading backup policy…</div>}
      {support.isError && <div className="support-error" role="alert">We could not load the backup policy. <button type="button" className="underline font-semibold" onClick={() => support.refetch()}>Retry</button></div>}
      {download.isError && <div className="support-error" role="alert">The export could not be prepared. Check your connection and try again. If the problem continues, contact support.</div>}
      {download.isSuccess && <div className="support-card" role="status"><span className="support-status support-status--ok">Export downloaded</span><p className="mb-0 mt-2">Keep the original file and its checksum together. The server recorded this export in the audit log.</p></div>}

      {backup && <>
        <section className="support-card" aria-labelledby="export-details-title"><h2 id="export-details-title">Export details</h2><div className="support-export-summary"><div><span>Format</span><strong>{backup.format}</strong></div><div><span>Snapshot</span><strong>{backup.consistentSnapshot ? 'Consistent snapshot' : 'Logical export'}</strong></div><div><span>Credentials</span><strong>{backup.includesCredentials ? 'Included' : 'Excluded'}</strong></div></div><div className="support-grid support-grid--two mt-4"><div><h3>Included records</h3><ul className="support-list">{backup.included.map((item) => <li key={item}>{item}</li>)}</ul></div><div><h3>Excluded for security</h3><ul className="support-list">{backup.excluded.map((item) => <li key={item}>{item}</li>)}</ul></div></div></section>
        <div className="support-grid support-grid--two"><section className="support-card"><h2>Store it safely</h2><ul className="support-list"><li>Save the file outside the active workstation and restrict access.</li><li>Use encrypted storage for customer and sales data.</li><li>Keep a documented recovery contact and a current database backup.</li></ul></section><section className="support-card"><h2>What this export cannot do</h2><ul className="support-list"><li>It does not contain passwords, sessions, external files, or background jobs.</li><li>It is not an automatic restore image or a replacement for database backups.</li><li>Do not edit the file before an operator-reviewed recovery.</li></ul></section></div>
      </>}
    </div>
  );
}

function DownloadIcon() { return <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0 4-4m-4 4-4-4M5 20h14" /></svg>; }
function HelpIcon() { return <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="9" /><path strokeLinecap="round" strokeLinejoin="round" d="M9.5 9a2.6 2.6 0 1 1 4.4 1.9c-.95.92-1.9 1.43-1.9 3.1m.01 3h.01" /></svg>; }
function InfoIcon() { return <svg aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="9" /><path strokeLinecap="round" d="M12 10v6m0-9h.01" /></svg>; }
