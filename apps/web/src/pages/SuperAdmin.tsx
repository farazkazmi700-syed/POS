import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FeatureKey, ManagedBusiness } from '@pos/shared-types';
import { superAdminApi } from '../api';

const featureKeys: FeatureKey[] = ['pos', 'inventory', 'reports', 'customers', 'installments'];
const featureNames: Record<FeatureKey, string> = {
  pos: 'POS', inventory: 'Inventory', reports: 'Reports', customers: 'Customers', installments: 'Installments',
};

export default function SuperAdmin() {
  const client = useQueryClient();
  const [message, setMessage] = useState('');
  const overview = useQuery({ queryKey: ['super-admin', 'overview'], queryFn: superAdminApi.overview });
  const businesses = useQuery({ queryKey: ['super-admin', 'businesses'], queryFn: superAdminApi.businesses });
  const audit = useQuery({ queryKey: ['super-admin', 'audit'], queryFn: () => superAdminApi.audit(30) });
  const refresh = () => client.invalidateQueries({ queryKey: ['super-admin'] });

  const updateBusiness = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { name?: string; status?: 'active' | 'suspended' } }) =>
      superAdminApi.updateBusiness(id, body),
    onSuccess: () => { setMessage('Business updated.'); refresh(); },
    onError: () => setMessage('Business update failed.'),
  });
  const setFeature = useMutation({
    mutationFn: ({ business, key, enabled }: { business: ManagedBusiness; key: FeatureKey; enabled: boolean }) =>
      superAdminApi.updateFeatures(business.businessId, { [key]: enabled }),
    onSuccess: () => { setMessage('Feature access updated. Existing business data was retained.'); refresh(); },
    onError: () => setMessage('Feature update failed.'),
  });
  const isLoading = overview.isLoading || businesses.isLoading || audit.isLoading;
  if (isLoading) return <p className="text-sm text-slate-500">Loading control panel...</p>;
  if (overview.isError || businesses.isError || audit.isError) {
    return <p role="alert" className="text-sm text-red-600">Unable to load the Super Admin control panel.</p>;
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-4 dark:border-slate-700">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Kazmi POS</p>
          <h1 className="mt-1 text-2xl font-semibold">Super Admin</h1>
        </div>
        <p className="text-sm text-slate-500">Global business and feature controls</p>
      </header>

      {message && <p role="status" className="text-sm text-slate-600 dark:text-slate-300">{message}</p>}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-5" aria-label="Platform totals">
        {[
          ['Businesses', overview.data!.businesses], ['Active', overview.data!.activeBusinesses],
          ['Suspended', overview.data!.suspendedBusinesses], ['Plans', overview.data!.plans],
          ['Audit events', overview.data!.auditEvents],
        ].map(([label, value]) => (
          <div key={label} className="border-l-2 border-slate-300 pl-3 dark:border-slate-600">
            <p className="text-xs text-slate-500">{label}</p>
            <p className="mt-1 text-xl font-semibold">{value}</p>
          </div>
        ))}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Businesses</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-left text-sm">
            <thead><tr className="border-b border-slate-200 text-xs uppercase text-slate-500 dark:border-slate-700">
              <th className="py-2 pr-3">Business / ID</th><th className="py-2 pr-3">Status</th><th className="py-2 pr-3">Plan</th><th className="py-2">Features</th>
            </tr></thead>
            <tbody>
              {businesses.data!.map((business) => (
                <tr key={business.businessId} className="border-b border-slate-100 align-top dark:border-slate-800">
                  <td className="py-3 pr-3">
                    <input className="input mb-1 max-w-64" aria-label={`Name for ${business.name}`} defaultValue={business.name}
                      onBlur={(event) => { const name = event.currentTarget.value.trim(); if (name && name !== business.name) updateBusiness.mutate({ id: business.businessId, body: { name } }); }} />
                    <code className="text-xs text-slate-500">{business.businessId}</code>
                  </td>
                  <td className="py-3 pr-3">
                    <button className="btn-secondary" type="button"
                      onClick={() => updateBusiness.mutate({ id: business.businessId, body: { status: business.status === 'suspended' ? 'active' : 'suspended' } })}>
                      {business.status === 'suspended' ? 'Activate' : 'Suspend'}
                    </button>
                    <span className="ml-2 text-xs text-slate-500">{business.status}</span>
                  </td>
                  <td className="py-3 pr-3">
                    <span className="text-sm">{business.subscriptionPlan?.name ?? 'No plan'}</span>
                  </td>
                  <td className="py-3">
                    <div className="flex flex-wrap gap-x-4 gap-y-2">
                      {featureKeys.map((key) => (
                        <label key={key} className="flex items-center gap-1.5 whitespace-nowrap text-xs">
                          <input type="checkbox" checked={business.featureFlags[key]} aria-label={`${featureNames[key]} enabled for ${business.name}`}
                            onChange={(event) => setFeature.mutate({ business, key, enabled: event.target.checked })} />
                          {featureNames[key]}
                        </label>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
              {!businesses.data!.length && <tr><td className="py-4 text-slate-500" colSpan={4}>No businesses yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Recent administrative activity</h2>
        <div className="divide-y divide-slate-200 dark:divide-slate-700">
          {audit.data!.map((entry) => (
            <div key={entry._id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2 text-sm">
              <time className="text-xs text-slate-500" dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleString()}</time>
              <span className="font-medium">{entry.action}</span>
              <span className="text-slate-500">{entry.entityType} {entry.entityId}</span>
              <span className="ml-auto text-xs text-slate-500">{entry.actorEmail}</span>
            </div>
          ))}
          {!audit.data!.length && <p className="py-3 text-sm text-slate-500">No administrative changes recorded.</p>}
        </div>
      </section>
    </div>
  );
}