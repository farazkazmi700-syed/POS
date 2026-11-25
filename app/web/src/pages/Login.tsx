import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { authApi, recoveryApi } from '../api';
import ThemeToggle from '../components/ThemeToggle';
import { useAuth } from '../store/auth';
import { errorMessage } from '../utils/errors';
import './Login.css';

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
  const [resetChallenge, setResetChallenge] = useState('');
  const [challengeToken, setChallengeToken] = useState('');
  const [pinRequiresChange, setPinRequiresChange] = useState(false);
  const [notice, setNotice] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const previousStep = useRef(step);
  useEffect(() => {
    if (previousStep.current === step) return;
    previousStep.current = step;
    const inputId = step === 'pin' ? 'login-pin' : step === 'reset' ? 'reset-code' : step === 'credentials' && email ? 'login-password' : 'login-email';
    document.getElementById(inputId)?.focus({ preventScroll: true });
  }, [step, email]);
  const login = useMutation({
    mutationFn: authApi.login,
    onSuccess: (res) => {
      if ('requiresPin' in res) {
        setChallengeToken(res.challengeToken);
        setPinRequiresChange(res.pinRequiresChange);
        setPassword('');
        setShowPassword(false);
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
    mutationFn: () => recoveryApi.request({ email: email.trim(), purpose: 'pin', channel: 'email' }),
    onSuccess: (res) => { setResetChallenge(res.challengeId); setNotice(res.message); setStep('reset'); },
  });
  const resetPin = useMutation({
    mutationFn: () => recoveryApi.confirm({ challengeId: resetChallenge, code: resetCode, newSecret: newPin }),
    onSuccess: (res) => { setNotice(res.message); setStep('credentials'); setPassword(''); setPin(''); setNewPin(''); setResetCode(''); },
  });

  if (user) return <Navigate to="/" replace />;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (login.isPending || completePin.isPending || requestReset.isPending || resetPin.isPending) return;
    if (step === 'credentials') { setNotice(''); login.mutate({ email: email.trim(), password }); }
    if (step === 'pin') completePin.mutate();
    if (step === 'reset-request') requestReset.mutate();
    if (step === 'reset') resetPin.mutate();
  };
  const error = step === 'credentials' ? login.error : step === 'pin' ? completePin.error : step === 'reset-request' ? requestReset.error : resetPin.error;
  const pending = login.isPending || completePin.isPending || requestReset.isPending || resetPin.isPending;
  const changeStep = (next: LoginStep) => {
    login.reset(); completePin.reset(); requestReset.reset(); resetPin.reset();
    setNotice(''); setPin(''); setNewPin(''); setResetCode('');
    setCapsLock(false);
    setStep(next);
  };

  return (
    <main className="sign-in-page">
      <div className="sign-in-artwork"><img src="/kazmion-store-banner.jpg" width="1024" height="577" alt="Kazmion Smart POS Solution — Manage Sales, Inventory, Customers and More" fetchPriority="high" /></div>
      <div
        className="sign-in-content"
      >
      <div className="sign-in-toolbar"><span>YOUR BUSINESS. CONNECTED.</span>
        <ThemeToggle />
      </div>

      <section className="sign-in-card" aria-labelledby="sign-in-title">
        <div className="grid grid-cols-1">

          <form onSubmit={submit} className="sign-in-form" aria-busy={pending} aria-describedby="sign-in-description">
            {/* Brand header */}
            <div className="sign-in-heading">
              <div className="sign-in-brand">Kazmi<span>On</span><small>POINT OF SALE SYSTEM</small></div>
              {step !== 'credentials' && <p className="sign-in-eyebrow">{step === 'pin' ? 'STEP 2 OF 2 · SECURITY CHECK' : 'ACCOUNT RECOVERY'}</p>}
              <h1 id="sign-in-title">{step === 'credentials' ? 'Log in to your account' : step === 'pin' ? 'One more step.' : step === 'reset-request' ? 'Reset your PIN.' : 'Check your email.'}</h1>
              <p id="sign-in-description" className="sign-in-description">{step === 'credentials' ? 'Sign in to manage your business.' : step === 'pin' ? 'Enter your admin PIN to access your workspace.' : step === 'reset-request' ? 'We’ll send a PIN reset code to your verified recovery email.' : 'Enter your recovery code and choose a new PIN.'}</p>
            </div>

            {step === 'pin' && <ol className="sign-in-steps" aria-label="Sign-in progress"><li><span aria-hidden="true">✓</span>Account verified</li><li aria-current="step"><span aria-hidden="true">2</span>Security PIN</li></ol>}

            {step === 'pin' && <div className="sign-in-account"><span><small>Signing in as</small><strong>{email}</strong></span><button type="button" disabled={pending} onClick={() => { changeStep('credentials'); setChallengeToken(''); }}>Change</button></div>}

            {/* Username or Email */}
            {step !== 'pin' && (
              <div>
                <label className="label" htmlFor="login-email">Email address</label>
                <input id="login-email" className="input" type="email" autoComplete="username" autoCapitalize="none" spellCheck={false} enterKeyHint={step === 'credentials' ? 'next' : 'go'} placeholder="you@business.com" required disabled={pending} value={email} onChange={(e) => { setEmail(e.target.value); login.reset(); }} />
              </div>
            )}

            {/* Password (credentials step) */}
            {step === 'credentials' && (
              <div>
                <label className="label" htmlFor="login-password">Password</label>
                <div className="sign-in-password"><input id="login-password" className="input" autoComplete="current-password" enterKeyHint="go" aria-describedby={capsLock ? 'caps-lock-hint' : undefined} onKeyDown={(e) => setCapsLock(e.getModifierState('CapsLock'))} onKeyUp={(e) => setCapsLock(e.getModifierState('CapsLock'))} onBlur={() => setCapsLock(false)} placeholder="Enter your password" disabled={pending} type={showPassword ? 'text' : 'password'} required value={password} onChange={(e) => { setPassword(e.target.value); login.reset(); }} />
                <button type="button" disabled={pending} onClick={() => setShowPassword(!showPassword)} aria-pressed={showPassword} aria-label={showPassword ? 'Hide password' : 'Show password'}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" />{showPassword && <path d="m3 3 18 18" />}</svg>
                </button>
                </div>
                {capsLock && <p id="caps-lock-hint" className="sign-in-field-hint" role="status">Caps Lock is on.</p>}
              </div>
            )}

            {/* PIN step */}
            {step === 'pin' && (
              <>
                {pinRequiresChange && <p className="sign-in-pin-notice">Your initial PIN is 0000. Create a private PIN to continue.</p>}
              <div><label className="label" htmlFor="login-pin">4-digit PIN</label>
                <input id="login-pin" className="input" type="password" inputMode="numeric" autoComplete="off" maxLength={4} pattern="[0-9]{4}" disabled={pending} required value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))} /></div>
              {pinRequiresChange && <div><label className="label" htmlFor="initial-new-pin">New 4-digit PIN</label>
                <input id="initial-new-pin" className="input" type="password" inputMode="numeric" autoComplete="new-password" maxLength={4} pattern="[0-9]{4}" disabled={pending} required value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))} /></div>}
              </>
            )}

            {/* Reset step */}
            {step === 'reset' && (
              <>
                <div><label className="label" htmlFor="reset-code">6-digit email code</label>
                <input id="reset-code" className="input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]{6}" disabled={pending} required value={resetCode} onChange={(e) => setResetCode(e.target.value.replace(/\D/g, '').slice(0, 6))} /></div>
              <div><label className="label" htmlFor="reset-new-pin">New 4-digit PIN</label>
                <input id="reset-new-pin" className="input" type="password" inputMode="numeric" autoComplete="new-password" maxLength={4} pattern="[0-9]{4}" disabled={pending} required value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))} /></div>
              </>
            )}

            {error && <p className="sign-in-error" role="alert">{errorMessage(error)}</p>}
            {notice && <p className="sign-in-notice" role="status">{notice}</p>}

            <button className="sign-in-submit" disabled={pending}>
              {pending && <span className="sign-in-spinner" aria-hidden="true" />}{login.isPending ? 'Signing in…' : completePin.isPending ? 'Verifying PIN…' : requestReset.isPending ? 'Sending code…' : resetPin.isPending ? 'Resetting PIN…' : step === 'credentials' ? 'Sign in' : step === 'pin' ? (pinRequiresChange ? 'Set PIN and continue' : 'Verify PIN') : step === 'reset-request' ? 'Send reset code' : 'Reset PIN'}{!pending && <span aria-hidden="true"> →</span>}
            </button>

            {step === 'pin' && <div className="sign-in-recovery"><span>Trouble with your admin PIN?</span><button type="button" disabled={pending} onClick={() => changeStep('reset-request')}>Reset PIN</button></div>}
            {step === 'credentials' && <Link className="sign-in-back" to="/recover">Forgot password? Recover your account</Link>}

            {step !== 'credentials' && <button type="button" disabled={pending} className="sign-in-back" onClick={() => { changeStep('credentials'); setChallengeToken(''); }}>← Back to sign in</button>}

            {/* Footer */}
            <p className="sign-in-security"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="3" /><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" /></svg>Secure access to your business workspace</p>
          </form>
        </div>
      </section>
      </div>
    </main>
  );
}
