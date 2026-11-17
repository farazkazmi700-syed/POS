import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { auditApi, branchApi } from '../api';
import { useTenant } from '../hooks/useTenant';
import { errorMessage } from '../utils/errors';
export default function OperationsSettings() {
  const { tenant } = useTenant();
  const client = useQueryClient();
  const [name, setName] = useState(''); const [code, setCode] = useState('');
  const branches = useQuery({ queryKey: ['branches'], queryFn: branchApi.list });
  const audit = useQuery({ queryKey: ['tenant-audit'], queryFn: auditApi.list });
  const create = useMutation({ mutationFn: () => branchApi.create({ name, code }), onSuccess: () => { setName(''); setCode(''); client.invalidateQueries({ queryKey: ['branches'] }); client.invalidateQueries({ queryKey: ['tenant'] }); } });
  return <section className="card space-y-5" id="branches"><div><h2 className="text-sm font-semibold">Branches & operations</h2><p className="mt-1 text-xs text-slate-500">Deployment: {tenant?.deploymentMode ?? 'cloud'} · Branch limit: {tenant?.branchLimit ?? 1} · License: {tenant?.licenseExpiresAt ? new Date(tenant.licenseExpiresAt).toLocaleDateString() : 'No expiry set'}</p><p className="mt-1 text-xs text-slate-500">Deployment selection is a platform setting. Offline syncing requires a separately provisioned local installation.</p></div>
    <ul className="space-y-2 text-sm">{Array.isArray(branches.data) && branches.data.map((branch) => <li key={branch._id}>{branch.name} <span className="text-slate-500">· {branch.code} · {branch.isActive ? 'Active' : 'Inactive'}</span></li>)}</ul>
    <form className="flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); if (!create.isPending) create.mutate(); }}><input className="input flex-1" aria-label="Branch name" placeholder="Branch name" minLength={2} required value={name} onChange={(event) => setName(event.target.value)} /><input className="input max-w-36" aria-label="Branch code" placeholder="Code" minLength={2} maxLength={20} required value={code} onChange={(event) => setCode(event.target.value)} /><button className="btn-primary" disabled={create.isPending}>{create.isPending ? 'Creating…' : 'Add branch'}</button></form>
    {(create.error || branches.error) && <p role="alert" className="text-sm text-red-600">{errorMessage(create.error ?? branches.error)}</p>}
    <div><h3 className="text-sm font-semibold">Recent audit events</h3>{audit.isError ? <p className="text-xs text-red-600">{errorMessage(audit.error)}</p> : <ul className="mt-3 divide-y divide-slate-100 text-xs dark:divide-slate-700">{audit.data?.data?.map((entry) => <li key={entry._id} className="flex flex-wrap justify-between gap-2 py-2"><span>{entry.action} {entry.resource}</span><time>{new Date(entry.createdAt).toLocaleString()}</time></li>)}</ul>}</div>
  </section>;
}
