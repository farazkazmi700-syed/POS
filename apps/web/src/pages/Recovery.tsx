import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { recoveryApi } from '../api';
import { useAuth } from '../store/auth';
import { errorMessage } from '../utils/errors';
import ThemeToggle from '../components/ThemeToggle';

export default function Recovery() {
  const [params] = useSearchParams();
  const user = useAuth((state) => state.user);
  const [email, setEmail] = useState(user?.email ?? '');
  const [purpose, setPurpose] = useState(params.get('purpose') === 'developer-pin' ? 'developer-pin' : 'password');
  const [channel, setChannel] = useState('email');
  const [challenge, setChallenge] = useState('');
  const [code, setCode] = useState('');
  const [secret, setSecret] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [notice, setNotice] = useState('');
  const [localError, setLocalError] = useState('');
  const [retryAt, setRetryAt] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [phoneChallenge, setPhoneChallenge] = useState('');
  const [phoneCode, setPhoneCode] = useState('');
  const [phoneConsent, setPhoneConsent] = useState(false);
  useEffect(() => { if (phoneChallenge || challenge) document.getElementById(phoneChallenge ? 'phone-otp' : 'recovery-code')?.focus(); }, [phoneChallenge, challenge]);
  const options = useQuery({ queryKey: ['recovery-options'], queryFn: recoveryApi.options, retry: false });
  useEffect(() => { const update = () => setSeconds(Math.max(0, Math.ceil((retryAt - Date.now()) / 1000))); update(); const timer = setInterval(update, 1000); return () => clearInterval(timer); }, [retryAt]);
  const request = useMutation({ mutationFn: () => recoveryApi.request({ email: email.trim(), purpose, channel }), onSuccess: (result) => { setChallenge(result.challengeId); setCode(''); setSecret(''); setConfirmation(''); setNotice(result.message); setRetryAt(Date.now() + result.resendAfter * 1000); } });
  const confirm = useMutation({ mutationFn: () => recoveryApi.confirm({ challengeId: challenge, code, newSecret: secret }), onSuccess: (result) => { if (useAuth.getState().user) useAuth.getState().logout(); setChallenge(''); setCode(''); setSecret(''); setConfirmation(''); setNotice(result.message); } });
  const phoneRequest = useMutation({ mutationFn: () => recoveryApi.requestPhone(phone.trim()), onSuccess: (result) => { setPhoneChallenge(result.challengeId); setPhoneCode(''); setNotice(result.message); setRetryAt(Date.now() + result.resendAfter * 1000); } });
  const phoneConfirm = useMutation({ mutationFn: () => recoveryApi.confirmPhone({ challengeId: phoneChallenge, code: phoneCode }), onSuccess: (result) => { setPhoneChallenge(''); setPhoneCode(''); setNotice(result.message); } });
  const pending = request.isPending || confirm.isPending || phoneRequest.isPending || phoneConfirm.isPending;
  const error = request.error || confirm.error || phoneRequest.error || phoneConfirm.error;
  const clearErrors = () => { request.reset(); confirm.reset(); phoneRequest.reset(); phoneConfirm.reset(); setLocalError(''); setNotice(''); };
  const submit = (event: FormEvent) => {
    event.preventDefault(); clearErrors();
    if (challenge) { if (secret !== confirmation) { setLocalError('The confirmation does not match.'); return; } confirm.mutate(); }
    else request.mutate();
  };
  const isPassword = purpose === 'password';
  const pinLength = purpose === 'developer-pin' ? 8 : 4;
  const channelReady = options.data?.[channel as 'email' | 'whatsapp'] === true;
  return <main className="mx-auto w-full max-w-xl px-4 py-8 sm:py-12">
    <div className="mb-5 flex items-center justify-between"><Link to={user?.isDeveloper ? '/developer' : '/login'} className="text-sm text-blue-700 dark:text-blue-300">← Back to sign in</Link><ThemeToggle /></div>
    <section className="card space-y-5" aria-labelledby="recovery-title">
      <header className="space-y-2"><p className="page-eyebrow">Account security</p><h1 id="recovery-title" className="page-title">{challenge ? 'Verify your code' : 'Change or restore access'}</h1><p className="text-sm text-slate-500">Verify a one-time code sent to your account email, verified recovery email, or verified WhatsApp number.</p></header>
      {options.isPending && <p role="status">Checking available delivery methods…</p>}
      {options.isError && <p role="alert">Unable to check delivery methods. Refresh and try again.</p>}
      <form onSubmit={submit} className="space-y-4">
        <fieldset disabled={pending || !!phoneChallenge} className="min-w-0 space-y-4">
          {!challenge ? <>
            <div><label className="label" htmlFor="recovery-purpose">What would you like to change?</label><select className="input w-full" id="recovery-purpose" value={purpose} onChange={(event) => { setPurpose(event.target.value); clearErrors(); }}><option value="password">Password</option><option value="pin">Account PIN (4 digits)</option><option value="developer-pin">Developer PIN (8 digits)</option></select></div>
            <div><label className="label" htmlFor="recovery-email">Account sign-in email</label><input className="input w-full" id="recovery-email" type="email" autoComplete="username" autoCapitalize="none" required value={email} onChange={(event) => { setEmail(event.target.value); clearErrors(); }} /></div>
            <div><label className="label" htmlFor="recovery-channel">Send verification code by</label><select className="input w-full" id="recovery-channel" value={channel} onChange={(event) => { setChannel(event.target.value); clearErrors(); }}><option value="email">Email{options.data?.email === false ? ' — not configured' : ''}</option><option value="whatsapp" disabled={!options.data?.whatsapp}>WhatsApp{!options.data?.whatsapp ? ' — not configured' : ''}</option></select><p className="mt-2 text-xs text-slate-500">WhatsApp requires a number previously verified in Account security. You cannot select a new destination while restoring access.</p></div>
            {options.data?.email === false && channel === 'email' && <p role="status" className="text-sm text-amber-700 dark:text-amber-300">Email delivery is not configured. Contact the platform administrator.</p>}
            <button className="btn-primary w-full" type="submit" disabled={!channelReady || seconds > 0}>{request.isPending ? 'Sending…' : seconds ? `Try again in ${seconds}s` : 'Send verification code'}</button>
          </> : <>
            <p className="text-sm">Restoring {purpose === 'developer-pin' ? 'developer PIN' : purpose} for <strong className="break-all">{email}</strong> by {channel}.</p>
            <div><label className="label" htmlFor="recovery-code">6-digit verification code</label><input autoFocus className="input w-full" id="recovery-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]{6}" required value={code} onChange={(event) => { setCode(event.target.value.replace(/\D/g, '').slice(0, 6)); confirm.reset(); }} /></div>
            <div><label className="label" htmlFor="recovery-secret">{isPassword ? 'New password' : `New ${pinLength}-digit PIN`}</label><input className="input w-full" id="recovery-secret" type="password" inputMode={isPassword ? 'text' : 'numeric'} autoComplete="new-password" minLength={isPassword ? 8 : pinLength} maxLength={isPassword ? 72 : pinLength} pattern={isPassword ? undefined : `[0-9]{${pinLength}}`} required value={secret} onChange={(event) => setSecret(event.target.value)} /></div>
            <div><label className="label" htmlFor="recovery-confirmation">{isPassword ? 'Confirm password' : 'Confirm PIN'}</label><input className="input w-full" id="recovery-confirmation" type="password" autoComplete="new-password" required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></div>
            <button className="btn-primary w-full" type="submit">{confirm.isPending ? 'Updating…' : `Verify and update ${isPassword ? 'password' : 'PIN'}`}</button>
            <div className="flex flex-wrap gap-3"><button className="btn-secondary" type="button" disabled={seconds > 0} onClick={() => { clearErrors(); request.mutate(); }}>{seconds ? `Resend in ${seconds}s` : 'Send a new code'}</button><button className="btn-secondary" type="button" onClick={() => { setChallenge(''); setSecret(''); setConfirmation(''); setCode(''); clearErrors(); }}>Change account or method</button></div>
            <p className="text-xs text-slate-500">Codes expire in 10 minutes and can be used once. Five incorrect attempts require a new code. Updating your credentials signs out all existing sessions.</p>
          </>}
        </fieldset>
      </form>
      {(error || localError) && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{localError || errorMessage(error)}</p>}
      {notice && <p role="status" className="rounded-lg bg-blue-50 p-3 text-sm text-blue-800 dark:bg-blue-950 dark:text-blue-200">{notice}</p>}
      {!challenge && notice.includes('Updated successfully') && <Link className="btn-primary inline-flex" to={purpose === 'developer-pin' ? '/developer' : '/login'}>Continue to sign in</Link>}
    </section>
    {user && <section className="card mt-6 space-y-4" aria-labelledby="phone-verify-title"><h2 id="phone-verify-title" className="text-lg font-semibold">Verify WhatsApp for recovery</h2><p className="text-sm text-slate-500">Confirm a code at your own number before using it to restore access.</p><form className="space-y-4" onSubmit={(event) => { event.preventDefault(); clearErrors(); if (phoneChallenge) phoneConfirm.mutate(); else phoneRequest.mutate(); }}><fieldset disabled={pending} className="space-y-4"><div><label className="label" htmlFor="security-phone">WhatsApp number with country code</label><input className="input w-full" id="security-phone" type="tel" autoComplete="tel" placeholder="+923001234567" pattern="\+[1-9][0-9]{7,14}" required readOnly={!!phoneChallenge} value={phone} onChange={(event) => setPhone(event.target.value)} /></div>{phoneChallenge ? <div><label className="label" htmlFor="phone-otp">WhatsApp verification code</label><input className="input w-full" id="phone-otp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]{6}" required value={phoneCode} onChange={(event) => setPhoneCode(event.target.value.replace(/\D/g, ''))} /></div> : <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" required checked={phoneConsent} onChange={(event) => setPhoneConsent(event.target.checked)} />Send account security codes to my WhatsApp number.</label>}<button className="btn-secondary" type="submit" disabled={!options.data?.whatsapp || !phoneChallenge && seconds > 0}>{phoneChallenge ? 'Verify WhatsApp number' : 'Send WhatsApp verification code'}</button>{phoneChallenge && <button className="btn-secondary ml-2" type="button" onClick={() => { setPhoneChallenge(''); setPhoneCode(''); }}>Start again</button>}{!options.data?.whatsapp && <p className="text-sm text-slate-500">WhatsApp delivery has not been configured by the platform administrator.</p>}</fieldset></form></section>}
  </main>;
}
