const installmentCapabilities: readonly {
  name: string;
  benefit: string;
  priority: 'Critical' | 'High';
  status: 'Available' | 'Partial' | 'Planned';
  detail?: string;
}[] = [
  { name: 'Smart installment calculator', benefit: 'Automatically calculates payment schedules', priority: 'Critical', status: 'Available', detail: 'Installment quotes calculate the payment schedule.' },
  { name: 'Customer digital ledger', benefit: 'Complete payment and purchase history', priority: 'Critical', status: 'Available', detail: 'Customer ledgers show installment sales and recorded payments.' },
  { name: 'Guarantor management', benefit: 'Maintains guarantor records', priority: 'Critical', status: 'Available', detail: 'Customer records store guarantor details, which can be included in agreements.' },
  { name: 'Recovery management', benefit: 'Tracks overdue payment recovery', priority: 'Critical', status: 'Partial', detail: 'Overdue balances and collections are tracked. Recovery cases and follow-up history are planned.' },
  { name: 'Customer risk assessment', benefit: 'Helps identify risky installment agreements', priority: 'High', status: 'Planned' },
  { name: 'WhatsApp payment reminders', benefit: 'Reduces missed payments', priority: 'High', status: 'Planned' },
  { name: 'Digital installment agreement', benefit: 'Generates printable customer contracts', priority: 'High', status: 'Available', detail: 'Installment plans include a printable agreement.' },
  { name: 'IMEI, serial and chassis tracking', benefit: 'Tracks individual sold products', priority: 'High', status: 'Partial', detail: 'POS order lines record IMEI or serial numbers. Dedicated chassis tracking is planned.' },
  { name: 'Recovery agent management', benefit: 'Assigns and monitors recovery staff', priority: 'High', status: 'Planned' },
  { name: 'Profit forecasting', benefit: 'Estimates future installment income', priority: 'High', status: 'Planned' },
];

export function findInstallmentCapabilities(query: string) {
  return installmentCapabilities.filter((feature) =>
    [feature.name, feature.benefit, feature.priority, feature.status, feature.detail]
      .some((value) => value?.toLowerCase().includes(query)),
  );
}

export default function InstallmentCapabilities({ query }: { query: string }) {
  const features = findInstallmentCapabilities(query);
  if (!features.length) return null;

  return (
    <section className="dev-card overflow-hidden" aria-labelledby="installment-features-title">
      <h3 id="installment-features-title" className="p-4 text-sm font-semibold">Installment features</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="border-y border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
            <tr>
              <th scope="col" className="px-4 py-3">Feature and business benefit</th>
              <th scope="col" className="px-3 py-3">Priority</th>
              <th scope="col" className="px-3 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {features.map((feature) => (
              <tr key={feature.name}>
                <th scope="row" className="px-4 py-3 font-semibold">
                  {feature.name}
                  <span className="mt-1 block font-normal text-slate-600 dark:text-slate-400">{feature.benefit}</span>
                  {feature.detail && <span className="mt-1 block font-normal text-slate-600 dark:text-slate-400">{feature.detail}</span>}
                </th>
                <td className="px-3 py-3 align-top">{feature.priority}</td>
                <td className="px-3 py-3 align-top"><span className="dev-meta-chip">{feature.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
