import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { IconHelp, IconBackup } from '../components/Icons';

interface PlatformModuleEntry {
  key: string;
  label: string;
  description?: string;
  releaseState?: 'active' | 'coming-soon' | 'retired';
  version?: string;
  installed?: boolean;
}

interface HelpInfo {
  email: string;
  recoveryUrl: string;
  channels: { email: boolean; whatsapp: boolean };
  codeExpiryMinutes: number;
  maxAttempts: number;
  cooldownSeconds: number;
}

interface SupportResponse {
  help: HelpInfo;
  entitlements: { help: boolean; backup: boolean };
  backup: any;
  chatbot: { status: string; label: string };
}

const DEVELOPER_CONTACT = {
  company: 'KazmiOn (KazmiTech)',
  email: 'kazmitech142@gmail.com',
  recoveryUrl: '/recover',
  hours: 'Sat – Thu, 10:00 – 18:00 PKT',
};

export default function Help() {
  const info = useQuery({
    queryKey: ['support'],
    queryFn: () => api.get<SupportResponse>('/support').then((r) => r.data),
  });
  const roadmap = useQuery({
    queryKey: ['support', 'modules'],
    queryFn: () => api.get<PlatformModuleEntry[]>('/developer/public-modules').then((r) => r.data),
    retry: false,
  });
  const upcoming = (roadmap.data ?? []).filter((m) => m.releaseState === 'coming-soon');
  const active = (roadmap.data ?? []).filter((m) => m.releaseState === 'active');
  const helpEnabled = !!info.data?.entitlements?.help;

  const mailto = (subject: string) =>
    `mailto:${info.data?.help.email ?? DEVELOPER_CONTACT.email}?subject=${encodeURIComponent(subject)}`;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <section className="dev-panel padded">
        <header>
          <p className="kicker">KazmiOn support center</p>
          <h3>Help &amp; support</h3>
        </header>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Reach the developer engine support team, recover account access, or browse what is available in this build.
        </p>

        <div className="dev-grid cols-2" style={{ marginTop: 14 }}>
          <a
            className="dev-btn dev-btn-primary"
            href={info.data?.help.recoveryUrl ?? DEVELOPER_CONTACT.recoveryUrl}
          >
            <IconHelp className="w-4 h-4" /> Recover account access
          </a>
          <a className="dev-btn dev-btn-ghost" href={mailto('KazmiOn support request')}>
            <IconMail className="w-4 h-4" /> Email support team
          </a>
          {info.data?.help.channels.whatsapp ? (
            <a className="dev-btn dev-btn-ghost" href="https://wa.me/15550123456" rel="noopener noreferrer" target="_blank">
              <IconPhone className="w-4 h-4" /> WhatsApp support
            </a>
          ) : null}
          <Link className="dev-btn dev-btn-ghost" to="/backup">
            <IconBackup className="w-4 h-4" /> Export business backup
          </Link>
        </div>

        <dl className="grid gap-2 sm:grid-cols-4 text-sm mt-6">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Company</dt>
            <dd className="font-medium">{DEVELOPER_CONTACT.company}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Email</dt>
            <dd className="font-medium break-all">{info.data?.help.email ?? DEVELOPER_CONTACT.email}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Hours</dt>
            <dd className="font-medium">{DEVELOPER_CONTACT.hours}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recovery codes</dt>
            <dd className="font-medium">{info.data?.help.codeExpiryMinutes ?? 10} min expiry</dd>
          </div>
        </dl>
      </section>
      {/* Contact card */}
      <section className="dev-panel padded">
        <header>
          <p className="kicker">Get in touch</p>
          <h3>Contact the developer engine team</h3>
        </header>
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
          For provisioning changes, plan upgrades, module entitlements, or data recovery, contact the support email
          below. Unknown or ineligible accounts receive a generic response; no account-specific contact details are exposed.
        </p>
        <div className="dev-list-item">
          <div className="dev-list-item-main">
            <span className="dev-list-item-title">{info.data?.help.email ?? DEVELOPER_CONTACT.email}</span>
            <span className="dev-list-item-sub">{DEVELOPER_CONTACT.hours} &bull; response typically within one business day</span>
          </div>
          <a className="dev-btn dev-btn-sm dev-btn-ghost" href={mailto('KazmiOn support request')}>
            Write email
          </a>
        </div>
      </section>

      {/* Channels */}
      <section className="dev-panel padded">
        <header>
          <p className="kicker">Support channels</p>
          <h3>Available channels</h3>
        </header>
        <div className="space-y-3">
          <div className="dev-list-item">
            <div className="dev-list-item-main">
              <span className="dev-list-item-title">Email</span>
              <span className="dev-list-item-sub">{info.data?.help.channels.email ? 'Enabled' : 'Not configured'}</span>
            </div>
            <span className={`dev-badge ${info.data?.help.channels.email ? 'dev-badge-success' : 'dev-badge-outline'}`}>
              {info.data?.help.channels.email ? 'Active' : 'Unavailable'}
            </span>
          </div>
          <div className="dev-list-item">
            <div className="dev-list-item-main">
              <span className="dev-list-item-title">WhatsApp</span>
              <span className="dev-list-item-sub">{info.data?.help.channels.whatsapp ? 'Enabled' : 'Not configured'}</span>
            </div>
            <span className={`dev-badge ${info.data?.help.channels.whatsapp ? 'dev-badge-success' : 'dev-badge-outline'}`}>
              {info.data?.help.channels.whatsapp ? 'Active' : 'Unavailable'}
            </span>
          </div>
        </div>
        <p className="text-xs text-slate-500 mt-2">
          Recovery is invalidated by account disablement, session-version changes, or a recovery-contact change. Passwords
          require 8–72 UTF-8 bytes; developer PINs require eight digits and cannot be all zero.
        </p>
      </section>

      {!helpEnabled && (
        <section className="dev-panel padded" style={{ borderColor: 'rgba(245,158,11,0.25)' }}>
          <div className="dev-list-item" style={{ background: 'rgba(245,158,11,0.06)', borderColor: 'rgba(245,158,11,0.18)' }}>
            <div className="dev-list-item-main">
              <span className="dev-list-item-title" style={{ color: '#b45309' }}>Help access not entitled</span>
              <span className="dev-list-item-sub">Your current role cannot open support tickets. Ask your business owner to grant help entitlement.</span>
            </div>
          </div>
        </section>
      )}
      {/* Module catalogue */}
      <section className="dev-panel padded">
        <header>
          <p className="kicker">Platform modules</p>
          <h3>Modules in this build</h3>
        </header>
        {roadmap.isPending ? (
          <p className="text-sm text-slate-500">Loading module catalogue…</p>
        ) : roadmap.isError ? (
          <p className="text-sm text-slate-500">Module roadmap is unavailable right now.</p>
        ) : (
          <>
            {active.length > 0 && (
              <>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Active</p>
                <div className="flex flex-wrap gap-2">
                  {active.map((m) => (
                    <span
                      key={m.key}
                      className="dev-badge dev-badge-active"
                      title={m.description}
                    >
                      {m.label}
                      {m.version && <span className="text-[10px] opacity-70 ml-1">v{m.version}</span>}
                    </span>
                  ))}
                </div>
              </>
            )}
            {upcoming.length > 0 && (
              <div className="mt-4">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">Upcoming modules</h3>
                <ul className="space-y-2 text-sm">
                  {upcoming.map((m) => (
                    <li key={m.key} className="dev-list-item">
                      <div className="dev-list-item-main">
                        <span className="dev-list-item-title">{m.label}</span>
                        {m.description && <span className="dev-list-item-sub">{m.description}</span>}
                      </div>
                      <span className="dev-badge dev-badge-warn">Coming soon</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {!active.length && !upcoming.length && (
              <div className="dev-empty">
                <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 8.988 9.246 9 6 9c-2.63 0-10.553-.01-10.553-2.75S3.37 3.458 6 3.458m13.447-2.75c.674-1.333 2.272-2.75 4.553-2.75 2.273 0 4.553 1.182 4.553 2.75 0 1.584-3.928 2.75-10.553 2.75" />
                </svg>
                <h3>No modules registered</h3>
                <p>The platform module catalogue is empty for this build.</p>
              </div>
            )}
          </>
        )}
      </section>

      {/* Chatbot */}
      <section className="dev-panel padded">
        <header>
          <p className="kicker">AI assistant</p>
          <h3>AI Chatbot — Coming soon</h3>
        </header>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Registered in the module catalog. Chat and automated business actions are not available yet.
        </p>
        {info.data?.chatbot && (
          <dl className="grid gap-2 sm:grid-cols-2 text-sm mt-4">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status</dt>
              <dd className="font-medium capitalize">{info.data.chatbot.status}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Label</dt>
              <dd className="font-medium">{info.data.chatbot.label}</dd>
            </div>
          </dl>
        )}
      </section>
    </div>
  );
}
function IconMail(props: any) {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8m-5.471 10.538a2 2 0 01-2.22 0L3 16m13-3l-4-2.667a2 2 0 01-2.22 0L3 13m13 3v-6.5L19 6.412" />
    </svg>
  );
}
function IconPhone(props: any) {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372" />
    </svg>
  );
}