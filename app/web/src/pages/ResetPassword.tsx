import { useState, type FormEvent } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { authApi } from '../api';
import { errorMessage } from '../utils/errors';
import ThemeToggle from '../components/ThemeToggle';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const { hash } = useLocation();
  const token = new URLSearchParams(hash.slice(1)).get('token') || params.get('token') || '';
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [notice, setNotice] = useState('');
  const [localError, setLocalError] = useState('');
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (pending || notice || !token) return;
    setLocalError('');
    setNotice('');
    if (newPassword !== confirmation) {
      setLocalError('The confirmation does not match.');
      return;
    }
    if (newPassword.length < 12) {
      setLocalError('Please use a password of at least 12 characters.');
      return;
    }
    setPending(true);
    try {
      const result = await authApi.resetPassword({ token, newPassword });
      setNewPassword('');
      setConfirmation('');
      setNotice(result.message ?? 'Password updated. You can now sign in with your new password.');
    } catch (error) {
      setLocalError(errorMessage(error));
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="mx-auto mt-10 max-w-md px-4">
      <ThemeToggle />
      <section className="card space-y-4">
        <h1 className="text-lg font-semibold">Set a new password</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Choose a new password for your POS account. The reset link expires in 15 minutes.
        </p>
        {!token && <p role="alert">Open the link in your reset email or <Link to="/recover">recover your account</Link>.</p>}
        {token && !notice && <form onSubmit={submit} aria-busy={pending}>
          <fieldset disabled={pending} className="space-y-4">
          <div>
            <label className="label" htmlFor="reset-password">New password</label>
            <input
              className="input w-full"
              id="reset-password"
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              required
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="reset-confirmation">Confirm password</label>
            <input
              className="input w-full"
              id="reset-confirmation"
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              required
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
            />
          </div>
          <button className="btn-primary w-full" type="submit">
            {pending ? 'Updating password…' : 'Update password'}
          </button>
          </fieldset>
        </form>}
        {localError && (
          <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">
            {localError}
          </p>
        )}
        {notice && (
          <p role="status" className="rounded-lg bg-blue-50 p-3 text-sm text-blue-800 dark:bg-blue-950 dark:text-blue-200">
            {notice}
          </p>
        )}
        {notice && <Link className="btn-primary inline-flex" to="/login">Continue to sign in</Link>}
      </section>
    </main>
  );
}
