import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { recoveryApi } from '../api';
import { useAuth } from '../store/auth';
import { errorMessage } from '../utils/errors';
import { useRecoveryCooldown } from '../hooks/useRecoveryCooldown';
import ThemeToggle from '../components/ThemeToggle';

export default function Recovery({ channel = 'email' }: { channel?: 'email' | 'whatsapp' }) {
  const [params] = useSearchParams();
  const user = useAuth((state) => state.user);
  const [email, setEmail] = useState(user?.email ?? '');
  const [purpose, setPurpose] = useState(params.get('purpose') === 'pin' ? 'pin' : 'password');
  const [challenge, setChallenge] = useState('');
  const [completed, setCompleted] = useState(false);
  const [code, setCode] = useState('');
  const [secret, setSecret] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [notice, setNotice] = useState('');
  const [localError, setLocalError] = useState('');
  const { seconds, startCooldown } = useRecoveryCooldown();
  const [returnToDeveloper] = useState(() => params.get('source') === 'developer' || user?.isDeveloper === true);
  const signInPath = returnToDeveloper ? '/developer' : '/login';
  const alternativeMethod = channel === 'email' ? '/recover/whatsapp' : '/recover';
  const recoveryParams = returnToDeveloper ? `?purpose=${purpose}&source=developer` : `?purpose=${purpose}`;
  useEffect(() => { if (challenge) document.getElementById('recovery-code')?.focus(); }, [challenge]);
  const options = useQuery({ queryKey: ['recovery-options'], queryFn: recoveryApi.options, retry: false });
  const request = useMutation({ mutationFn: () => recoveryApi.request({ email: email.trim(), purpose, channel }), onSuccess: (result) => { setChallenge(result.challengeId); setCode(''); setSecret(''); setConfirmation(''); setNotice(result.message); startCooldown(result.resendAfter); } });
  const confirm = useMutation({ mutationFn: () => recoveryApi.confirm({ challengeId: challenge, code, newSecret: secret }), onSuccess: (result) => { setCompleted(true); if (useAuth.getState().user) useAuth.getState().logout(); setChallenge(''); setCode(''); setSecret(''); setConfirmation(''); setNotice(result.message); } });
  const pending = request.isPending || confirm.isPending;
  const error = request.error || confirm.error;
  const clearErrors = () => { request.reset(); confirm.reset(); setLocalError(''); setNotice(''); };
  const submit = (event: FormEvent) => {
    event.preventDefault(); clearErrors();
    if (challenge) { if (secret !== confirmation) { setLocalError('The confirmation does not match.'); return; } confirm.mutate(); }
    else if (options.data?.[channel] && !seconds) request.mutate();
  };
  const isPassword = purpose === 'password';
  const pinLength = 4;
  const channelReady = options.data?.[channel] === true;
  return <main className="mx-auto w-full max-w-xl px-4 py-8 sm:py-12">
    <div className="mb-5 flex items-center justify-between"><Link to={user ? '/account-security' : signInPath} className="text-sm text-blue-700 dark:text-blue-300">{user ? '← Account security' : '← Back to sign in'}</Link><ThemeToggle /></div>
    <section className="card space-y-5" aria-labelledby="recovery-title">
      <header className="space-y-2"><p className="page-eyebrow">Account security</p><h1 id="recovery-title" className="page-title">{completed ? 'Access restored' : challenge ? 'Verify your code' : channel === 'whatsapp' ? 'Recover with WhatsApp' : 'Recover account access'}</h1><p className="text-sm text-slate-500">{completed ? 'Sign in with your updated credentials.' : channel === 'whatsapp' ? 'Use the WhatsApp number you verified before losing access.' : 'Get a one-time code by email to reset your password or account PIN.'}</p></header>
      {!completed && options.isPending && <p role="status">Checking available delivery methods…</p>}
      {!completed && options.isError && <p role="alert">Unable to check delivery methods. Refresh and try again.</p>}
      {!completed && <form onSubmit={submit} className="space-y-4">
        <fieldset disabled={pending} className="min-w-0 space-y-4">
          {!challenge ? <>
            <div><label className="label" htmlFor="recovery-purpose">What would you like to change?</label><select className="input w-full" id="recovery-purpose" value={purpose} onChange={(event) => { setPurpose(event.target.value); clearErrors(); }}><option value="password">Password</option><option value="pin">Account PIN (4 digits)</option></select></div>
            <div><label className="label" htmlFor="recovery-email">Account sign-in email</label><input className="input w-full" id="recovery-email" type="email" autoComplete="username" autoCapitalize="none" required value={email} onChange={(event) => { setEmail(event.target.value); clearErrors(); }} /></div>
            {options.data?.[channel] === false && <p role="status" className="text-sm text-amber-700 dark:text-amber-300">{channel === 'email' ? 'Email' : 'WhatsApp'} delivery is not configured. Contact the platform administrator.</p>}
            <button className="btn-primary w-full" type="submit" disabled={!channelReady || seconds > 0}>{request.isPending ? 'Sending…' : seconds ? `Try again in ${seconds}s` : 'Send verification code'}</button>
          </> : <>
            <p className="text-sm">Restoring {purpose} for <strong className="break-all">{email}</strong> by {channel}.</p>
            <div><label className="label" htmlFor="recovery-code">6-digit verification code</label><input autoFocus className="input w-full" id="recovery-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]{6}" required value={code} onChange={(event) => { setCode(event.target.value.replace(/\D/g, '').slice(0, 6)); confirm.reset(); }} /></div>
            <div><label className="label" htmlFor="recovery-secret">{isPassword ? 'New password' : `New ${pinLength}-digit PIN`}</label><input className="input w-full" id="recovery-secret" type="password" inputMode={isPassword ? 'text' : 'numeric'} autoComplete="new-password" minLength={isPassword ? 8 : pinLength} maxLength={isPassword ? 72 : pinLength} pattern={isPassword ? undefined : `[0-9]{${pinLength}}`} required value={secret} onChange={(event) => setSecret(event.target.value)} /></div>
            <div><label className="label" htmlFor="recovery-confirmation">{isPassword ? 'Confirm password' : 'Confirm PIN'}</label><input className="input w-full" id="recovery-confirmation" type="password" autoComplete="new-password" required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></div>
            <button className="btn-primary w-full" type="submit">{confirm.isPending ? 'Updating…' : `Verify and update ${isPassword ? 'password' : 'PIN'}`}</button>
            <div className="flex flex-wrap gap-3"><button className="btn-secondary" type="button" disabled={seconds > 0} onClick={() => { clearErrors(); request.mutate(); }}>{seconds ? `Resend in ${seconds}s` : 'Send a new code'}</button><button className="btn-secondary" type="button" onClick={() => { setChallenge(''); setSecret(''); setConfirmation(''); setCode(''); clearErrors(); }}>Change account</button></div>
            <p className="text-xs text-slate-500">Codes expire in 10 minutes and can be used once. Five incorrect attempts require a new code. Updating your credentials signs out all existing sessions.</p>
          </>}
        </fieldset>
      </form>}
      {!challenge && !completed && <Link className="text-sm underline" to={alternativeMethod + recoveryParams}>{channel === 'email' ? 'Recover with WhatsApp' : 'Recover by email'}</Link>}
      {!challenge && completed && <Link className="btn-primary inline-flex" to={signInPath}>Continue to sign in</Link>}
      {(error || localError) && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{localError || errorMessage(error)}</p>}
      {notice && <p role="status" className="rounded-lg bg-blue-50 p-3 text-sm text-blue-800 dark:bg-blue-950 dark:text-blue-200">{notice}</p>}
    </section>
  </main>;
}
