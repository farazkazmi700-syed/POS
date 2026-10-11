import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authApi } from '../api';
import ThemeToggle from '../components/ThemeToggle';
import { errorMessage } from '../utils/errors';

const DOMAINS = ['retail', 'restaurant', 'pharmacy', 'salon', 'custom'];

export default function Register() {
  const navigate = useNavigate();
  const [registered, setRegistered] = useState(false);
  const [form, setForm] = useState({
    businessName: '', domainType: 'retail', ownerName: '', email: '', password: '',
    developerEmail: '', developerPassword: '', taxRegNo: '', address: '',
  });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  const register = useMutation({
    mutationFn: authApi.register,
    onSuccess: () => setRegistered(true),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    register.mutate({
      ...form,
      taxRegNo: form.taxRegNo || undefined,
      address: form.address || undefined,
    });
  };

  if (registered) return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="card w-full max-w-md space-y-4 text-center">
        <h1 className="text-xl font-semibold">Business account created</h1>
        <p className="text-sm text-slate-600">Sign in with the new Owner account. The initial admin PIN must be changed before access.</p>
        <button className="btn-primary w-full" onClick={() => navigate('/login')}>Go to sign in</button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen items-center justify-center p-3 sm:p-5">
      <div className="absolute right-4 top-4 sm:right-6 sm:top-6">
        <ThemeToggle />
      </div>

      <form onSubmit={submit} className="card w-full max-w-3xl space-y-5 p-4 sm:p-6 md:p-8">
        <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 dark:border-slate-800 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-500">Get started</p>
            <h1 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">Create your business</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Developer-authorized registration. The first business account will be Owner and can add staff afterwards.</p>
          </div>
          <div className="inline-flex rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300">
            Secure onboarding
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label">Business name</label>
            <input className="input" required minLength={2} value={form.businessName} onChange={set('businessName')} />
          </div>
          <div>
            <label className="label">Business type</label>
            <select className="input" value={form.domainType} onChange={set('domainType')}>
              {DOMAINS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Tax registration no. (NTN/STRN)</label>
            <input className="input" value={form.taxRegNo} onChange={set('taxRegNo')} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Address</label>
            <input className="input" value={form.address} onChange={set('address')} />
          </div>
          <div>
            <label className="label">Your name</label>
            <input className="input" required minLength={2} value={form.ownerName} onChange={set('ownerName')} />
          </div>
          <div>
            <label className="label">Email</label>
            <input className="input" type="email" required value={form.email} onChange={set('email')} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Authorized developer email</label>
            <input className="input" type="email" required autoComplete="username" value={form.developerEmail} onChange={set('developerEmail')} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Developer password</label>
            <input className="input" type="password" required minLength={8} autoComplete="current-password" value={form.developerPassword} onChange={set('developerPassword')} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Password (min 8 characters)</label>
            <input className="input" type="password" required minLength={8} value={form.password} onChange={set('password')} />
          </div>
        </div>

        {register.isError && <p className="text-sm font-medium text-red-600">{errorMessage(register.error)}</p>}
        <button className="btn-primary w-full" disabled={register.isPending}>{register.isPending ? 'Creating…' : 'Create account'}</button>
        <p className="text-center text-sm text-slate-500 dark:text-slate-400">
          Already registered? <Link className="font-semibold text-indigo-600 hover:text-indigo-500 dark:text-indigo-400" to="/login">Sign in</Link>
        </p>
      </form>
    </div>
  );
}
