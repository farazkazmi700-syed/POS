import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { authApi } from '../api';

export default function DeveloperSetup({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState('');
  const [setupToken, setSetupToken] = useState('');
  const setup = useMutation({ mutationFn: authApi.setupDeveloperPin });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setup.mutate({ email, setupToken }, { onSuccess: () => setSetupToken('') });
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={submit} className="card w-full max-w-md space-y-4 p-6">
        <header>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Kazmi POS</p>
          <h1 className="mt-1 text-2xl font-semibold">One-time Developer setup</h1>
        </header>
        {setup.data ? (
          <div className="space-y-3" role="status">
            <p className="text-sm">PIN created for {setup.data.email}. It is shown once; save it securely before leaving this page.</p>
            <p className="select-all rounded border border-emerald-300 bg-emerald-50 px-4 py-3 text-center font-mono text-2xl font-semibold tracking-widest text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100">
              {setup.data.pin}
            </p>
            <button type="button" className="btn-primary w-full" onClick={onBack}>Continue to Developer sign in</button>
          </div>
        ) : (
          <>
            <div>
              <label className="label" htmlFor="setup-email">Configured Developer email</label>
              <input id="setup-email" className="input" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="setup-token">One-time setup token</label>
              <input id="setup-token" className="input" type="password" autoComplete="off" minLength={32} required value={setupToken} onChange={(event) => setSetupToken(event.target.value)} />
            </div>
            {setup.isError && <p role="alert" className="text-sm text-red-600">Setup was not authorized or the PIN was already initialized.</p>}
            <button className="btn-primary w-full" type="submit" disabled={setup.isPending}>
              {setup.isPending ? 'Creating PIN...' : 'Generate Developer PIN'}
            </button>
          </>
        )}
        {!setup.data && (
          <button type="button" className="block w-full text-center text-sm font-medium text-teal-800 hover:underline dark:text-teal-300" onClick={onBack}>
            Back to Developer sign in
          </button>
        )}
      </form>
    </div>
  );
}
