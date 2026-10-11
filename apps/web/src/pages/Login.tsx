import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { authApi } from '../api';
import ThemeToggle from '../components/ThemeToggle';
import { useAuth } from '../store/auth';
import { errorMessage } from '../utils/errors';

type LoginStep = 'credentials' | 'pin' | 'reset-request' | 'reset';

export default function Login() {
  const navigate = useNavigate();
  const { user, setSession } = useAuth();
  const [step, setStep] = useState<LoginStep>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [challengeToken, setChallengeToken] = useState('');
  const [pinRequiresChange, setPinRequiresChange] = useState(false);
  const [notice, setNotice] = useState('');
  const login = useMutation({
    mutationFn: authApi.login,
    onSuccess: (res) => {
      if ('requiresPin' in res) {
        setChallengeToken(res.challengeToken);
        setPinRequiresChange(res.pinRequiresChange);
        setStep('pin');
      } else {
        setSession(res);
        navigate('/');
      }
    },
  });
  const completePin = useMutation({
    mutationFn: () => authApi.completePinLogin({ challengeToken, pin, newPin: pinRequiresChange ? newPin : undefined }),
    onSuccess: (res) => { setSession(res); navigate('/'); },
  });
  const requestReset = useMutation({
    mutationFn: () => authApi.requestPinReset(email),
    onSuccess: (res) => { setNotice(res.message); setStep('reset'); },
  });
  const resetPin = useMutation({
    mutationFn: () => authApi.resetPin({ email, code: resetCode, newPin }),
    onSuccess: (res) => { setNotice(res.message); setStep('credentials'); setPassword(''); setPin(''); setNewPin(''); setResetCode(''); },
  });

  if (user) return <Navigate to="/" replace />;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (step === 'credentials') login.mutate({ email, password });
    if (step === 'pin') completePin.mutate();
    if (step === 'reset-request') requestReset.mutate();
    if (step === 'reset') resetPin.mutate();
  };
  const error = login.error ?? completePin.error ?? requestReset.error ?? resetPin.error;
  const title = step === 'credentials' ? 'Sign in'
    : step === 'pin' ? 'Admin PIN'
      : step === 'reset-request' ? 'Reset admin PIN' : 'Enter reset code';

  return (
    <div className="box-border flex min-h-screen items-center justify-center p-3 sm:p-5">
      <div
        className="relative flex min-h-[calc(100vh-1.5rem)] w-full items-center justify-center overflow-hidden rounded-2xl border border-white/60 bg-cover bg-center bg-no-repeat p-3 shadow-[0_18px_56px_rgba(15,23,42,0.2)] sm:min-h-[calc(100vh-2.5rem)] sm:rounded-[28px] sm:p-5"
        style={{
          backgroundImage: "linear-gradient(115deg, rgba(5, 18, 28, 0.28), rgba(3, 47, 53, 0.38)), url('/pos-sign-in.jpg')",
          backgroundPosition: 'center top',
        }}
      >
      <div className="absolute right-4 top-4 z-10 sm:right-6 sm:top-6">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md overflow-hidden rounded-[26px] border border-teal-50/80 bg-[#f6faf9]/95 shadow-[0_28px_90px_rgba(5,25,35,0.32)] backdrop-blur-2xl md:max-w-5xl md:rounded-[28px] dark:border-teal-900/70 dark:bg-[#0b1820]/95">
        <div className="grid md:grid-cols-[1.1fr_0.9fr]">
          <div className="hidden bg-[#071b24]/75 p-8 text-white backdrop-blur-[2px] md:flex md:flex-col md:justify-between lg:p-10">
            <div>
              <span className="inline-flex rounded-full border border-teal-100/30 bg-teal-200/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-teal-50">
                Premium POS
              </span>
              <h1 className="mt-6 text-3xl font-semibold leading-tight">Run your business with confidence.</h1>
              <p className="mt-3 max-w-sm text-sm text-slate-100/90">
                Manage sales, inventory, customer accounts, and payments from one streamlined dashboard.
              </p>
            </div>
            <div className="space-y-3 text-sm text-slate-100/90">
              <div className="flex items-center gap-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-teal-200/20 text-base text-teal-50">✓</span>
                Real-time sales visibility
              </div>
              <div className="flex items-center gap-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-teal-200/20 text-base text-teal-50">✓</span>
                Faster invoice and installment workflows
              </div>
            </div>
          </div>

          <form onSubmit={submit} className="space-y-5 bg-[#f6faf9]/95 p-6 sm:p-8 md:border-l md:border-[#d4e5e2] md:p-10 dark:bg-[#0b1820]/95 dark:md:border-teal-950">
            <div>
              <p className="text-xs font-semibold uppercase text-teal-800 dark:text-teal-300">Welcome back</p>
              <h2 className="mt-2 text-3xl font-semibold leading-tight text-[#102a32] dark:text-slate-50">{title}</h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                {step === 'credentials' ? 'Welcome back to your POS.'
                  : step === 'pin' ? 'Enter your 4-digit admin PIN to continue.'
                    : step === 'reset-request' ? 'We will send a code to your verified recovery email.'
                      : 'Enter the emailed code and choose a new 4-digit PIN.'}
              </p>
            </div>

            {step !== 'pin' && <div>
              <label className="label">Account email</label>
              <input className="input border-[#c8dad7] bg-white focus:border-teal-700 focus:shadow-[0_0_0_4px_rgba(13,148,136,0.14)] dark:border-slate-700 dark:bg-slate-900 dark:focus:border-teal-400 dark:focus:shadow-[0_0_0_4px_rgba(45,212,191,0.14)]" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>}

            {step === 'credentials' && <div>
              <label className="label">Password</label>
              <input className="input border-[#c8dad7] bg-white focus:border-teal-700 focus:shadow-[0_0_0_4px_rgba(13,148,136,0.14)] dark:border-slate-700 dark:bg-slate-900 dark:focus:border-teal-400 dark:focus:shadow-[0_0_0_4px_rgba(45,212,191,0.14)]" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>}

            {step === 'pin' && <>
              {pinRequiresChange && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Your initial PIN is 0000. Create a private PIN to continue.</p>}
              <div><label className="label">4-digit PIN</label>
                <input className="input" type="password" inputMode="numeric" autoComplete="one-time-code" maxLength={4} pattern="[0-9]{4}" required value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))} /></div>
              {pinRequiresChange && <div><label className="label">New 4-digit PIN</label>
                <input className="input" type="password" inputMode="numeric" autoComplete="new-password" maxLength={4} pattern="[0-9]{4}" required value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))} /></div>}
            </>}

            {step === 'reset' && <>
              <div><label className="label">6-digit email code</label>
                <input className="input" inputMode="numeric" maxLength={6} pattern="[0-9]{6}" required value={resetCode} onChange={(e) => setResetCode(e.target.value.replace(/\D/g, '').slice(0, 6))} /></div>
              <div><label className="label">New 4-digit PIN</label>
                <input className="input" type="password" inputMode="numeric" maxLength={4} pattern="[0-9]{4}" required value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))} /></div>
            </>}

            {error && <p className="text-sm font-medium text-red-600">{errorMessage(error)}</p>}
            {notice && <p className="text-sm font-medium text-emerald-700">{notice}</p>}

            <button className="w-full rounded-xl bg-[#0e7779] px-4 py-3 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(14,119,121,0.25)] transition hover:bg-[#096568] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-[#087f80] dark:hover:bg-[#0b9290]" disabled={login.isPending || completePin.isPending || requestReset.isPending || resetPin.isPending}>
              {login.isPending ? 'Signing in…' : completePin.isPending ? 'Verifying PIN…' : requestReset.isPending ? 'Sending code…' : resetPin.isPending ? 'Resetting PIN…' : step === 'credentials' ? 'Sign in' : step === 'pin' ? (pinRequiresChange ? 'Set PIN and continue' : 'Verify PIN') : step === 'reset-request' ? 'Send reset code' : 'Reset PIN'}
            </button>

            {step === 'credentials' && <div className="flex justify-between text-sm">
              <button type="button" className="font-medium text-teal-800 hover:underline dark:text-teal-300" onClick={() => { setNotice(''); setStep('reset-request'); }}>Forgot PIN?</button>
              <Link className="font-medium text-teal-800 hover:underline dark:text-teal-300" to="/register">Create account</Link>
            </div>}
            {step !== 'credentials' && <button type="button" className="w-full text-sm text-slate-600 hover:underline dark:text-slate-300" onClick={() => { setStep('credentials'); setChallengeToken(''); setNotice(''); setPin(''); setNewPin(''); setResetCode(''); }}>Back to sign in</button>}
          </form>
        </div>
      </div>
      </div>
    </div>
  );
}
