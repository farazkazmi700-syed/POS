import type { TaxProfile } from '@pos/shared-types';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState, type FormEvent } from 'react';
import { tenantApi } from '../api';
import { errorMessage } from '../utils/errors';

const rates = [
  ['gstPercent', 'Standard GST (%)'],
  ['reducedGstPercent', 'Reduced GST (%)'],
  ['serviceChargePercent', 'Service charge (%)'],
] as const;

export default function TaxSettings({ profile, currency }: { profile: TaxProfile; currency: string }) {
  const client = useQueryClient();
  const [charges, setCharges] = useState(() => profile.otherCharges.map((charge, id) => ({ ...charge, id })));
  const nextId = useRef(charges.length);
  const save = useMutation({
    mutationFn: (taxProfile: TaxProfile) => tenantApi.update({ taxProfile }),
    onSuccess: (tenant) => {
      client.setQueryData(['tenant'], tenant);
      return client.invalidateQueries({ queryKey: ['preview'] });
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    save.mutate({
      gstPercent: Number(data.get('gstPercent')),
      reducedGstPercent: Number(data.get('reducedGstPercent')),
      serviceChargePercent: Number(data.get('serviceChargePercent')),
      otherCharges: charges.map(({ id }) => ({
        label: String(data.get('label-' + id)).trim(),
        type: data.get('type-' + id) === 'flat' ? 'flat' : 'percent',
        value: Number(data.get('value-' + id)),
      })),
    });
  }

  return <form id="taxes" onSubmit={submit} className="card scroll-mt-28 space-y-4">
    <h2 className="text-sm font-semibold">Tax and service charges</h2>
    <p className="text-xs text-slate-500">New sales use each product’s tax class after discounts. Exempt items have zero tax. Percentage charges apply to the discounted subtotal. Invoices list charges separately and group tax by rate.</p>
    <fieldset disabled={save.isPending} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {rates.map(([key, label]) => <label key={key} className="label">{label}
          <input className="input" type="number" name={key} min="0" max="100" step="any" required defaultValue={profile[key]} />
        </label>)}
      </div>
      {charges.map(({ id, label, type, value }) => <div key={id} className="grid gap-3 sm:grid-cols-4">
        <label className="label">Charge name<input name={'label-' + id} defaultValue={label} className="input" required pattern={'.*\\S.*'} maxLength={60} /></label>
        <label className="label">Charge type<select name={'type-' + id} defaultValue={type} className="input">
          <option value="flat">Fixed ({currency})</option><option value="percent">Percentage (%)</option>
        </select></label>
        <label className="label">Value<input name={'value-' + id} className="input" type="number" min="0" step="any" required defaultValue={value} /></label>
        <button type="button" className="btn-secondary self-end" onClick={() => setCharges(charges.filter((c) => c.id !== id))}>Remove charge</button>
      </div>)}
      <button type="button" className="btn-secondary" onClick={() => setCharges([...charges, { id: nextId.current++, label: '', type: 'flat', value: 0 }])}>Add charge</button>
    </fieldset>
    <button className="btn-primary" disabled={save.isPending}>Save tax settings</button>
    <p role="status" className="text-sm">{save.isError ? errorMessage(save.error) : save.isSuccess ? 'Tax settings saved.' : ''}</p>
  </form>;
}
