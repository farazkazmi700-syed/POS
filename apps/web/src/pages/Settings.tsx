import { MODULE_RIGHTS } from '@pos/shared-types';
import type { ModuleRightKey, Tenant, TenantNavigationKey, InvoicePrintSettings } from '@pos/shared-types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import LogoBrandingManager from '../components/LogoBrandingManager';
import PageHeading from '../components/PageHeading';
import TaxSettings from '../components/TaxSettings';
import OperationsSettings from '../components/OperationsSettings';
import { authApi, branchApi, tenantApi } from '../api';
import { useTenant } from '../hooks/useTenant';
import { useAuth } from '../store/auth';
import { errorMessage } from '../utils/errors';
import { availablePages, canManageSetting } from '../utils/access';
import { Link } from 'react-router-dom';

export default function Settings() {
  const queryClient = useQueryClient();
  const { tenant } = useTenant();
  const authUser = useAuth((s) => s.user);
  const setSession = useAuth((s) => s.setSession);

  const pages = authUser && tenant ? availablePages(authUser, tenant) : [];
  const can = (action: string) => canManageSetting(authUser, action);
  const business = can('tax.configure');
  const invoices = business && pages.some((page) => page.key === 'pos' || page.key === 'orders');
  const installments = business && can('installments.write') && pages.some((page) => page.key === 'installments');
  const staffAccess = can('users.read') || can('users.invite');
  const sections = [
    { id: 'navigation', label: 'Navigation', visible: business },
    { id: 'business', label: 'Business details', visible: business },
    { id: 'installments', label: 'Installments', visible: installments },
    { id: 'account', label: 'Admin account', visible: true },
    { id: 'taxes', label: 'Tax and service charges', visible: invoices },
    { id: 'staff', label: 'Staff', visible: staffAccess },
  ];

  const [biz, setBiz] = useState({ name: '', address: '', taxRegNo: '', currency: 'PKR', invoicePrefix: 'INV', logoUrl: '' });
  const [profile, setProfile] = useState({ name: '', recoveryEmail: '', phone: '' });
  const recoveryEmailSaved = profile.recoveryEmail.trim().toLowerCase() === (authUser?.recoveryEmail ?? '').toLowerCase();
  const [emailVerificationCode, setEmailVerificationCode] = useState('');
  const [emailVerificationSent, setEmailVerificationSent] = useState(false);
  const [emailVerificationNotice, setEmailVerificationNotice] = useState('');
  const [markup, setMarkup] = useState(0);
  const [print, setPrint] = useState<InvoicePrintSettings>({ paperSize: 'A4', orientation: 'portrait', widthMm: 80, heightMm: 200, logoWatermark: true });

  useEffect(() => {
    if (!tenant) return;
    setBiz({
      name: tenant.name, address: tenant.address ?? '', taxRegNo: tenant.taxRegNo ?? '',
      currency: tenant.currency, invoicePrefix: tenant.invoicePrefix, logoUrl: tenant.logoUrl ?? '',
    });
    setMarkup(tenant.installmentMarkupPercent ?? 0);
    setPrint({ paperSize: 'A4', orientation: 'portrait', widthMm: 80, heightMm: 200, logoWatermark: true, ...tenant.invoicePrintSettings });
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
      name: biz.name,
      address: biz.address,
      ...(invoices ? { invoicePrefix: biz.invoicePrefix, taxRegNo: biz.taxRegNo, invoicePrintSettings: print } : {}),
      ...(invoices ? { logoUrl: biz.logoUrl.trim() } : {}),
      currency: biz.currency.toUpperCase(),
      ...(installments ? { installmentMarkupPercent: markup } : {}),
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tenant'] }),
  });
  const submit = (e: FormEvent) => { e.preventDefault(); if (business) save.mutate(); };

  const saveLogo = useMutation({
    mutationFn: (url: string) => tenantApi.update({
      logoUrl: url.trim(),
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tenant'] }),
  });

  const profileMutation = useMutation({
    mutationFn: () => authApi.updateProfile({
      name: profile.name.trim(),
      recoveryEmail: profile.recoveryEmail.trim() || null,
      phone: profile.phone.trim() || null,
    }),
    onSuccess: (data) => {
      setSession({ accessToken: useAuth.getState().accessToken ?? '', refreshToken: useAuth.getState().refreshToken ?? '', user: data });
      setEmailVerificationSent(false);
      setEmailVerificationCode('');
      setEmailVerificationNotice('');
    },
  });

  const verifyRecoveryMutation = useMutation({
    mutationFn: (type: 'email' | 'phone') => authApi.verifyRecovery(type),
    onSuccess: (data) => {
      if ('role' in data) {
        setSession({ accessToken: useAuth.getState().accessToken ?? '', refreshToken: useAuth.getState().refreshToken ?? '', user: data });
      } else {
        setEmailVerificationSent(true);
        setEmailVerificationNotice(data.message);
      }
    },
  });
  const confirmEmailMutation = useMutation({
    mutationFn: () => authApi.confirmRecoveryEmail(emailVerificationCode),
    onSuccess: (data) => {
      setSession({ accessToken: useAuth.getState().accessToken ?? '', refreshToken: useAuth.getState().refreshToken ?? '', user: data });
      setEmailVerificationSent(false);
      setEmailVerificationCode('');
      setEmailVerificationNotice('Recovery email verified.');
    },
  });

  const navigationMutation = useMutation({
    mutationFn: ({ key, enabled }: { key: TenantNavigationKey; enabled: boolean }) => {
      return tenantApi.update({
        navigationVisibility: { [key]: enabled },
      });
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
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="page-header">
        <PageHeading eyebrow="Workspace" title="Settings" description={`Business details, preferences, and access for ${tenant?.name ?? 'your business'}.`} />
      </header>

      <div className="grid items-start gap-5 lg:grid-cols-[190px_minmax(0,1fr)] lg:gap-9">
        <nav aria-label="Settings sections" className="flex gap-1.5 overflow-x-auto pb-2 no-scrollbar border-b border-slate-200 dark:border-slate-700 lg:sticky lg:top-24 lg:block lg:overflow-visible lg:border-b-0 lg:border-l lg:pb-0">
          {sections.filter((section) => section.visible).map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className="shrink-0 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-teal-600 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white lg:block lg:rounded-l-none lg:border-l-2 lg:border-transparent lg:-ml-px lg:py-2 lg:text-sm"
            >
              {section.label}
            </a>
          ))}
        </nav>

        <div className="min-w-0 space-y-6">
          <form onSubmit={submit} className="space-y-6">
        {business && <>
        <section id="navigation" className="card scroll-mt-28 space-y-3">
          <div>
            <h2 className="text-sm font-semibold">Navigation</h2>
            <p className="text-xs text-slate-500">Choose which sections appear in the app navigation.</p>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {pages.filter((item) => item.key !== 'help' && item.key !== 'backup').map((item) => (
              <label key={item.key} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span>{item.label}</span>
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-teal-600"
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
          <h2 className="text-sm font-semibold">Business details</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><label className="label">Business name</label>
              <input className="input" required value={biz.name} onChange={(e) => setBiz({ ...biz, name: e.target.value })} /></div>
            <div className="sm:col-span-2"><label className="label">Address</label>
              <input className="input" value={biz.address} onChange={(e) => setBiz({ ...biz, address: e.target.value })} /></div>
            {invoices && <div><label className="label">Tax registration no. (NTN/STRN)</label>
              <input className="input" value={biz.taxRegNo} onChange={(e) => setBiz({ ...biz, taxRegNo: e.target.value })} /></div>}
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Currency (ISO)</label>
                <input className="input" maxLength={3} minLength={3} required value={biz.currency} onChange={(e) => setBiz({ ...biz, currency: e.target.value })} /></div>
              {invoices && <div><label className="label">Invoice prefix</label>
                <input className="input" minLength={2} maxLength={8} required value={biz.invoicePrefix} onChange={(e) => setBiz({ ...biz, invoicePrefix: e.target.value })} /></div>}
            </div>
            {invoices && <div className="sm:col-span-2 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/60">
              <LogoBrandingManager
                logoUrl={biz.logoUrl}
                savedLogoUrl={tenant?.logoUrl ?? ''}
                businessName={biz.name}
                address={biz.address}
                taxRegNo={biz.taxRegNo}
                currency={biz.currency}
                invoicePrefix={biz.invoicePrefix}
                onChangeLogoUrl={(url) => setBiz((current) => ({ ...current, logoUrl: url }))}
                onSaveLogo={async (url) => {
                  setBiz((current) => ({ ...current, logoUrl: url }));
                  await saveLogo.mutateAsync(url);
                }}
                isSaving={saveLogo.isPending}
              />
              {saveLogo.isError && <p className="mt-2 text-sm text-red-600">{errorMessage(saveLogo.error)}</p>}
            </div>}
          </div>
        </section>

        {invoices && <section className="card space-y-3">
          <h2 className="text-sm font-semibold">Invoice printing</h2>
          <p className="text-xs text-slate-500">Applies to newly generated invoices. Open a receipt PDF to preview or print at actual size.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="label">Paper size<select className="input" value={print.paperSize} onChange={(e) => setPrint({ ...print, paperSize: e.target.value as InvoicePrintSettings['paperSize'] })}>
              {['A4', 'A5', 'A6', '80mm', '58mm', 'custom', 'Receipt'].map((size) => <option key={size}>{size}</option>)}
            </select></label>
            <label className="label">Orientation<select className="input" value={print.orientation} onChange={(e) => setPrint({ ...print, orientation: e.target.value as 'portrait' | 'landscape' })}><option value="portrait">Portrait</option><option value="landscape">Landscape (sheet sizes)</option></select></label>
            {print.paperSize === 'custom' && <label className="label">Width (mm)<input className="input" type="number" required min={40} max={420} step="0.1" value={print.widthMm ?? 80} onChange={(e) => setPrint({ ...print, widthMm: Number(e.target.value) })} /></label>}
            {['custom', '80mm', '58mm', 'Receipt'].includes(print.paperSize) && <label className="label">Page length (mm)<input className="input" type="number" required min={40} max={1000} step="0.1" value={print.heightMm ?? 200} onChange={(e) => setPrint({ ...print, heightMm: Number(e.target.value) })} /></label>}
            <label className="label">Stamp text<input className="input" maxLength={80} value={print.stamp ?? ''} onChange={(e) => setPrint({ ...print, stamp: e.target.value })} /></label>
            <label className="label">Watermark text<input className="input" maxLength={80} value={print.watermark ?? ''} onChange={(e) => setPrint({ ...print, watermark: e.target.value })} /></label>
            <label className="label">Footer message<input className="input" maxLength={250} value={print.footerText ?? ''} onChange={(e) => setPrint({ ...print, footerText: e.target.value })} /></label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={print.logoWatermark !== false} onChange={(e) => setPrint({ ...print, logoWatermark: e.target.checked })} />Business logo watermark</label>
          </div>
        </section>}

        </>}

        <section id="account" className="card scroll-mt-28 space-y-4">
          <div>
            <h2 className="text-sm font-semibold">Admin account &amp; recovery</h2>
            <p className="text-xs text-slate-500">Update the admin profile and add verified contact details that can be used for password recovery.</p>
          </div>

          <fieldset disabled={profileMutation.isPending} className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><label className="label">Admin name</label>
              <input className="input" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} /></div>
            <div><label htmlFor="recovery-email" className="label">Recovery email</label>
              <input className="input" id="recovery-email" type="email" value={profile.recoveryEmail} onChange={(e) => setProfile({ ...profile, recoveryEmail: e.target.value })} />
              {profile.recoveryEmail && <button type="button" className="text-sm underline" onClick={() => setProfile({ ...profile, recoveryEmail: '' })}>Remove email</button>}</div>
            <div><label htmlFor="recovery-phone" className="label">Recovery phone</label>
              <input className="input" id="recovery-phone" type="tel" value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} />
              {profile.phone && <button type="button" className="text-sm underline" onClick={() => setProfile({ ...profile, phone: '' })}>Remove phone</button>}</div>
          </fieldset>

          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-secondary" onClick={() => profileMutation.mutate()} disabled={profileMutation.isPending}>Save profile</button>
            {profile.recoveryEmail && (
              <button type="button" className="btn-secondary" onClick={() => verifyRecoveryMutation.mutate('email')} disabled={verifyRecoveryMutation.isPending || authUser?.emailVerified || !recoveryEmailSaved}>
                {authUser?.emailVerified ? 'Email verified' : 'Verify email'}
              </button>
            )}
            {profile.phone && (
              <Link className="btn-secondary" to="/recover">
                {authUser?.phoneVerified ? 'Phone verified' : 'Verify phone'}
              </Link>
            )}
          </div>

          <Link className="btn-secondary inline-flex" to="/recover">Change password or PIN with OTP</Link>
          {profileMutation.isSuccess && profile.name === authUser?.name && recoveryEmailSaved && profile.phone === (authUser?.phone ?? '') && <p role="status" className="text-sm">Profile saved.</p>}
          {profileMutation.isError && <p className="text-sm text-red-600">{errorMessage(profileMutation.error)}</p>}
          {verifyRecoveryMutation.isError && <p className="text-sm text-red-600">{errorMessage(verifyRecoveryMutation.error)}</p>}
          {emailVerificationSent && <div className="flex flex-wrap items-end gap-2">
            <div><label className="label">Email verification code</label>
              <input className="input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]{6}" value={emailVerificationCode} onChange={(e) => setEmailVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))} /></div>
            <button type="button" className="btn-secondary" onClick={() => confirmEmailMutation.mutate()} disabled={emailVerificationCode.length !== 6 || confirmEmailMutation.isPending}>
              {confirmEmailMutation.isPending ? 'Verifying…' : 'Confirm email'}
            </button>
          </div>}
          {confirmEmailMutation.isError && <p className="text-sm text-red-600">{errorMessage(confirmEmailMutation.error)}</p>}
          {emailVerificationNotice && <p className="text-sm text-emerald-700">{emailVerificationNotice}</p>}
        </section>

        {installments && <section id="installments" className="card scroll-mt-28 space-y-3">
          <div>
            <h2 className="text-sm font-semibold">Installment sales</h2>
            <p className="text-xs text-slate-500">Installment price = cash price + this markup. The cashier can change it for each sale.</p>
          </div>
          <div className="max-w-xs"><label className="label">Default markup %</label>
            <input className="input" type="number" min={0} max={100} step="0.01" value={markup} onChange={(e) => setMarkup(num(e.target.value))} /></div>
        </section>}

        {business && <div className="flex flex-col gap-3 border-t border-slate-200 pt-4 dark:border-slate-700 sm:flex-row sm:items-center sm:justify-between">
          <p aria-live="polite" className={`text-sm ${save.isError ? 'text-red-600' : 'text-slate-500 dark:text-slate-400'}`}>
            {save.isError ? errorMessage(save.error) : save.isSuccess ? 'Business settings saved.' : 'Remember to save your business changes.'}
          </p>
          <button className="btn-primary w-full sm:w-auto" disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save settings'}</button>
        </div>}
          </form>

          {invoices && tenant?.taxProfile && <TaxSettings key={tenant._id} profile={tenant.taxProfile} currency={tenant.currency} />}
          {staffAccess ? <div id="staff" className="scroll-mt-28"><StaffSection /></div> : null}
          {(can('branches.read') || can('branches.write') || can('audit.read')) && <OperationsSettings readBranches={can('branches.read')} writeBranches={can('branches.write')} readAudit={can('audit.read')} />}
        </div>
      </div>
    </div>
  );
}

function StaffSection() {
  const queryClient = useQueryClient();
  const actor = useAuth((state) => state.user);
  const { tenant } = useTenant();
  const can = (action: string) => canManageSetting(actor, action);
  const branches = useQuery({ queryKey: ['branches'], queryFn: branchApi.list, enabled: can('branches.read') });
  const [newStaffBranches, setNewStaffBranches] = useState<string[]>([]);
  const [editingActions, setEditingActions] = useState<string[]>([]);
  const [editingBranches, setEditingBranches] = useState<string[]>([]);
  const actions = actor?.permissions ?? [];
  const staff = useQuery({ queryKey: ['staff'], queryFn: authApi.staff, enabled: can('users.read') });
  const pages = actor && tenant ? availablePages(actor, tenant) : [];
  const grantableRights = MODULE_RIGHTS.filter((right) => pages.some((page) => page.key === right.key)).map((right) => right.key);
  const actionModules: Record<string, ModuleRightKey[]> = {
    catalog: ['products', 'pos', 'barcode-generator', 'barcode-scanner'], inventory: ['products'],
    sales: ['orders', 'pos'], receipts: ['orders', 'pos'], customers: ['customers', 'pos', 'installments'],
    installments: ['installments'], reports: ['dashboard'], tax: ['orders', 'pos'],
  };
  const visibleActions = actions.filter((action) => {
    const modules = actionModules[action.split('.')[0]];
    return !modules || modules.some((key) => grantableRights.includes(key));
  });
  const [form, setForm] = useState<{ name: string; email: string; password: string; role: 'cashier' | 'admin'; moduleRights: ModuleRightKey[] }>({ name: '', email: '', password: '', role: 'cashier', moduleRights: grantableRights.filter((key) => key !== 'dashboard' && key !== 'settings') });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingRights, setEditingRights] = useState<ModuleRightKey[]>([]);
  const add = useMutation({
    mutationFn: () => authApi.addStaff({ ...form, branchIds: newStaffBranches }),
    onSuccess: () => { setForm({ name: '', email: '', password: '', role: 'cashier', moduleRights: grantableRights.filter((key) => key !== 'dashboard' && key !== 'settings') }); queryClient.invalidateQueries({ queryKey: ['staff'] }); },
  });
  const updateRights = useMutation({
    mutationFn: ({ id, rights }: { id: string; rights: ModuleRightKey[] }) => authApi.updateStaffRights(id, rights, { ...(actions.length ? { permissions: editingActions } : {}), branchIds: editingBranches }),
    onSuccess: (updated) => { setEditingId(null); queryClient.invalidateQueries({ queryKey: ['staff'] }); if (updated._id === actor?._id) useAuth.setState({ user: updated }); },
  });

  const status = useMutation({ mutationFn: ({ id, active }: { id: string; active: boolean }) => authApi.updateStaffStatus(id, active), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['staff'] }) });

  const toggleFormRight = (key: ModuleRightKey) =>
    setForm((f) => ({ ...f, moduleRights: f.moduleRights.includes(key) ? f.moduleRights.filter((k) => k !== key) : [...f.moduleRights, key] }));
  const toggleEditRight = (key: ModuleRightKey) =>
    setEditingRights((r) => (r.includes(key) ? r.filter((k) => k !== key) : [...r, key]));

  const rightsChecklist = (
    selected: ModuleRightKey[],
    toggle: (key: ModuleRightKey) => void,
    targetRole: string,
  ) => (
    <div className="grid gap-1 sm:grid-cols-2">
      {MODULE_RIGHTS.filter((right) => grantableRights.includes(right.key)).map((right) => (
        <label key={right.key} className="flex items-center gap-2 py-1 text-xs">
          <input type="checkbox" className="h-4 w-4 accent-teal-600" checked={selected.includes(right.key)} disabled={add.isPending || updateRights.isPending || (targetRole === 'cashier' && (right.key === 'dashboard' || right.key === 'settings')) || (actor?.role !== 'owner' && actor?.moduleRights !== undefined && !actor.moduleRights.includes(right.key))} onChange={() => toggle(right.key)} aria-label={`Grant ${right.label} module access`} />
          <span>{right.label}</span>
        </label>
      ))}
    </div>
  );

  return (
    <section className="card space-y-3">
      <h2 className="text-sm font-semibold">Staff & access rights</h2>
      <p className="text-xs text-slate-500">Choose the modules each account can access. Business entitlements and role restrictions still apply. Available actions depend on your account permissions.</p>
      {can('users.read') && <>
      {staff.isPending && <p role="status" className="text-sm text-slate-500">Loading staff…</p>}
      {staff.isError && <div role="alert" className="text-sm text-red-600">{errorMessage(staff.error)} <button type="button" className="underline" onClick={() => staff.refetch()}>Retry</button></div>}
      {status.isError && <p role="alert" className="text-sm text-red-600">{errorMessage(status.error)}</p>}
      {staff.isSuccess && staff.data.length === 0 && <p className="text-sm text-slate-500">No staff accounts yet. Add your first account below.</p>}
      <ul className="divide-y divide-slate-100 text-sm">
        {staff.data?.map((u) => (
          <li key={u._id} className="py-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>{u.name} <span className="text-slate-500">· {u.email}</span></span>
              <span className="flex items-center gap-2">
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs uppercase dark:bg-slate-800">{u.role}</span>
                {can('users.roles.assign') && u.role !== 'owner' && (
                  <button
                    type="button"
                    className="text-xs font-medium text-teal-600 hover:underline dark:text-teal-400"
                    disabled={updateRights.isPending}
                    onClick={() => { updateRights.reset(); setEditingId(editingId === u._id ? null : u._id); setEditingRights(u.moduleRights ?? [...grantableRights]); setEditingActions(u.permissions ?? actions); setEditingBranches(u.branchIds ?? []); }}
                  >
                    {editingId === u._id ? 'Cancel' : 'Edit rights'}
                  </button>
                )}
                {can('users.disable') && u.role !== 'owner' && u._id !== actor?._id && <button type="button" className="text-xs font-semibold text-red-600" disabled={status.isPending} onClick={() => { if (window.confirm(`${u.isActive ? 'Deactivate' : 'Reactivate'} ${u.name}? Existing sessions will be revoked.`)) status.mutate({ id: u._id, active: !u.isActive }); }}>{u.isActive ? 'Deactivate' : 'Reactivate'}</button>}
              </span>
            </div>
            {editingId !== u._id && (
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{u.role === 'owner' ? 'All business modules' : u.moduleRights === undefined ? 'All modules permitted by role' : u.moduleRights.length ? `Modules: ${MODULE_RIGHTS.filter((right) => grantableRights.includes(right.key) && u.moduleRights?.includes(right.key)).map((right) => right.label).join(', ')}` : 'No modules assigned'}</p>
            )}
            {can('users.roles.assign') && editingId === u._id && (
              <div className="mt-2 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                {rightsChecklist(editingRights, toggleEditRight, u.role)}
                {can('branches.read') && Array.isArray(branches.data) && branches.data.length > 0 && <fieldset className="mt-4"><legend className="label">Assigned branches</legend><div className="grid gap-2 sm:grid-cols-2">{branches.data.map((branch) => <label key={branch._id} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={editingBranches.includes(branch._id)} onChange={() => setEditingBranches((current) => current.includes(branch._id) ? current.filter((id) => id !== branch._id) : [...current, branch._id])} />{branch.name}</label>)}</div></fieldset>}
                {actions.length > 0 && <details className="mt-4"><summary className="cursor-pointer text-xs font-semibold">Action permissions</summary><div className="mt-3 grid gap-2 sm:grid-cols-2">{visibleActions.filter((action) => action !== 'account.self' && action !== 'workspace.read').map((action) => <label key={action} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={editingActions.includes(action)} onChange={() => setEditingActions((current) => current.includes(action) ? current.filter((key) => key !== action) : [...current, action])} /><span>{action}</span></label>)}</div></details>}
                <div className="mt-3 flex gap-3 text-xs"><button type="button" className="text-teal-600 underline" disabled={updateRights.isPending} onClick={() => setEditingRights(grantableRights.filter((key) => u.role !== 'cashier' || (key !== 'dashboard' && key !== 'settings')))}>Select available</button><button type="button" className="text-slate-500 underline" disabled={updateRights.isPending} onClick={() => setEditingRights([])}>Clear all</button></div>
                <div className="mt-2 flex items-center gap-2">
                  <button type="button" className="btn-primary !w-auto" disabled={updateRights.isPending} onClick={() => updateRights.mutate({ id: u._id, rights: editingRights })}>
                    {updateRights.isPending ? 'Saving…' : 'Save rights'}
                  </button>
                  {updateRights.isError && <p className="text-xs text-red-600">{errorMessage(updateRights.error)}</p>}
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
      </>}
      {can('users.invite') && <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); if (!add.isPending) add.mutate(); }}>
        <div className="grid gap-2 sm:grid-cols-5">
          <input className="input sm:col-span-1" placeholder="Name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className="input sm:col-span-2" type="email" placeholder="Email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <input className="input" type="password" placeholder="Password (8+)" minLength={8} required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as 'cashier' | 'admin', moduleRights: e.target.value === 'cashier' ? form.moduleRights.filter((key) => key !== 'dashboard' && key !== 'settings') : form.moduleRights })}>
            <option value="cashier">Cashier</option><option value="admin">Admin</option>
          </select>
        </div>
        <div>
          <p className="mb-1 text-xs font-medium text-slate-600 dark:text-slate-300">Module access</p>
          {rightsChecklist(form.moduleRights, toggleFormRight, form.role)}
          {can('branches.read') && Array.isArray(branches.data) && branches.data.length > 0 && <fieldset className="mt-3"><legend className="label">Branch access for the new account</legend>{branches.data.map((branch) => <label key={branch._id} className="mr-4 inline-flex items-center gap-2 text-xs"><input type="checkbox" checked={newStaffBranches.includes(branch._id)} onChange={() => setNewStaffBranches((current) => current.includes(branch._id) ? current.filter((id) => id !== branch._id) : [...current, branch._id])} />{branch.name}</label>)}</fieldset>}
          <div className="mt-3 flex gap-3 text-xs"><button type="button" className="text-teal-600 underline" disabled={add.isPending} onClick={() => setForm((current) => ({ ...current, moduleRights: grantableRights.filter((key) => current.role !== 'cashier' || (key !== 'dashboard' && key !== 'settings')) }))}>Select available</button><button type="button" className="text-slate-500 underline" disabled={add.isPending} onClick={() => setForm((current) => ({ ...current, moduleRights: [] }))}>Clear all</button></div>
        </div>
        <button className="btn-primary w-full sm:w-auto" disabled={add.isPending}>{add.isPending ? 'Adding…' : 'Add staff member'}</button>
      </form>}
      {add.isError && <p className="text-sm text-red-600">{errorMessage(add.error)}</p>}
    </section>
  );
}
