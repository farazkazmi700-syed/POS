import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { authApi } from '../api';
import { useAuth } from '../store/auth';
import { errorMessage } from '../utils/errors';

export default function ChangePassword({ onChanged }: { onChanged: () => void }) {
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [validation, setValidation] = useState('');
  const change = useMutation({
    mutationFn: () => authApi.changePassword(current, password),
    onSuccess: () => { onChanged(); useAuth.getState().logout(); },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (password !== confirmation) { setValidation('The new passwords must match.'); return; }
    setValidation('');
    change.mutate();
  }

  return <section className="card mb-6 space-y-4">
    <h1 className="page-title">Change password</h1>
    <p>Enter your current password. After saving, sign in with your new password.</p>
    <form onSubmit={submit}>
      <fieldset className="space-y-4" disabled={change.isPending}>
        <label className="label">Current password<input className="input w-full" type="password" autoComplete="current-password" required maxLength={128} value={current} onChange={e => setCurrent(e.target.value)} /></label>
        <label className="label">New password<input className="input w-full" type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={password} onChange={e => setPassword(e.target.value)} /></label>
        <label className="label">Confirm new password<input className="input w-full" type="password" autoComplete="new-password" required value={confirmation} onChange={e => setConfirmation(e.target.value)} /></label>
        <p className="text-sm">Use 12–128 characters.</p>
        {(validation || change.isError) && <p role="alert">{validation || errorMessage(change.error)}</p>}
        <button className="btn-primary" type="submit">{change.isPending ? 'Saving…' : 'Save new password'}</button>
      </fieldset>
    </form>
  </section>;
}
