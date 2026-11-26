import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { recoveryApi } from '../api';
import ChangePassword from '../components/ChangePassword';
import ThemeToggle from '../components/ThemeToggle';
import { useRecoveryCooldown } from '../hooks/useRecoveryCooldown';
import { useAuth } from '../store/auth';
import { errorMessage } from '../utils/errors';

function SecurityPage({ backTo, backLabel, children }: { backTo: string; backLabel: string; children: ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-xl px-4 py-8 sm:py-12">
      <div className="mb-5 flex items-center justify-between">
        <Link to={backTo} className="text-sm text-blue-700 dark:text-blue-300">← {backLabel}</Link>
        <ThemeToggle />
      </div>
      {children}
    </main>
  );
}

export function AccountSecurity() {
  const user = useAuth((state) => state.user);
  const [params] = useSearchParams();
  if (!user) return <Navigate to={params.get('source') === 'developer' ? '/developer' : '/login'} replace />;

  const source = user.isDeveloper ? '?source=developer' : '';
  const backTo = user.isDeveloper ? '/developer' : user.isSuperAdmin ? '/super-admin' : '/';
  const actions = [
    { label: 'Change password', detail: 'Use your current password to set a new one.', to: '/account-security/change-password' },
    { label: 'Recover account access', detail: 'Reset a forgotten password or PIN with a code by email.', to: '/recover' },
    { label: 'WhatsApp recovery', detail: 'Verify a number to receive recovery codes by WhatsApp.', to: '/account-security/whatsapp' },
  ];
  return (
    <SecurityPage backTo={backTo} backLabel="Back to workspace">
      <section className="card space-y-5" aria-labelledby="account-security-title">
        <h1 id="account-security-title" className="page-title">Account security</h1>
        <nav aria-label="Security actions" className="space-y-2">
          {actions.map(({ label, detail, to }) => (
            <div key={to} className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 py-3 last:border-0 dark:border-slate-700">
              <p className="text-sm text-slate-600 dark:text-slate-300">{detail}</p>
              <Link className="btn-secondary inline-flex" to={to + source}>{label}</Link>
            </div>
          ))}
        </nav>
      </section>
    </SecurityPage>
  );
}

export function ChangePasswordPage() {
  const user = useAuth((state) => state.user);
  const [params] = useSearchParams();
  const [developer] = useState(() => user?.isDeveloper === true || params.get('source') === 'developer');
  const [changed, setChanged] = useState(false);
  const signInPath = developer ? '/developer' : '/login';
  if (!user && !changed) return <Navigate to={signInPath} replace />;

  return (
    <SecurityPage backTo={changed ? signInPath : '/account-security'} backLabel={changed ? 'Back to sign in' : 'Account security'}>
      {changed ? (
        <section className="card space-y-4">
          <h1 className="page-title">Password changed</h1>
          <p role="status">Sign in with your new password.</p>
          <Link className="btn-primary inline-flex" to={signInPath}>Continue to sign in</Link>
        </section>
      ) : <ChangePassword key={user?._id} onChanged={() => setChanged(true)} />}
    </SecurityPage>
  );
}

export function WhatsAppSettings() {
  const user = useAuth((state) => state.user);
  const [params] = useSearchParams();
  if (!user) return <Navigate to={params.get('source') === 'developer' ? '/developer' : '/login'} replace />;

  return (
    <SecurityPage backTo="/account-security" backLabel="Account security">
      <VerifyWhatsApp key={user._id} currentPhone={user.phone ?? ''} developer={user.isDeveloper === true} />
    </SecurityPage>
  );
}

function VerifyWhatsApp({ currentPhone, developer }: { currentPhone: string; developer: boolean }) {
  const options = useQuery({ queryKey: ['recovery-options'], queryFn: recoveryApi.options, retry: false });
  const { seconds, startCooldown } = useRecoveryCooldown();
  const [phone, setPhone] = useState(currentPhone);
  const [consent, setConsent] = useState(false);
  const [challenge, setChallenge] = useState('');
  const [code, setCode] = useState('');
  const [notice, setNotice] = useState('');
  const request = useMutation({
    mutationFn: () => recoveryApi.requestPhone(phone.trim()),
    onSuccess: (result) => {
      setChallenge(result.challengeId);
      setCode('');
      setNotice(result.message);
      startCooldown(result.resendAfter);
    },
  });
  const confirm = useMutation({
    mutationFn: () => recoveryApi.confirmPhone({ challengeId: challenge, code }),
    onSuccess: (result) => {
      setChallenge('');
      setCode('');
      setConsent(false);
      setNotice(result.message);
    },
  });
  const pending = request.isPending || confirm.isPending;
  const error = request.error || confirm.error;
  useEffect(() => { if (challenge) document.getElementById('phone-otp')?.focus(); }, [challenge]);

  function submit(event: FormEvent) {
    event.preventDefault();
    setNotice('');
    if (challenge) {
      confirm.mutate();
    } else if (options.data?.whatsapp && consent && !seconds) {
      request.mutate();
    }
  }

  return (
    <section className="card space-y-4" aria-labelledby="whatsapp-settings-title">
      <h1 id="whatsapp-settings-title" className="page-title">WhatsApp recovery</h1>
      <p className="text-sm text-slate-600 dark:text-slate-300">Verify your WhatsApp number before using it for account recovery.</p>
      {options.isPending && <p role="status">Checking WhatsApp availability…</p>}
      {options.isError && <p role="alert">Could not check WhatsApp availability. <button className="underline" onClick={() => void options.refetch()}>Retry</button></p>}
      {options.data?.whatsapp === false && <p role="status">WhatsApp delivery is not configured. Contact the platform administrator.</p>}
      <form onSubmit={submit}>
        <fieldset disabled={pending} className="min-w-0 space-y-4">
          <div>
            <label className="label" htmlFor="security-phone">WhatsApp number with country code</label>
            <input className="input w-full" id="security-phone" type="tel" autoComplete="tel"
              placeholder="+923001234567" pattern="\+[1-9][0-9]{7,14}" required readOnly={!!challenge}
              value={phone} onChange={(event) => { setPhone(event.target.value); setNotice(''); request.reset(); }} />
          </div>
          {challenge ? (
            <div>
              <label className="label" htmlFor="phone-otp">WhatsApp verification code</label>
              <input className="input w-full" id="phone-otp" inputMode="numeric" autoComplete="one-time-code"
                maxLength={6} pattern="[0-9]{6}" required value={code}
                onChange={(event) => { setCode(event.target.value.replace(/\D/g, '').slice(0, 6)); confirm.reset(); }} />
            </div>
          ) : (
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" required checked={consent} onChange={(event) => setConsent(event.target.checked)} />
              Send account security codes to my WhatsApp number.
            </label>
          )}
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" type="submit" disabled={!challenge && (!options.data?.whatsapp || seconds > 0)}>
              {challenge ? 'Verify WhatsApp number' : seconds ? `Send another code in ${seconds}s` : 'Send WhatsApp verification code'}
            </button>
            {challenge && <button className="btn-secondary" type="button" onClick={() => { setChallenge(''); setCode(''); setNotice(''); confirm.reset(); }}>Start again</button>}
          </div>
        </fieldset>
      </form>
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert">{errorMessage(error)}</p>}
      <Link className="text-sm underline" to={developer ? '/recover/whatsapp?source=developer' : '/recover/whatsapp'}>Recover with WhatsApp</Link>
    </section>
  );
}
