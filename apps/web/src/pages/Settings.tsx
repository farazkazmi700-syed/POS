import { TENANT_NAVIGATION_ITEMS } from '@pos/shared-types';
import type { ChargeRule, TaxProfile, Tenant, TenantNavigationKey } from '@pos/shared-types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { authApi, tenantApi } from '../api';
import { useTenant } from '../hooks/useTenant';
import { useAuth } from '../store/auth';
import { errorMessage } from '../utils/errors';

const SETTINGS_SECTIONS = [
  { id: 'navigation', label: 'Navigation' },
  { id: 'business', label: 'Business details' },
  { id: 'taxes', label: 'Taxes & charges' },
  { id: 'installments', label: 'Installments' },
  { id: 'account', label: 'Admin account' },
  { id: 'staff', label: 'Staff' },
];

export default function Settings() {
  const queryClient = useQueryClient();
  const { tenant } = useTenant();
  const role = useAuth((s) => s.user?.role);
  const authUser = useAuth((s) => s.user);
  const setSession = useAuth((s) => s.setSession);

  const [biz, setBiz] = useState({ name: '', address: '', taxRegNo: '', currency: 'PKR', invoicePrefix: 'INV', logoUrl: '' });
  const [profile, setProfile] = useState({ name: '', recoveryEmail: '', phone: '' });
  const [markup, setMarkup] = useState(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [tax, setTax] = useState<TaxProfile>({ gstPercent: 0, reducedGstPercent: 0, serviceChargePercent: 0, otherCharges: [] });
  const isLogoUploaded = biz.logoUrl.startsWith('data:');

  useEffect(() => {
    if (!tenant) return;
    setBiz({
      name: tenant.name, address: tenant.address ?? '', taxRegNo: tenant.taxRegNo ?? '',
      currency: tenant.currency, invoicePrefix: tenant.invoicePrefix, logoUrl: tenant.logoUrl ?? '',
    });
    setTax(tenant.taxProfile);
    setMarkup(tenant.installmentMarkupPercent ?? 0);
  }, [tenant]);

  useEffect(() => {
    if (!authUser) return;
    setProfile({
      name: authUser.name ?? '',
      recoveryEmail: authUser.recoveryEmail ?? '',
      phone: authUser.phone ?? '',
    });
  }, [authUser]);

  const save = useMutation({
    mutationFn: () => tenantApi.update({
      ...biz,
      logoUrl: biz.logoUrl?.trim() || undefined,
      currency: biz.currency.toUpperCase(),
      taxProfile: tax,
      installmentMarkupPercent: markup,
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tenant'] }),
  });

  const handleLogoUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      setBiz((current) => ({ ...current, logoUrl: result }));
      e.target.value = '';
    };
    reader.readAsDataURL(file);
  };

  const submit = (e: FormEvent) => { e.preventDefault(); save.mutate(); };

  const profileMutation = useMutation({
    mutationFn: () => authApi.updateProfile({
      name: profile.name.trim(),
      recoveryEmail: profile.recoveryEmail.trim() || undefined,
      phone: profile.phone.trim() || undefined,
    }),
    onSuccess: (data) => {
      setSession({ accessToken: useAuth.getState().accessToken ?? '', refreshToken: useAuth.getState().refreshToken ?? '', user: data });
    },
  });

  const verifyRecoveryMutation = useMutation({
    mutationFn: (type: 'email' | 'phone') => authApi.verifyRecovery(type),
    onSuccess: (data) => {
      setSession({ accessToken: useAuth.getState().accessToken ?? '', refreshToken: useAuth.getState().refreshToken ?? '', user: data });
    },
  });

  const navigationMutation = useMutation({
    mutationFn: ({ key, enabled }: { key: TenantNavigationKey; enabled: boolean }) => {
      const current = queryClient.getQueryData<Tenant>(['tenant']);
      return tenantApi.update({ navigationVisibility: { ...current?.navigationVisibility, [key]: enabled } });
    },
    onMutate: async ({ key, enabled }) => {
      await queryClient.cancelQueries({ queryKey: ['tenant'] });
      const previous = queryClient.getQueryData<Tenant>(['tenant']);
      queryClient.setQueryData<Tenant>(['tenant'], (current) => current ? {
        ...current,
        navigationVisibility: { ...current.navigationVisibility, [key]: enabled },
      } : current);
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(['tenant'], context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['tenant'] }),
  });

  const num = (v: string) => (v === '' ? 0 : Number(v));
  const setCharge = (i: number, patch: Partial<ChargeRule>) =>
    setTax({ ...tax, otherCharges: tax.otherCharges.map((c, idx) => (idx === i ? { ...c, ...patch } : c)) });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="border-b border-slate-200 pb-5 dark:border-slate-700">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-300">Workspace</p>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-300">Manage the business profile, operations, and access for {tenant?.name ?? 'your business'}.</p>
      </header>

      <div className="grid items-start gap-5 lg:grid-cols-[190px_minmax(0,1fr)] lg:gap-9">
        <nav aria-label="Settings sections" className="flex gap-1 overflow-x-auto border-b border-slate-200 pb-2 dark:border-slate-700 lg:sticky lg:top-24 lg:block lg:overflow-visible lg:border-b-0 lg:border-l lg:pb-0">
          {SETTINGS_SECTIONS.map((section) => (
            <a key={section.id} href={`#${section.id}`} className="block shrink-0 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-indigo-600 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white lg:rounded-l-none lg:border-l-2 lg:border-transparent lg:-ml-px">
              {section.label}
            </a>
          ))}
        </nav>

        <div className="min-w-0 space-y-6">
          <form onSubmit={submit} className="space-y-6">
        <section id="navigation" className="card scroll-mt-28 space-y-3">
          <div>
            <h2 className="text-sm font-semibold">Navigation</h2>
            <p className="text-xs text-slate-500">Choose which sections appear in the app navigation.</p>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {TENANT_NAVIGATION_ITEMS.map((item) => (
              <label key={item.key} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span>{item.label}</span>
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-indigo-600"
                  checked={tenant?.navigationVisibility?.[item.key] !== false}
                  disabled={navigationMutation.isPending}
                  onChange={(event) => navigationMutation.mutate({ key: item.key, enabled: event.target.checked })}
                  aria-label={`Show ${item.label} in navigation`}
                />
              </label>
            ))}
          </div>
          {navigationMutation.isError && <p className="text-sm text-red-600">{errorMessage(navigationMutation.error)}</p>}
        </section>

        <section id="business" className="card scroll-mt-28 space-y-3">
          <h2 className="text-sm font-semibold">Business details (printed on every invoice)</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><label className="label">Business name</label>
              <input className="input" required value={biz.name} onChange={(e) => setBiz({ ...biz, name: e.target.value })} /></div>
            <div className="sm:col-span-2"><label className="label">Address</label>
              <input className="input" value={biz.address} onChange={(e) => setBiz({ ...biz, address: e.target.value })} /></div>
            <div className="sm:col-span-2">
              <label className="label">Business logo URL</label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input className="input min-w-0 flex-1" placeholder={isLogoUploaded ? 'Uploaded image selected' : 'https://example.com/logo.png'} value={isLogoUploaded ? '' : biz.logoUrl} onChange={(e) => setBiz({ ...biz, logoUrl: e.target.value })} />
                <button type="button" className="btn-secondary !w-auto" onClick={() => fileInputRef.current?.click()}>
                  Upload logo
                </button>
                {biz.logoUrl && (
                  <button type="button" className="btn-secondary !w-auto" onClick={() => setBiz({ ...biz, logoUrl: '' })}>
                    Remove
                  </button>
                )}
              </div>
              {isLogoUploaded && <p className="mt-1 text-xs text-slate-500">An uploaded image is selected. Enter a URL to replace it.</p>}
              <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/jpg,image/webp,image/gif" className="hidden" onChange={handleLogoUpload} />
            </div>
            <div><label className="label">Tax registration no. (NTN/STRN)</label>
              <input className="input" value={biz.taxRegNo} onChange={(e) => setBiz({ ...biz, taxRegNo: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Currency (ISO)</label>
                <input className="input" maxLength={3} minLength={3} required value={biz.currency} onChange={(e) => setBiz({ ...biz, currency: e.target.value })} /></div>
              <div><label className="label">Invoice prefix</label>
                <input className="input" minLength={2} maxLength={8} required value={biz.invoicePrefix} onChange={(e) => setBiz({ ...biz, invoicePrefix: e.target.value })} /></div>
            </div>
            {biz.logoUrl && (
              <div className="sm:col-span-2 flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-900/60">
                <img src={biz.logoUrl} alt="Business logo preview" className="h-12 w-12 rounded-lg object-cover" />
                <div className="text-xs text-slate-600 dark:text-slate-300">Logo preview appears on the receipt watermark and in the header branding.</div>
              </div>
            )}
          </div>
        </section>

        <section id="taxes" className="card scroll-mt-28 space-y-3">
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
              <div key={i} className="mb-2 grid grid-cols-[minmax(0,1fr)_minmax(5rem,0.7fr)_auto] gap-2 sm:grid-cols-[minmax(0,1fr)_7rem_7rem_auto]">
                <input className="input col-span-3 min-w-0 sm:col-span-1" placeholder="Label (e.g. Packaging)" required value={c.label} onChange={(e) => setCharge(i, { label: e.target.value })} />
                <select className="input !w-auto min-w-0" value={c.type} onChange={(e) => setCharge(i, { type: e.target.value as ChargeRule['type'] })}>
                  <option value="flat">Flat</option><option value="percent">Percent</option>
                </select>
                <input className="input !w-auto min-w-0" type="number" min={0} step="0.01" value={c.value} onChange={(e) => setCharge(i, { value: num(e.target.value) })} />
                <button type="button" className="rounded-lg px-2 text-slate-500 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/40 dark:hover:text-red-300" aria-label={`Remove ${c.label || 'charge'}`} onClick={() => setTax({ ...tax, otherCharges: tax.otherCharges.filter((_, idx) => idx !== i) })}>×</button>
              </div>
            ))}
          </div>
        </section>

        <section id="account" className="card scroll-mt-28 space-y-4">
          <div>
            <h2 className="text-sm font-semibold">Admin account &amp; recovery</h2>
            <p className="text-xs text-slate-500">Update the admin profile and add verified contact details that can be used for password recovery.</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><label className="label">Admin name</label>
              <input className="input" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} /></div>
            <div><label className="label">Recovery email</label>
              <input className="input" type="email" value={profile.recoveryEmail} onChange={(e) => setProfile({ ...profile, recoveryEmail: e.target.value })} /></div>
            <div><label className="label">Recovery phone</label>
              <input className="input" value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} /></div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-secondary" onClick={() => profileMutation.mutate()} disabled={profileMutation.isPending}>Save profile</button>
            {profile.recoveryEmail && (
              <button type="button" className="btn-secondary" onClick={() => verifyRecoveryMutation.mutate('email')} disabled={verifyRecoveryMutation.isPending}>
                {authUser?.emailVerified ? 'Email verified' : 'Verify email'}
              </button>
            )}
            {profile.phone && (
              <button type="button" className="btn-secondary" onClick={() => verifyRecoveryMutation.mutate('phone')} disabled={verifyRecoveryMutation.isPending}>
                {authUser?.phoneVerified ? 'Phone verified' : 'Verify phone'}
              </button>
            )}
          </div>

          {profileMutation.isError && <p className="text-sm text-red-600">{errorMessage(profileMutation.error)}</p>}
          {verifyRecoveryMutation.isError && <p className="text-sm text-red-600">{errorMessage(verifyRecoveryMutation.error)}</p>}
        </section>

        <section id="installments" className="card scroll-mt-28 space-y-3">
          <div>
            <h2 className="text-sm font-semibold">Installment sales</h2>
            <p className="text-xs text-slate-500">Installment price = cash price + this markup. The cashier can change it for each sale.</p>
          </div>
          <div className="max-w-xs"><label className="label">Default markup %</label>
            <input className="input" type="number" min={0} max={100} step="0.01" value={markup} onChange={(e) => setMarkup(num(e.target.value))} /></div>
        </section>

        <div className="flex flex-col gap-3 border-t border-slate-200 pt-4 dark:border-slate-700 sm:flex-row sm:items-center sm:justify-between">
          <p aria-live="polite" className={`text-sm ${save.isError ? 'text-red-600' : 'text-slate-500 dark:text-slate-400'}`}>
            {save.isError ? errorMessage(save.error) : save.isSuccess ? 'Business settings saved.' : 'Remember to save your business and tax changes.'}
          </p>
          <button className="btn-primary w-full sm:w-auto" disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save settings'}</button>
        </div>
          </form>

          {role === 'owner' || role === 'admin' ? <div id="staff" className="scroll-mt-28"><StaffSection /></div> : null}
        </div>
      </div>
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
