import type { Customer } from '@pos/shared-types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { customerApi, type CustomerInput } from '../api';
import Modal from '../components/Modal';
import { useDebounce } from '../hooks/useDebounce';
import { errorMessage } from '../utils/errors';

interface FormState {
  name: string;
  phone: string;
  cnic: string;
  address: string;
  notes: string;
  gName: string;
  gPhone: string;
  gCnic: string;
  gAddress: string;
}

const empty: FormState = {
  name: '',
  phone: '',
  cnic: '',
  address: '',
  notes: '',
  gName: '',
  gPhone: '',
  gCnic: '',
  gAddress: '',
};

const fromCustomer = (c: Customer): FormState => ({
  name: c.name,
  phone: c.phone,
  cnic: c.cnic ?? '',
  address: c.address ?? '',
  notes: c.notes ?? '',
  gName: c.guarantor?.name ?? '',
  gPhone: c.guarantor?.phone ?? '',
  gCnic: c.guarantor?.cnic ?? '',
  gAddress: c.guarantor?.address ?? '',
});

const toInput = (f: FormState): CustomerInput => ({
  name: f.name.trim(),
  phone: f.phone.trim(),
  cnic: f.cnic.trim() || undefined,
  address: f.address.trim() || undefined,
  notes: f.notes.trim() || undefined,
  guarantor: f.gName.trim()
    ? {
        name: f.gName.trim(),
        phone: f.gPhone.trim() || undefined,
        cnic: f.gCnic.trim() || undefined,
        address: f.gAddress.trim() || undefined,
      }
    : undefined,
});

