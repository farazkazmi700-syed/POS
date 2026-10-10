import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { authApi } from '../api';
import ThemeToggle from '../components/ThemeToggle';
import { useAuth } from '../store/auth';
import { errorMessage } from '../utils/errors';

export default function Login() {
  const navigate = useNavigate();
  const { user, setSession } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const login = useMutation({
    mutationFn: authApi.login,
    onSuccess: (res) => { setSession(res); navigate('/'); },
  });

  if (user) return <Navigate to="/" replace />;

  const submit = (e: FormEvent) => { e.preventDefault(); login.mutate({ email, password }); };

  return (
    <div className="flex min-h-screen items-center justify-center p-3 sm:p-5">
      <div className="absolute right-4 top-4 sm:right-6 sm:top-6">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-5xl overflow-hidden rounded-[28px] border border-slate-200/80 bg-white/60 shadow-[0_24px_80px_rgba(15,23,42,0.12)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/40">
        <div className="grid md:grid-cols-[1.1fr_0.9fr]">
          <div className="hidden bg-gradient-to-br from-indigo-600 via-violet-600 to-cyan-500 p-8 text-white md:flex md:flex-col md:justify-between">
            <div>
              <span className="inline-flex rounded-full border border-white/25 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-indigo-50">
                Premium POS
              </span>
              <h1 className="mt-6 text-3xl font-semibold leading-tight">Run your business with confidence.</h1>
              <p className="mt-3 max-w-sm text-sm text-indigo-50/90">
                Manage sales, inventory, customer accounts, and payments from one streamlined dashboard.
              </p>
            </div>
            <div className="space-y-3 text-sm text-indigo-50/90">
              <div className="flex items-center gap-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/15 text-base">✓</span>
                Real-time sales visibility
              </div>
              <div className="flex items-center gap-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/15 text-base">✓</span>
                Faster invoice and installment workflows
              </div>
            </div>
          </div>

          <form onSubmit={submit} className="card m-3 space-y-4 border-0 shadow-none md:m-0 md:rounded-none md:border-l md:border-slate-200/70 md:p-8 dark:md:border-slate-800">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-500">Welcome back</p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">Sign in</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Welcome back to your POS.</p>
            </div>

            <div>
              <label className="label">Email</label>
              <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>

            <div>
              <label className="label">Password</label>
              <input className="input" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>

            {login.isError && <p className="text-sm font-medium text-red-600">{errorMessage(login.error)}</p>}

            <button className="btn-primary w-full" disabled={login.isPending}>{login.isPending ? 'Signing in…' : 'Sign in'}</button>

            <p className="text-center text-sm text-slate-500 dark:text-slate-400">
              New business? <Link className="font-semibold text-indigo-600 hover:text-indigo-500 dark:text-indigo-400" to="/register">Create an account</Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
