/**
 * Creates two demo businesses (a retail shop and a restaurant) with sample products.
 *   npm run seed                       (API must be running)
 *   API_URL=http://localhost:3000/api npx tsx scripts/seed.ts
 */
const API = process.env.API_URL ?? 'http://localhost:3000/api';

async function call(method: string, path: string, body?: unknown, token?: string) {
  const res = await fetch(API + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

async function signIn(reg: Record<string, unknown>) {
  const r = await call('POST', '/auth/register', reg);
  if (r.status === 201) return r.data.accessToken as string;
  const l = await call('POST', '/auth/login', { email: reg.email, password: reg.password });
  if (l.status !== 201) throw new Error(`Cannot sign in ${reg.email}: ${JSON.stringify(l.data)}`);
  return l.data.accessToken as string;
}

const demos = [
  {
    reg: { businessName: 'Demo Mart', domainType: 'retail', ownerName: 'Demo Owner', email: 'retail@demo.test', password: 'demo12345', taxRegNo: '1234567-8', address: 'Main Boulevard, Lahore' },
    tax: { gstPercent: 18, reducedGstPercent: 5, serviceChargePercent: 0, otherCharges: [] },
    products: [
      { name: 'Wireless mouse', sku: 'MOU-001', category: 'Electronics', price: 1800, stockQty: 25, attributes: { warrantyMonths: 12 } },
      { name: 'USB-C cable', sku: 'CAB-001', category: 'Electronics', price: 600, stockQty: 80 },
      { name: 'Notebook A5', sku: 'NOT-001', category: 'Stationery', price: 220, stockQty: 120 },
      { name: 'Green tea 250g', sku: 'TEA-001', category: 'Grocery', price: 450, stockQty: 40, taxClass: 'reduced', unit: 'pack' },
      { name: 'Basmati rice 5kg', sku: 'RIC-005', category: 'Grocery', price: 1650, stockQty: 30, taxClass: 'exempt', unit: 'bag' },
    ],
  },
  {
    reg: { businessName: 'Demo Bistro', domainType: 'restaurant', ownerName: 'Demo Chef', email: 'restaurant@demo.test', password: 'demo12345', taxRegNo: '7654321-0', address: 'Food Street, Lahore' },
    tax: { gstPercent: 16, reducedGstPercent: 5, serviceChargePercent: 5, otherCharges: [{ label: 'Packaging', type: 'flat', value: 20 }] },
    products: [
      { name: 'Chicken karahi (full)', category: 'Mains', price: 2200, trackStock: false, unit: 'plate', attributes: { spiceLevel: 'medium', prepMinutes: 25 } },
      { name: 'Garlic naan', category: 'Bread', price: 90, trackStock: false, unit: 'pcs' },
      { name: 'Mint margarita', category: 'Drinks', price: 350, trackStock: false, unit: 'glass' },
      { name: 'Bottled water', category: 'Drinks', price: 100, stockQty: 60 },
    ],
  },
];

(async () => {
  for (const d of demos) {
    const token = await signIn(d.reg);
    await call('PATCH', '/tenant/me', { taxProfile: d.tax }, token);
    const existing = await call('GET', '/products?limit=1', undefined, token);
    if (existing.data?.total > 0) { console.log(`${d.reg.email}: products already seeded`); continue; }
    const r = await call('POST', '/products/bulk', { products: d.products }, token);
    console.log(`${d.reg.email} / ${d.reg.password}  ->`, r.status === 201 ? `${r.data.created} products created` : JSON.stringify(r.data));
  }
})().catch((e) => { console.error(e.message); process.exit(1); });
