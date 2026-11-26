import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { auditApi, branchApi, type Branch } from '../api';
import { useTenant } from '../hooks/useTenant';
import { useAuth } from '../store/auth';
import { errorMessage } from '../utils/errors';
export default function OperationsSettings({ readBranches, writeBranches, readAudit }: { readBranches: boolean; writeBranches: boolean; readAudit: boolean }) {
  const { tenant } = useTenant();
  const client = useQueryClient();
  const selectedBranchId = useAuth((state) => state.activeBranchId);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [address, setAddress] = useState('');
  const branches = useQuery({ queryKey: ['branches'], enabled: readBranches, queryFn: branchApi.list });
  const audit = useQuery({ queryKey: ['tenant-audit'], enabled: readAudit, queryFn: auditApi.list });
  const refreshBranches = () => client.invalidateQueries({ queryKey: ['branches'] });
  const resetForm = () => {
    setEditingId(null);
    setName('');
    setCode('');
    setAddress('');
  };
  const save = useMutation({
    mutationFn: () => {
      const details = { name: name.trim(), code: code.trim(), address: address.trim() };
      return editingId ? branchApi.update(editingId, details) : branchApi.create(details);
    },
    onSuccess: async () => {
      resetForm();
      await Promise.all([refreshBranches(), client.invalidateQueries({ queryKey: ['tenant'] })]);
    },
  });
  const changeStatus = useMutation({
    mutationFn: (branch: Branch) => branch.isActive
      ? branchApi.deactivate(branch._id)
      : branchApi.update(branch._id, { isActive: true }),
    onSuccess: refreshBranches,
  });
  const branchList = Array.isArray(branches.data) ? branches.data : [];
  const busy = save.isPending || changeStatus.isPending;
  const branchError = save.error ?? changeStatus.error ?? (readBranches ? branches.error : null);

  function editBranch(branch: Branch) {
    save.reset();
    changeStatus.reset();
    setEditingId(branch._id);
    setName(branch.name);
    setCode(branch.code);
    setAddress(branch.address ?? '');
  }

  function toggleBranch(branch: Branch) {
    if (branch.isActive && !window.confirm(`Deactivate "${branch.name}"? Staff will lose access to this branch until it is reactivated.`)) return;
    save.reset();
    changeStatus.mutate(branch);
  }
  return <section className="card space-y-5" id="branches"><div><h2 className="text-sm font-semibold">Branches & operations</h2><p className="mt-1 text-xs text-slate-500">Deployment: {tenant?.deploymentMode ?? 'cloud'} · Branch limit: {tenant?.branchLimit ?? 1} · License: {tenant?.licenseExpiresAt ? new Date(tenant.licenseExpiresAt).toLocaleDateString() : 'No expiry set'}</p><p className="mt-1 text-xs text-slate-500">Deployment selection is a platform setting. Offline syncing requires a separately provisioned local installation.</p></div>
    {readBranches && branches.isPending && <p role="status" className="text-sm text-slate-500">Loading branches…</p>}
    {readBranches && branches.isSuccess && branchList.length === 0 && <p className="text-sm text-slate-500">No branches yet.</p>}
    {readBranches && branchList.length > 0 && (
      <ul className="space-y-2 text-sm">
        {branchList.map((branch) => {
          const isDefault = branch._id === tenant?.defaultBranchId;
          const isSelected = branch._id === selectedBranchId;
          return (
            <li key={branch._id} className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span>{branch.name}</span>
                <span className="text-slate-500"> · {branch.code} · {branch.isActive ? 'Active' : 'Inactive'}{isDefault && ' · Default'}</span>
                {branch.address && <p className="text-slate-500">{branch.address}</p>}
              </div>
              {writeBranches && (
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" className="btn-secondary" disabled={busy} aria-label={`Edit ${branch.name}`} onClick={() => editBranch(branch)}>Edit</button>
                  {!isDefault && (
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={busy || (branch.isActive && isSelected)}
                      aria-label={`${branch.isActive ? 'Deactivate' : 'Reactivate'} ${branch.name}`}
                      onClick={() => toggleBranch(branch)}
                    >
                      {branch.isActive ? 'Deactivate' : 'Reactivate'}
                    </button>
                  )}
                  {!isDefault && isSelected && branch.isActive && <span className="text-xs text-slate-500">Switch branches before deactivating.</span>}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    )}
    {writeBranches && (
      <form className="flex flex-wrap items-center gap-2" onSubmit={(event) => {
        event.preventDefault();
        if (busy) return;
        changeStatus.reset();
        save.mutate();
      }}>
        {editingId && <p className="w-full text-sm font-semibold">Edit branch</p>}
        <input className="input flex-1" aria-label="Branch name" placeholder="Branch name" minLength={2} maxLength={100} required disabled={busy} value={name} onChange={(event) => setName(event.target.value)} />
        <input className="input max-w-36" aria-label="Branch code" placeholder="Code" minLength={2} maxLength={20} required disabled={busy} value={code} onChange={(event) => setCode(event.target.value)} />
        <input className="input flex-1" aria-label="Branch address (optional)" placeholder="Address (optional)" maxLength={300} disabled={busy} value={address} onChange={(event) => setAddress(event.target.value)} />
        <button type="submit" className="btn-primary" disabled={busy}>{save.isPending ? 'Saving…' : editingId ? 'Save changes' : 'Add branch'}</button>
        {editingId && <button type="button" className="btn-secondary" disabled={busy} onClick={() => { save.reset(); resetForm(); }}>Cancel</button>}
      </form>
    )}
    {branchError && <p role="alert" className="text-sm text-red-600">{errorMessage(branchError)}</p>}
    {readAudit && <div><h3 className="text-sm font-semibold">Recent audit events</h3>{audit.isError ? <p className="text-xs text-red-600">{errorMessage(audit.error)}</p> : <ul className="mt-3 divide-y divide-slate-100 text-xs dark:divide-slate-700">{audit.data?.data?.map((entry) => <li key={entry._id} className="flex flex-wrap justify-between gap-2 py-2"><span>{entry.action} {entry.resource}</span><time>{new Date(entry.createdAt).toLocaleString()}</time></li>)}</ul>}</div>}
  </section>;
}
