import type { Customer } from '@pos/shared-types';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { customerApi } from '../api';
import { useDebounce } from '../hooks/useDebounce';
import { errorMessage } from '../utils/errors';

/** Search an existing customer, or add a new one without leaving the checkout. */
export default function CustomerPicker({ value, onChange }: { value: Customer | null; onChange: (c: Customer | null) => void }) {
  const [search, setSearch] = useState('');
  const q = useDebounce(search);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', cnic: '', address: '', gName: '', gPhone: '', gCnic: '' });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  const results = useQuery({
    queryKey: ['customers', 'pick', q],
    queryFn: () => customerApi.list({ q, limit: 6 }),
    enabled: q.trim().length >= 2 && !value,
  });

  const create = useMutation({
    mutationFn: () => customerApi.create({
      name: form.name.trim(), phone: form.phone.trim(),
      cnic: form.cnic.trim() || undefined, address: form.address.trim() || undefined,
      guarantor: form.gName.trim() ? { name: form.gName.trim(), phone: form.gPhone.trim() || undefined, cnic: form.gCnic.trim() || undefined } : undefined,
    }),
    onSuccess: (c) => { onChange(c); setAdding(false); setSearch(''); },
  });
  const submit = (e: FormEvent) => { e.preventDefault(); create.mutate(); };

  if (value) {
    return (
      <div className="flex items-start justify-between rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-sm">
        <div>
          <div className="font-medium">{value.name}</div>
          <div className="text-slate-600">{value.phone}{value.cnic ? ` · CNIC ${value.cnic}` : ''}</div>
          {value.guarantor?.name && <div className="text-xs text-slate-500">Guarantor: {value.guarantor.name}</div>}
        </div>
        <button type="button" className="text-xs font-medium text-indigo-700" onClick={() => onChange(null)}>Change</button>
      </div>
    );
  }

  if (adding) {
    return (
      <form onSubmit={submit} className="space-y-2 rounded-lg border border-slate-200 p-3">
        <div className="text-sm font-medium">New customer</div>
        <input className="input" placeholder="Full name" required value={form.name} onChange={set('name')} />
        <input className="input" placeholder="Phone" required minLength={5} value={form.phone} onChange={set('phone')} />
        <input className="input" placeholder="CNIC (optional)" value={form.cnic} onChange={set('cnic')} />
        <input className="input" placeholder="Address (optional)" value={form.address} onChange={set('address')} />
        <div className="pt-1 text-xs font-medium text-slate-600">Guarantor (optional)</div>
        <input className="input" placeholder="Guarantor name" value={form.gName} onChange={set('gName')} />
        <div className="grid grid-cols-2 gap-2">
          <input className="input" placeholder="Guarantor phone" value={form.gPhone} onChange={set('gPhone')} />
          <input className="input" placeholder="Guarantor CNIC" value={form.gCnic} onChange={set('gCnic')} />
        </div>
        {create.isError && <p className="text-xs text-red-600">{errorMessage(create.error)}</p>}
        <div className="flex gap-2">
          <button className="btn-primary flex-1" disabled={create.isPending}>{create.isPending ? 'Saving…' : 'Save customer'}</button>
          <button type="button" className="btn-secondary" onClick={() => setAdding(false)}>Cancel</button>
        </div>
      </form>
    );
  }

  return (
    <div className="space-y-2">
      <input className="input" placeholder="Search customer by name, phone or CNIC" value={search} onChange={(e) => setSearch(e.target.value)} />
      {results.data?.data.map((c) => (
        <button key={c._id} type="button" onClick={() => onChange(c)}
          className="block w-full rounded-lg border border-slate-200 px-3 py-2 text-left text-sm hover:border-indigo-400">
          <span className="font-medium">{c.name}</span> <span className="text-slate-500">· {c.phone}</span>
        </button>
      ))}
      {results.data && results.data.data.length === 0 && <p className="text-xs text-slate-500">No match.</p>}
      <button type="button" className="text-sm font-medium text-indigo-600" onClick={() => setAdding(true)}>+ New customer</button>
    </div>
  );
}
