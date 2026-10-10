import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { authApi } from '../api';
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
    <div className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={submit} className="card w-full max-w-sm space-y-4">
        <div>
          <h1 className="text-xl font-semibold">Sign in</h1>
          <p className="text-sm text-slate-500">Welcome back to your POS.</p>
        </div>
        <div>
          <label className="label">Email</label>
          <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label className="label">Password</label>
          <input className="input" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {login.isError && <p className="text-sm text-red-600">{errorMessage(login.error)}</p>}
        <button className="btn-primary w-full" disabled={login.isPending}>{login.isPending ? 'Signing in…' : 'Sign in'}</button>
        <p className="text-center text-sm text-slate-500">
          New business? <Link className="font-medium text-indigo-600" to="/register">Create an account</Link>
        </p>
      </form>
    </div>
  );
}
