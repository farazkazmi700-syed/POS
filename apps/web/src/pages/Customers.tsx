import type { Customer } from '@pos/shared-types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { customerApi, type CustomerInput } from '../api';
import Modal from '../components/Modal';
import { useDebounce } from '../hooks/useDebounce';
import { errorMessage } from '../utils/errors';

interface FormState { name: string; phone: string; cnic: string; address: string; notes: string; gName: string; gPhone: string; gCnic: string; gAddress: string }
const empty: FormState = { name: '', phone: '', cnic: '', address: '', notes: '', gName: '', gPhone: '', gCnic: '', gAddress: '' };
const fromCustomer = (c: Customer): FormState => ({
  name: c.name, phone: c.phone, cnic: c.cnic ?? '', address: c.address ?? '', notes: c.notes ?? '',
  gName: c.guarantor?.name ?? '', gPhone: c.guarantor?.phone ?? '', gCnic: c.guarantor?.cnic ?? '', gAddress: c.guarantor?.address ?? '',
});
const toInput = (f: FormState): CustomerInput => ({
  name: f.name.trim(), phone: f.phone.trim(), cnic: f.cnic.trim() || undefined, address: f.address.trim() || undefined,
  notes: f.notes.trim() || undefined,
  guarantor: f.gName.trim() ? { name: f.gName.trim(), phone: f.gPhone.trim() || undefined, cnic: f.gCnic.trim() || undefined, address: f.gAddress.trim() || undefined } : undefined,
});

export default function Customers() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const q = useDebounce(search);
  const [editing, setEditing] = useState<{ id?: string; form: FormState } | null>(null);

  const list = useQuery({ queryKey: ['customers', 'manage', q], queryFn: () => customerApi.list({ q: q || undefined, limit: 100 }) });
  const save = useMutation({
    mutationFn: (v: { id?: string; form: FormState }) => (v.id ? customerApi.update(v.id, toInput(v.form)) : customerApi.create(toInput(v.form))),
    onSuccess: () => { setEditing(null); queryClient.invalidateQueries({ queryKey: ['customers'] }); },
  });
  const set = (k: keyof FormState) => (e: { target: { value: string } }) =>
    setEditing((s) => (s ? { ...s, form: { ...s.form, [k]: e.target.value } } : s));
  const submit = (e: FormEvent) => { e.preventDefault(); if (editing) save.mutate(editing); };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">Customers</h1>
        <input className="input !w-72" placeholder="Search name, phone or CNIC…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <button className="btn-primary ml-auto" onClick={() => { save.reset(); setEditing({ form: empty }); }}>+ Add customer</button>
      </div>

      <div className="card overflow-x-auto !p-0">
        <table className="w-full">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr><th className="th">Name</th><th className="th">Phone</th><th className="th">CNIC</th><th className="th">Address</th><th className="th">Guarantor</th><th className="th" /></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {list.data?.data.map((c) => (
              <tr key={c._id}>
                <td className="td font-medium">{c.name}</td>
                <td className="td">{c.phone}</td>
                <td className="td text-slate-500">{c.cnic ?? '—'}</td>
                <td className="td text-slate-500">{c.address ?? '—'}</td>
                <td className="td text-slate-500">{c.guarantor?.name ?? '—'}</td>
                <td className="td space-x-2 text-right">
                  <Link className="btn-secondary !px-2.5 !py-1" to={`/installments?customerId=${c._id}`}>Plans</Link>
                  <button className="btn-secondary !px-2.5 !py-1" onClick={() => { save.reset(); setEditing({ id: c._id, form: fromCustomer(c) }); }}>Edit</button>
                </td>
              </tr>
            ))}
            {list.data?.data.length === 0 && <tr><td className="td text-slate-500" colSpan={6}>No customers yet.</td></tr>}
          </tbody>
        </table>
      </div>

      {editing && (
        <Modal title={editing.id ? 'Edit customer' : 'Add customer'} onClose={() => setEditing(null)}>
          <form onSubmit={submit} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div><label className="label">Full name</label><input className="input" required value={editing.form.name} onChange={set('name')} /></div>
              <div><label className="label">Phone</label><input className="input" required minLength={5} value={editing.form.phone} onChange={set('phone')} /></div>
              <div><label className="label">CNIC</label><input className="input" value={editing.form.cnic} onChange={set('cnic')} /></div>
              <div><label className="label">Address</label><input className="input" value={editing.form.address} onChange={set('address')} /></div>
            </div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Guarantor</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><label className="label">Name</label><input className="input" value={editing.form.gName} onChange={set('gName')} /></div>
              <div><label className="label">Phone</label><input className="input" value={editing.form.gPhone} onChange={set('gPhone')} /></div>
              <div><label className="label">CNIC</label><input className="input" value={editing.form.gCnic} onChange={set('gCnic')} /></div>
              <div><label className="label">Address</label><input className="input" value={editing.form.gAddress} onChange={set('gAddress')} /></div>
            </div>
            <div><label className="label">Notes</label><input className="input" value={editing.form.notes} onChange={set('notes')} /></div>
            {save.isError && <p className="text-sm text-red-600">{errorMessage(save.error)}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn-primary" disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save customer'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