export default function Customers() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const q = useDebounce(search);
  const [editing, setEditing] = useState<{ id?: string; form: FormState } | null>(null);

  const list = useQuery({
    queryKey: ['customers', 'manage', q],
    queryFn: () => customerApi.list({ q: q || undefined, limit: 100 }),
  });

  const save = useMutation({
    mutationFn: (v: { id?: string; form: FormState }) =>
      v.id ? customerApi.update(v.id, toInput(v.form)) : customerApi.create(toInput(v.form)),
    onSuccess: () => {
      setEditing(null);
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
  });

  const set = (k: keyof FormState) => (e: { target: { value: string } }) =>
    setEditing((s) => (s ? { ...s, form: { ...s.form, [k]: e.target.value } } : s));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (editing) save.mutate(editing);
  };

  const customersList = list.data?.data ?? [];

  return (
    <div className="space-y-4">
      {/* ─────────────── Controls Header ─────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Customers & Accounts</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {customersList.length} registered customers
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <input
            className="input !w-full sm:!w-72"
            placeholder="Search name, phone or CNIC…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button
            className="btn-primary w-full sm:w-auto"
            onClick={() => {
              save.reset();
              setEditing({ form: empty });
            }}
          >
            + Add customer
          </button>
        </div>
      </div>

      {/* ─────────────── Desktop Table (hidden on mobile) ─────────────── */}
      <div className="card overflow-x-auto !p-0 hidden md:block">
        <table className="w-full">
          <thead className="border-b border-slate-200 bg-slate-50 dark:border-teal-950 dark:bg-slate-800/40">
            <tr>
              <th className="th">Customer Name</th>
              <th className="th">Phone</th>
              <th className="th">CNIC</th>
              <th className="th">Address</th>
              <th className="th">Guarantor</th>
              <th className="th text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-teal-950">
            {customersList.map((c) => (
              <tr key={c._id}>
                <td className="td font-semibold text-slate-900 dark:text-slate-100">{c.name}</td>
                <td className="td">
                  <a href={`tel:${c.phone}`} className="text-teal-700 hover:underline dark:text-teal-400 font-medium">
                    {c.phone}
                  </a>
                </td>
                <td className="td text-xs text-slate-500 font-mono">{c.cnic ?? '—'}</td>
                <td className="td text-xs text-slate-500 max-w-[200px] truncate">{c.address ?? '—'}</td>
                <td className="td text-xs text-slate-500">
                  {c.guarantor?.name ? (
                    <span>
                      <span className="font-medium text-slate-700 dark:text-slate-300">{c.guarantor.name}</span>
                      {c.guarantor.phone && ` (${c.guarantor.phone})`}
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="td space-x-2 text-right">
                  <Link className="btn-secondary !px-2.5 !py-1 text-xs" to={`/installments?customerId=${c._id}`}>
                    Plans
                  </Link>
                  <button
                    className="btn-secondary !px-2.5 !py-1 text-xs"
                    onClick={() => {
                      save.reset();
                      setEditing({ id: c._id, form: fromCustomer(c) });
                    }}
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
            {customersList.length === 0 && (
              <tr>
                <td className="td text-center text-slate-500 py-8" colSpan={6}>
                  No customers found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ─────────────── Mobile Cards View (visible on < md) ─────────────── */}
      <div className="space-y-3 block md:hidden">
        {customersList.map((c) => (
          <div key={c._id} className="card space-y-3 p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                  {c.name}
                </h3>
                <a
                  href={`tel:${c.phone}`}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 dark:text-teal-400 mt-0.5"
                >
                  <span className="text-slate-400 font-normal">Tel:</span>
                  <span>{c.phone}</span>
                </a>
              </div>
              {c.cnic && (
                <span className="rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 font-mono text-[11px] text-slate-600 dark:text-slate-300">
                  {c.cnic}
                </span>
              )}
            </div>

            {(c.address || c.guarantor?.name) && (
              <div className="space-y-1 text-xs text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-teal-950 pt-2">
                {c.address && <p className="truncate"><span className="text-slate-400">Address:</span> {c.address}</p>}
                {c.guarantor?.name && (
                  <p className="truncate">
                    <span className="text-slate-400">Guarantor:</span>{' '}
                    <span className="font-medium text-slate-700 dark:text-slate-300">{c.guarantor.name}</span>
                    {c.guarantor.phone && ` (${c.guarantor.phone})`}
                  </p>
                )}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-100 dark:border-teal-950">
              <Link
                className="btn-secondary flex-1 !py-2 text-center text-xs font-semibold"
                to={`/installments?customerId=${c._id}`}
              >
                View Plans
              </Link>
              <button
                className="btn-secondary !py-2 px-4 text-xs font-semibold"
                onClick={() => {
                  save.reset();
                  setEditing({ id: c._id, form: fromCustomer(c) });
                }}
              >
                Edit
              </button>
            </div>
          </div>
        ))}

        {customersList.length === 0 && (
          <div className="card text-center py-8 text-sm text-slate-500">
            No customers found.
          </div>
        )}
      </div>

      {/* ─────────────── Add / Edit Modal ─────────────── */}
      {editing && (
        <Modal title={editing.id ? 'Edit Customer' : 'Add New Customer'} onClose={() => setEditing(null)}>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-teal-700 dark:text-teal-400 mb-2">
                Customer Details
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label">Full Name *</label>
                  <input
                    className="input"
                    required
                    placeholder="Customer name"
                    value={editing.form.name}
                    onChange={set('name')}
                  />
                </div>
                <div>
                  <label className="label">Phone *</label>
                  <input
                    className="input"
                    required
                    type="tel"
                    minLength={5}
                    placeholder="Mobile number"
                    value={editing.form.phone}
                    onChange={set('phone')}
                  />
                </div>
                <div>
                  <label className="label">CNIC / ID Number</label>
                  <input
                    className="input"
                    placeholder="e.g. 42101-1234567-1"
                    value={editing.form.cnic}
                    onChange={set('cnic')}
                  />
                </div>
                <div>
                  <label className="label">Address</label>
                  <input
                    className="input"
                    placeholder="Residential or business address"
                    value={editing.form.address}
                    onChange={set('address')}
                  />
                </div>
              </div>
            </div>

            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/40 p-3.5 border border-slate-200 dark:border-teal-950">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-2">
                Guarantor Information (Optional)
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label">Guarantor Name</label>
                  <input
                    className="input"
                    placeholder="Full name"
                    value={editing.form.gName}
                    onChange={set('gName')}
                  />
                </div>
                <div>
                  <label className="label">Guarantor Phone</label>
                  <input
                    className="input"
                    type="tel"
                    placeholder="Mobile number"
                    value={editing.form.gPhone}
                    onChange={set('gPhone')}
                  />
                </div>
                <div>
                  <label className="label">Guarantor CNIC</label>
                  <input
                    className="input"
                    placeholder="CNIC / ID"
                    value={editing.form.gCnic}
                    onChange={set('gCnic')}
                  />
                </div>
                <div>
                  <label className="label">Guarantor Address</label>
                  <input
                    className="input"
                    placeholder="Address"
                    value={editing.form.gAddress}
                    onChange={set('gAddress')}
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="label">Notes / Remarks</label>
              <input
                className="input"
                placeholder="Optional customer notes"
                value={editing.form.notes}
                onChange={set('notes')}
              />
            </div>

            {save.isError && (
              <p className="rounded-lg bg-red-50 p-2.5 text-xs text-red-600 dark:bg-red-950/40 dark:text-red-400">
                {errorMessage(save.error)}
              </p>
            )}

            <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-teal-950">
              <button type="button" className="btn-secondary" onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button className="btn-primary" disabled={save.isPending}>
                {save.isPending ? 'Saving customer…' : 'Save customer'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
