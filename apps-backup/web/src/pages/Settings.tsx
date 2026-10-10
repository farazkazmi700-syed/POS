import type { ChargeRule, TaxProfile } from '@pos/shared-types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { authApi, tenantApi } from '../api';
import { useTenant } from '../hooks/useTenant';
import { useAuth } from '../store/auth';
import { errorMessage } from '../utils/errors';

export default function Settings() {
  const queryClient = useQueryClient();
  const { tenant } = useTenant();
  const role = useAuth((s) => s.user?.role);

  const [biz, setBiz] = useState({ name: '', address: '', taxRegNo: '', currency: 'PKR', invoicePrefix: 'INV' });
  const [tax, setTax] = useState<TaxProfile>({ gstPercent: 0, reducedGstPercent: 0, serviceChargePercent: 0, otherCharges: [] });

  useEffect(() => {
    if (!tenant) return;
    setBiz({
      name: tenant.name, address: tenant.address ?? '', taxRegNo: tenant.taxRegNo ?? '',
      currency: tenant.currency, invoicePrefix: tenant.invoicePrefix,
    });
    setTax(tenant.taxProfile);
  }, [tenant]);

  const save = useMutation({
    mutationFn: () => tenantApi.update({ ...biz, currency: biz.currency.toUpperCase(), taxProfile: tax }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tenant'] }),
  });
  const submit = (e: FormEvent) => { e.preventDefault(); save.mutate(); };

  const num = (v: string) => (v === '' ? 0 : Number(v));
  const setCharge = (i: number, patch: Partial<ChargeRule>) =>
    setTax({ ...tax, otherCharges: tax.otherCharges.map((c, idx) => (idx === i ? { ...c, ...patch } : c)) });

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-xl font-semibold">Settings</h1>

      <form onSubmit={submit} className="space-y-6">
        <section className="card space-y-3">
          <h2 className="text-sm font-semibold">Business details (printed on every invoice)</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><label className="label">Business name</label>
              <input className="input" required value={biz.name} onChange={(e) => setBiz({ ...biz, name: e.target.value })} /></div>
            <div className="sm:col-span-2"><label className="label">Address</label>
              <input className="input" value={biz.address} onChange={(e) => setBiz({ ...biz, address: e.target.value })} /></div>
            <div><label className="label">Tax registration no. (NTN/STRN)</label>
              <input className="input" value={biz.taxRegNo} onChange={(e) => setBiz({ ...biz, taxRegNo: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Currency (ISO)</label>
                <input className="input" maxLength={3} minLength={3} required value={biz.currency} onChange={(e) => setBiz({ ...biz, currency: e.target.value })} /></div>
              <div><label className="label">Invoice prefix</label>
                <input className="input" minLength={2} maxLength={8} required value={biz.invoicePrefix} onChange={(e) => setBiz({ ...biz, invoicePrefix: e.target.value })} /></div>
            </div>
          </div>
        </section>

        <section className="card space-y-3">
          <div>
            <h2 className="text-sm font-semibold">Taxes &amp; charges</h2>
            <p className="text-xs text-slate-500">Enter the rates that apply to your business under local law. Products pick a rate through their tax class.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div><label className="label">Standard tax %</label>
              <input className="input" type="number" min={0} max={100} step="0.01" value={tax.gstPercent} onChange={(e) => setTax({ ...tax, gstPercent: num(e.target.value) })} /></div>
            <div><label className="label">Reduced tax %</label>
              <input className="input" type="number" min={0} max={100} step="0.01" value={tax.reducedGstPercent} onChange={(e) => setTax({ ...tax, reducedGstPercent: num(e.target.value) })} /></div>
            <div><label className="label">Service charge %</label>
              <input className="input" type="number" min={0} max={100} step="0.01" value={tax.serviceChargePercent} onChange={(e) => setTax({ ...tax, serviceChargePercent: num(e.target.value) })} /></div>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="label !mb-0">Other charges</label>
              <button type="button" className="text-xs font-medium text-indigo-600"
                onClick={() => setTax({ ...tax, otherCharges: [...tax.otherCharges, { label: '', type: 'flat', value: 0 }] })}>+ Add charge</button>
            </div>
            {tax.otherCharges.map((c, i) => (
              <div key={i} className="mb-1.5 flex gap-2">
                <input className="input" placeholder="Label (e.g. Packaging)" required value={c.label} onChange={(e) => setCharge(i, { label: e.target.value })} />
                <select className="input !w-28" value={c.type} onChange={(e) => setCharge(i, { type: e.target.value as ChargeRule['type'] })}>
                  <option value="flat">Flat</option><option value="percent">Percent</option>
                </select>
                <input className="input !w-28" type="number" min={0} step="0.01" value={c.value} onChange={(e) => setCharge(i, { value: num(e.target.value) })} />
                <button type="button" className="px-2 text-slate-400 hover:text-red-600" onClick={() => setTax({ ...tax, otherCharges: tax.otherCharges.filter((_, idx) => idx !== i) })}>×</button>
              </div>
            ))}
          </div>
        </section>

        {save.isError && <p className="text-sm text-red-600">{errorMessage(save.error)}</p>}
        {save.isSuccess && <p className="text-sm text-emerald-700">Saved.</p>}
        <button className="btn-primary" disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save settings'}</button>
      </form>

      {role === 'owner' || role === 'admin' ? <StaffSection /> : null}
    </div>
  );
}

function StaffSection() {
  const queryClient = useQueryClient();
  const staff = useQuery({ queryKey: ['staff'], queryFn: authApi.staff });
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'cashier' as 'cashier' | 'admin' });
  const add = useMutation({
    mutationFn: () => authApi.addStaff(form),
    onSuccess: () => { setForm({ name: '', email: '', password: '', role: 'cashier' }); queryClient.invalidateQueries({ queryKey: ['staff'] }); },
  });

  return (
    <section className="card space-y-3">
      <h2 className="text-sm font-semibold">Staff</h2>
      <ul className="divide-y divide-slate-100 text-sm">
        {staff.data?.map((u) => (
          <li key={u._id} className="flex justify-between py-2">
            <span>{u.name} <span className="text-slate-500">· {u.email}</span></span>
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs uppercase">{u.role}</span>
          </li>
        ))}
      </ul>
      <form className="grid gap-2 sm:grid-cols-5" onSubmit={(e) => { e.preventDefault(); add.mutate(); }}>
        <input className="input sm:col-span-1" placeholder="Name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input className="input sm:col-span-2" type="email" placeholder="Email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <input className="input" type="password" placeholder="Password (8+)" minLength={8} required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as 'cashier' | 'admin' })}>
          <option value="cashier">Cashier</option><option value="admin">Admin</option>
        </select>
        <button className="btn-primary sm:col-span-5" disabled={add.isPending}>{add.isPending ? 'Adding…' : 'Add staff member'}</button>
      </form>
      {add.isError && <p className="text-sm text-red-600">{errorMessage(add.error)}</p>}
    </section>
  );
}
