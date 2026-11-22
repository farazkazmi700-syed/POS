import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../store/auth';
import './Support.css';

interface SupportResponse {
  help: { email: string; recoveryUrl: string; channels: { email: boolean; whatsapp: boolean }; codeExpiryMinutes: number };
  entitlements: { help: boolean; backup: boolean };
}

const FALLBACK_EMAIL = 'info.kazmion@gmail.com';

export default function Help() {
  const role = useAuth((state) => state.user?.role);
  const support = useQuery({ queryKey: ['support'], queryFn: () => api.get<SupportResponse>('/support').then((response) => response.data) });
  const help = support.data?.help;
  const email = help?.email ?? FALLBACK_EMAIL;
  const canExport = role === 'owner' && support.data?.entitlements.backup;
  const emailLink = (subject: string) => `mailto:${email}?subject=${encodeURIComponent(subject)}`;

  return (
    <div className="support-page space-y-5">
      <section className="support-hero" aria-labelledby="help-title">
        <p className="support-eyebrow">KazmiOn support</p>
        <h1 id="help-title" className="support-title">Get help without interrupting your business.</h1>
        <p className="support-copy">Recover access, contact the KazmiOn team, or review how your business export is protected. Support is available to every signed-in workspace account.</p>
        <div className="support-actions">
          <Link className="support-button support-button--primary" to={help?.recoveryUrl ?? '/recover'}><KeyIcon /> Recover account access</Link>
          <a className="support-button" href={emailLink('KazmiOn support request')}><MailIcon /> Email support</a>
          {canExport && <Link className="support-button" to="/backup"><ArchiveIcon /> Business export</Link>}
        </div>
      </section>

      {support.isError && <div className="support-error" role="alert">We could not load live support settings. You can still email <a className="underline font-semibold" href={emailLink('KazmiOn support request')}>{FALLBACK_EMAIL}</a>.<button type="button" className="ml-3 underline font-semibold" onClick={() => support.refetch()}>Retry</button></div>}

      <div className="support-grid support-grid--three">
        <article className="support-card"><div className="support-icon"><MailIcon /></div><h2>Email support</h2><p>Use email for account access, package changes, module access, billing, or data recovery questions.</p><a className="text-sm font-bold text-[var(--accent-strong)] underline" href={emailLink('KazmiOn support request')}>{email}</a></article>
        <article className="support-card"><div className="support-icon"><KeyIcon /></div><h2>Secure recovery</h2><p>Recovery codes expire after {help?.codeExpiryMinutes ?? 10} minutes. Existing sessions are invalidated when account security changes.</p><Link className="text-sm font-bold text-[var(--accent-strong)] underline" to={help?.recoveryUrl ?? '/recover'}>Open recovery</Link></article>
        <article className="support-card"><div className="support-icon"><ArchiveIcon /></div><h2>Business data export</h2><p>Owners can download a tenant-scoped logical export for safekeeping or operator-reviewed recovery.</p>{canExport ? <Link className="text-sm font-bold text-[var(--accent-strong)] underline" to="/backup">Open Backup</Link> : <span className="text-sm font-semibold text-[var(--text-soft)]">Available to the business owner</span>}</article>
      </div>

      <div className="support-grid support-grid--two">
        <section className="support-card" aria-labelledby="support-details-title"><h2 id="support-details-title">Support details</h2><dl className="mt-3"><div className="support-detail"><dt>Email</dt><dd><a className="underline" href={emailLink('KazmiOn support request')}>{email}</a></dd></div><div className="support-detail"><dt>Email channel</dt><dd><span className={`support-status ${help?.channels.email !== false ? 'support-status--ok' : 'support-status--warn'}`}>{help?.channels.email !== false ? 'Available' : 'Unavailable'}</span></dd></div><div className="support-detail"><dt>WhatsApp</dt><dd><span className="support-status support-status--warn">Not configured</span></dd></div></dl></section>
        <section className="support-card" aria-labelledby="before-contact-title"><h2 id="before-contact-title">Before you contact us</h2><ul className="support-list"><li>Include your business name and the account email you use to sign in.</li><li>For an error, include the action you were taking and its time.</li><li>Never send a password, PIN, recovery code, or access token by email.</li><li>For data recovery, keep the original export file unchanged.</li></ul></section>
      </div>

      {!support.isPending && !support.data?.entitlements.help && <div className="support-alert" role="status"><InfoIcon /><div><strong>Support requests are managed by your business owner.</strong> You can still use account recovery and email the support team.</div></div>}
      {support.isPending && <div className="support-loading" role="status">Loading support settings…</div>}
    </div>
  );
}

function MailIcon() { return <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="m3 7 7.9 5.26a2 2 0 0 0 2.2 0L21 7M5 19h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2Z" /></svg>; }
function KeyIcon() { return <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8"><circle cx="8" cy="15" r="4" /><path strokeLinecap="round" strokeLinejoin="round" d="m11 12 8-8m-2 2 3 3m-5-1 3 3" /></svg>; }
function ArchiveIcon() { return <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M5 7l1 13h12l1-13M9 11v5m6-5v5M3 4h18v3H3z" /></svg>; }
function InfoIcon() { return <svg aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="9" /><path strokeLinecap="round" d="M12 10v6m0-9h.01" /></svg>; }
