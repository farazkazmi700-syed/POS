// Isolated UI fixtures: no request reaches a real developer API.
const path = require('node:path');
const { test, expect } = require(require.resolve('@playwright/test', { paths: [path.dirname(process.argv[1])] }));
const sections = { overview: 'Developer Dashboard', businesses: 'Business Tenants', trash: 'Tenant Trash', plans: 'Subscription Plans', packages: 'Account Packages', 'module-rights': 'Module Rights Control', modules: 'Module Entitlements', clients: 'Client Accounts', backup: 'Backup & Snapshot', 'data-sync': 'Data Sync', help: 'Support & Playbook', 'create-business': 'Provision Tenant', audit: 'Audit & Telemetry', settings: 'Console Settings' };
const labels = ['Overview', 'Businesses', 'Trash', 'Plans', 'Packages', 'Module Rights', 'Modules', 'Clients', 'Backup', 'Data Sync', 'Support', 'Provision', 'Audit Log', 'Settings'];
const businesses = Array.from({ length: 14 }, (_, i) => ({ businessId: `business-${i}`, _id: `business-${i}`, name: `Business ${String(i + 1).padStart(2, '0')}`, status: i === 13 ? 'suspended' : 'active', domainType: 'retail', currency: 'PKR', featureFlags: { pos: true }, subscriptionPlanId: null }));
const user = { _id: 'developer-demo', name: 'Demo Developer', email: 'demo@example.test', role: 'owner', isDeveloper: true, isActive: true, moduleRights: [] };
async function setup(page, theme, developer = user) {
  await page.addInitScript(({ user, theme }) => {
    localStorage.setItem('pos-theme', theme);
    localStorage.setItem('pos-auth', JSON.stringify({ state: { user, accessToken: 'demo', refreshToken: 'demo' }, version: 0 }));
  }, { user: developer, theme });
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url()).pathname;
    if (!url.startsWith('/api/')) return route.continue();
    let data = [];
    if (url.endsWith('/auth/me')) data = developer;
    else if (url.endsWith('/overview')) data = { businesses: 14, activeBusinesses: 13, suspendedBusinesses: 1, plans: 1, auditEvents: 1 };
    else if (url.endsWith('/businesses')) data = businesses;
    else if (url.endsWith('/businesses/trash')) data = [];
    else if (url.endsWith('/plans')) data = [{ _id: 'plan-1', name: 'Standard', description: 'Business essentials', price: 2500, billingInterval: 'monthly', features: { pos: true }, isActive: true }];
    else if (url.endsWith('/role-packages')) data = {};
    else if (url.endsWith('/modules')) data = [
      { key: 'pos', moduleId: 'MOD-POS', label: 'POS', installed: true, executable: true, isActive: true, releaseState: 'active', builtin: true },
      { key: 'reports', moduleId: 'MOD-REPORTS', label: 'Reports', installed: true, executable: true, isActive: true, releaseState: 'active', builtin: true },
      { key: 'help', moduleId: 'MOD-HELP', label: 'Help', installed: true, executable: true, isActive: true, releaseState: 'active', builtin: true, universal: true },
    ];
    else if (url.endsWith('/developer/data-sync')) data = { moduleEnabled: true, configuredBusinessId: null };
    else if (url.endsWith('/backup/options')) data = { mode: 'local', email: false, drive: false };
    else if (url.endsWith('/backup')) data = { meta: { version: 1, generatedAt: '2026-11-15T00:00:00Z', generator: 'Demo', counts: { businesses: 14, activeBusinesses: 13, accounts: 0, plans: 1, customModules: 0, auditEvents: 1 } }, tenants: [], accounts: [], plans: [], customModules: [], auditTail: [] };
    else if (url.endsWith('/audit')) data = [{ _id: 'audit-1', action: 'business.created', actorEmail: user.email, entityType: 'business', entityId: 'business-0', details: { name: 'Business 01' }, createdAt: '2026-11-15T00:00:00Z' }];
    await route.fulfill({ json: data });
  });
  await page.goto('/developer');
}
async function section(page, key, mobile) {
  if (mobile) await page.getByLabel('Workspace section').selectOption(key);
  else await page.getByRole('navigation', { name: 'Developer navigation', exact: true }).getByRole('button', { name: labels[Object.keys(sections).indexOf(key)], exact: true }).click();
  await expect(page.getByRole('heading', { name: sections[key], exact: true })).toBeVisible();
}
for (const viewport of [{ width: 1280, height: 900 }, { width: 320, height: 700 }]) {
  test(`developer profile works at ${viewport.width}px with pointer and keyboard`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await setup(page, viewport.width === 320 ? 'dark' : 'light');
    const trigger = page.getByRole('button', { name: 'Platform Developer' });
    const menu = page.getByRole('menu', { name: 'Developer account' });
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(menu).toHaveCount(0);

    await trigger.click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(menu).toBeVisible();
    await expect(menu.getByText('Developer Access', { exact: true })).toBeVisible();
    const email = menu.getByRole('menuitem', { name: 'developer@pos.local' });
    await expect(email).toHaveAttribute('href', 'mailto:developer@pos.local');
    await expect(email).toBeFocused();
    const box = await menu.boundingBox();
    expect(box.width).toBe(280);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    await page.getByRole('heading', { name: 'Developer Dashboard', exact: true }).click();
    await expect(menu).toHaveCount(0);

    await trigger.focus();
    await trigger.press('ArrowUp');
    await expect(menu.getByRole('menuitem', { name: 'Sign Out' })).toBeFocused();
    await page.keyboard.press('Home');
    await expect(email).toBeFocused();
    await page.keyboard.press('ArrowDown');
    const security = menu.getByRole('menuitem', { name: 'Account Security' });
    await expect(security).toBeFocused();
    await expect(security).toHaveAttribute('href', '/recover?purpose=password&source=developer');
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await trigger.press('Enter');
    await page.keyboard.press('Tab');
    await expect(menu).toHaveCount(0);

    await trigger.click();
    await security.click();
    await expect(page).toHaveURL(/\/recover\?purpose=password&source=developer$/);
  });
}

test('Developer must confirm tenant deletion and can restore it from Trash', async ({ page }) => {
  await setup(page, 'light');
  let deleted = false;
  let mutations = 0;
  const target = businesses[0];
  await page.route('**/api/developer/businesses', route => route.fulfill({ json: deleted ? [] : [target] }));
  await page.route('**/api/developer/businesses/trash', route => route.fulfill({ json: deleted ? [{
    businessId: target.businessId, name: target.name, trashedAt: new Date().toISOString(),
    purgeAt: new Date(Date.now() + 30 * 86400000).toISOString(),
  }] : [] }));
  await page.route('**/api/developer/businesses/business-0/trash', route => {
    expect(route.request().postDataJSON()).toEqual({ name: target.name, confirmed: true });
    deleted = true;
    mutations++;
    return route.fulfill({ json: { businessId: target.businessId } });
  });
  await page.route('**/api/developer/businesses/business-0/restore', route => {
    deleted = false;
    mutations++;
    return route.fulfill({ json: { businessId: target.businessId, status: 'active' } });
  });
  await page.reload();
  await section(page, 'businesses', false);
  await page.getByRole('button', { name: 'Delete Business 01', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Delete tenant' });
  const submit = dialog.getByRole('button', { name: 'Move to Trash' });
  await expect(submit).toBeDisabled();
  await dialog.getByLabel('Type the exact business name').fill('Wrong name');
  await dialog.getByRole('checkbox').check();
  await expect(submit).toBeDisabled();
  await dialog.getByLabel('Type the exact business name').fill(target.name);
  expect(mutations).toBe(0);
  await submit.click();
  await expect(page.getByRole('button', { name: 'Delete Business 01' })).toHaveCount(0);
  await section(page, 'trash', false);
  await expect(page.getByRole('heading', { name: target.name })).toBeVisible();
  await expect(page.getByText(/Permanent deletion eligible from/)).toBeVisible();
  await page.getByRole('button', { name: 'Restore Business 01' }).click();
  await expect(page.getByText('Trash is empty.')).toBeVisible();
  expect(mutations).toBe(2);
});

test('Developer can sign out from the sidebar tools', async ({ page }) => {
  await setup(page, 'light');
  await page.locator('.dev-sidebar-tools').getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Platform Developer' })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('pos-auth')).state.user)).toBeNull();
});

test('working modules are listed as installed in Module Entitlements', async ({ page }) => {
  await setup(page, 'light');
  await page.route('**/api/developer/modules', route => route.fulfill({ json: [
    { key: 'stock-replenishment', moduleId: 'MOD-STOCK-REPLENISHMENT', label: 'Stock Replenishment', installed: true, executable: true, isActive: true, releaseState: 'active', builtin: true },
    { key: 'collections-forecast', moduleId: 'MOD-COLLECTIONS-FORECAST', label: 'Installment Collections Forecast', installed: true, executable: true, isActive: true, releaseState: 'active', builtin: true },
  ] }));
  await section(page, 'modules', false);
  await expect(page.getByRole('row', { name: /MOD-STOCK-REPLENISHMENT/ })).toContainText('Installed');
  await expect(page.getByRole('row', { name: /MOD-COLLECTIONS-FORECAST/ })).toContainText('Installed');
  let stockEnabled = false;
  await page.route('**/api/developer/features', (route) => route.fulfill({ json: [
    { key: 'stock-replenishment', label: 'Stock Replenishment' },
    { key: 'collections-forecast', label: 'Installment Collections Forecast' },
  ] }));
  await page.route('**/api/developer/businesses', (route) => route.fulfill({ json: [
    { ...businesses[0], featureFlags: { 'stock-replenishment': stockEnabled } },
  ] }));
  await page.route('**/api/developer/businesses/business-0/features', (route) => {
    stockEnabled = route.request().postDataJSON().featureFlags['stock-replenishment'];
    return route.fulfill({ json: { businessId: 'business-0', featureFlags: { 'stock-replenishment': stockEnabled } } });
  });
  await page.reload();
  await section(page, 'businesses', false);
  const entitlements = page.getByRole('group', { name: 'Feature entitlements for Business 01' });
  const stock = entitlements.getByRole('switch', { name: 'Stock Replenishment' });
  await expect(stock).toHaveAttribute('aria-checked', 'false');
  await expect(entitlements.getByRole('switch', { name: 'Installment Collections Forecast' })).toHaveAttribute('aria-checked', 'false');
  await stock.click();
  await expect(stock).toHaveAttribute('aria-checked', 'true');
});

test('business owner can use replenishment search and the forecast when enabled', async ({ page }) => {
  const owner = { _id: 'owner-1', tenantId: 'tenant-1', name: 'Owner', email: 'owner@example.test', role: 'owner', isActive: true };
  await page.addInitScript((account) => {
    localStorage.setItem('pos-auth', JSON.stringify({ state: { user: account, accessToken: 'demo', refreshToken: 'demo' }, version: 0 }));
  }, owner);
  let enabled = false;
  let stockRequests = 0;
  await page.route('**/api/**', route => {
    const url = new URL(route.request().url());
    if (!url.pathname.startsWith('/api/')) return route.continue();
    if (url.pathname.endsWith('/auth/me')) return route.fulfill({ json: owner });
    if (url.pathname.endsWith('/tenant/me')) return route.fulfill({ json: {
      _id: owner.tenantId, name: 'Test Business', currency: 'PKR',
      featureFlags: enabled ? { 'stock-replenishment': true, 'collections-forecast': true } : {},
    } });
    if (url.pathname.endsWith('/products/replenishment')) {
      stockRequests++;
      const matches = !url.searchParams.get('q') || url.searchParams.get('q') === 'P-101';
      return route.fulfill({ json: {
        data: matches ? [{ _id: 'p1', name: 'Electric bike', sku: 'P-101', stockQty: 0, lowStockThreshold: 4, unit: 'pcs' }] : [],
        total: matches ? 1 : 0, page: 1, limit: 30,
      } });
    }
    if (url.pathname.endsWith('/installments/collections-forecast')) return route.fulfill({ json: {
      asOf: '2026-11-26', overdue: { amount: 1500.25, count: 2 },
      periods: [{ from: '2026-11-26', to: '2026-12-25', amount: 3000, count: 4 }],
    } });
    return route.fulfill({ json: { data: [] } });
  });

  await page.goto('/stock-replenishment');
  await expect(page.getByRole('heading', { name: 'Access restricted' })).toBeVisible();
  expect(stockRequests).toBe(0);
  enabled = true;
  await page.reload();
  await expect(page.getByRole('row', { name: /Electric bike/ })).toContainText('Out of stock');
  await page.getByRole('searchbox', { name: 'Search products' }).fill('missing');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByText('No matching products need replenishment.')).toBeVisible();
  await page.goto('/collections-forecast');
  await expect(page.getByRole('row', { name: /Overdue/ })).toContainText('PKR 1,500.25');
  await expect(page.getByRole('cell', { name: 'PKR 3,000.00' })).toBeVisible();
});

test('industry packages seed the selected tenant domain and role accounts', async ({ page }) => {
  await setup(page, 'light');
  await section(page, 'packages', false);
  for (const label of [
    'Motorcycle Dealers', 'Electric Bike Dealers', 'Electronics Shops', 'Mobile Shops', 'Furniture Stores',
    'Home Appliances', 'Solar Equipment', 'Car Dealerships', 'Agricultural Machinery',
  ]) {
    await expect(page.getByRole('heading', { name: label, exact: true })).toBeVisible();
  }
  const solar = page.locator('.dev-plan-card').filter({ has: page.getByRole('heading', { name: 'Solar Equipment', exact: true }) });
  await solar.getByRole('button', { name: 'Provision with' }).click();
  await expect(page.getByLabel('Domain Type')).toHaveValue('solar-equipment');
  await expect(page.getByText('Recommended for Solar Equipment:')).toBeVisible();
  await expect(page.getByText('Solar Sales Advisor', { exact: false })).toBeVisible();
});

test('installment catalogue lists all ten features with priorities and availability', async ({ page }) => {
  await setup(page, 'light');
  await page.route('**/api/developer/modules', route => route.fulfill({ json: [
    { key: 'installments', moduleId: 'MOD-INSTALLMENTS', label: 'Installments', installed: true, executable: true, isActive: true, releaseState: 'active', builtin: true },
  ] }));
  await section(page, 'modules', false);
  const features = page.getByRole('region', { name: 'Installment features' });
  await expect(features.getByRole('rowheader')).toHaveCount(10);
  await expect(features.getByRole('cell', { name: 'Critical', exact: true })).toHaveCount(4);
  await expect(features.getByRole('cell', { name: 'High', exact: true })).toHaveCount(6);
  await page.getByRole('searchbox', { name: 'Search modules' }).fill('whatsapp');
  await expect(features.getByRole('rowheader')).toHaveCount(1);
  await expect(features.getByRole('row', { name: /WhatsApp payment reminders/ })).toContainText('Planned');
});

test('developer can grant Data Sync entitlement while V1 uploads stay disabled', async ({ page }) => {
  await setup(page, 'light');
  let enabled = false;
  await page.route('**/api/developer/businesses', route => route.fulfill({ json: [
    { ...businesses[0], deploymentMode: 'hybrid', featureFlags: { 'data-sync': enabled } },
    { ...businesses[1], deploymentMode: 'offline', featureFlags: { 'data-sync': true } },
  ] }));
  await page.route('**/api/developer/businesses/business-0/features', route => {
    enabled = route.request().postDataJSON().featureFlags['data-sync'];
    return route.fulfill({ json: { businessId: 'business-0', featureFlags: { 'data-sync': enabled } } });
  });
  await page.route('**/api/developer/data-sync', route => route.fulfill({
    json: { moduleEnabled: true, configuredBusinessId: null },
  }));
  await section(page, 'data-sync', false);
  const business = page.getByRole('row', { name: /Business 01/ });
  await expect(business).toContainText('Entitlement off');
  await expect(page.getByRole('row', { name: /Business 02/ })).toContainText('Requires Cloud or Hybrid');
  await page.getByRole('button', { name: 'Manage Business 01' }).click();
  await page.getByRole('switch', { name: 'Data Sync entitlement' }).click();
  await expect(page.getByRole('switch', { name: 'Data Sync entitlement' })).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Escape');
  await expect(business).toContainText('Cloud sync disabled in V1');
});

test('module catalogue searches module and submodule names', async ({ page }) => {
  await setup(page, 'light');
  await page.route('**/api/developer/modules', route => route.fulfill({ json: [
    { key: 'pos', moduleId: 'MOD-POS', label: 'POS', installed: true, executable: true, isActive: true, releaseState: 'active', builtin: true, submodules: [{ key: 'pos.checkout', label: 'Checkout' }] },
    { key: 'data-sync', moduleId: 'MOD-DATA-SYNC', label: 'Data Sync', installed: true, executable: true, isActive: true, releaseState: 'active', builtin: true },
    { key: 'custom', moduleId: 'MOD-CUSTOM', label: 'Custom Module', installed: false, isActive: false, releaseState: 'coming-soon' },
  ] }));
  await section(page, 'modules', false);
  await expect(page.getByRole('status').filter({ hasText: '3 of 3 modules' })).toBeVisible();
  const search = page.getByRole('searchbox', { name: 'Search modules' });
  await search.fill('checkout');
  await expect(page.getByRole('row', { name: /MOD-POS/ })).toContainText('Checkout');
  await expect(page.getByRole('row', { name: /MOD-DATA-SYNC/ })).toHaveCount(0);
  await search.fill('no-match');
  await expect(page.getByText('No matching modules.')).toBeVisible();
});

test('business owner can reach local backup but has no V1 cloud upload action', async ({ page }) => {
  const owner = { _id: 'owner-1', tenantId: 'tenant-1', name: 'Owner', email: 'owner@example.test', role: 'owner', isActive: true };
  await page.addInitScript((account) => {
    localStorage.setItem('pos-auth', JSON.stringify({ state: { user: account, accessToken: 'demo', refreshToken: 'demo' }, version: 0 }));
  }, owner);
  let uploadAttempts = 0;
  await page.route('**/api/**', route => {
    const url = new URL(route.request().url()).pathname;
    if (!url.startsWith('/api/')) return route.continue();
    if (url.endsWith('/auth/me')) return route.fulfill({ json: owner });
    if (url.endsWith('/tenant/me')) return route.fulfill({ json: { _id: owner.tenantId, name: 'Test Business', featureFlags: { 'data-sync': true } } });
    if (url.endsWith('/support/backup/sync') && route.request().method() === 'POST') {
      uploadAttempts += 1;
      return route.fulfill({ status: 503, json: { message: 'Cloud synchronization is disabled in V1.' } });
    }
    if (url.endsWith('/support')) return route.fulfill({ json: {
      backup: { canExport: true, included: [], excluded: [], sync: { entitled: true, configured: false, lastSyncedAt: null } },
      entitlements: { backup: true },
    } });
    return route.fulfill({ json: { data: [] } });
  });
  await page.goto('/backup');
  await page.getByRole('link', { name: 'Open Data Sync' }).click();
  await expect(page.getByRole('heading', { name: 'Data Sync', exact: true })).toBeVisible();
  await expect(page.getByText(/Cloud synchronization is disabled in V1/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Business Backup' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sync to cloud' })).toHaveCount(0);
  await page.reload();
  await expect(page.getByText(/Cloud synchronization is disabled in V1/)).toBeVisible();
  expect(uploadAttempts).toBe(0);
});

test('module catalogue failure offers a retry and recovers', async ({ page }) => {
  await setup(page, 'light');
  let fail = true;
  await page.route('**/api/developer/modules', route => fail
    ? route.fulfill({ status: 503, json: { message: 'Unavailable' } })
    : route.fulfill({ json: [] }));
  await section(page, 'module-rights', false);
  const retry = page.getByRole('button', { name: 'Retry section' });
  await expect(retry).toBeVisible({ timeout: 20000 });
  fail = false;
  await retry.click();
  await expect(retry).toHaveCount(0);
});
for (const mode of [{ width: 1440, height: 1000, theme: 'light' }, { width: 1024, height: 768, theme: 'dark' }, { width: 768, height: 1024, theme: 'light' }, { width: 390, height: 844, theme: 'dark' }]) {
  test.describe(`${mode.width}-${mode.theme}`, () => {
    test.use({ viewport: { width: mode.width, height: mode.height }, colorScheme: mode.theme });
    test('all sections, search, pagination, dialog focus and audit details', async ({ page }) => {
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await setup(page, mode.theme);
      const mobile = mode.width < 840;
      if (mobile) {
        await expect(page.locator('#developer-section optgroup')).toHaveCount(5);
      } else {
        const navigation = page.getByRole('navigation', { name: 'Developer navigation', exact: true });
        for (const group of ['Workspace', 'Business Management', 'Platform Access', 'Operations', 'System']) {
          await expect(navigation.getByRole('heading', { name: group, exact: true })).toBeVisible();
        }
        await navigation.getByRole('textbox', { name: 'Filter navigation' }).fill('module');
        await expect(navigation.getByRole('button', { name: 'Modules', exact: true })).toBeVisible();
        await expect(navigation.getByRole('button', { name: 'Module Rights', exact: true })).toBeVisible();
        await expect(navigation.getByRole('button', { name: 'Businesses', exact: true })).toHaveCount(0);
        await navigation.getByRole('button', { name: 'Clear navigation filter' }).click();
      }
      for (const key of Object.keys(sections)) {
        await section(page, key, mobile);
        if (key === 'module-rights') {
          const grants = page.getByRole('row').filter({ hasText: 'Business 01' });
          await expect(grants).toContainText('MOD-POS');
          await expect(grants).toContainText('MOD-HELP');
          await expect(grants).not.toContainText('MOD-REPORTS');
        }
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);
        if (['overview', 'businesses', 'plans', 'create-business'].includes(key)) await page.screenshot({ path: `qa/artifacts/developer-${mode.width}-${key}.png`, fullPage: true });
      }
      await section(page, 'businesses', mobile);
      await page.getByRole('button', { name: 'Next page', exact: true }).click();
      await expect(page.getByRole('article')).toHaveCount(2);
      await page.getByLabel('Search businesses', { exact: true }).fill('Business 01');
      await expect(page.getByRole('article')).toHaveCount(1);
      await page.getByRole('button', { name: 'Clear business search' }).click();
      await page.getByLabel('Sort by').selectOption('name-desc');
      await expect(page.getByRole('article').first()).toContainText('Business 14');
      await page.getByRole('button', { name: 'suspended', exact: true }).click();
      await expect(page.getByRole('article')).toHaveCount(1);
      await expect(page.getByRole('button', { name: 'suspended', exact: true })).toHaveAttribute('aria-pressed', 'true');
      await section(page, 'plans', mobile);
      const newPlan = page.getByRole('button', { name: 'New Plan', exact: true });
      await newPlan.click();
      await expect(page.getByRole('dialog', { name: /plan/i })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(newPlan).toBeFocused();
      await section(page, 'audit', mobile);
      await page.getByText('View details', { exact: true }).click();
      await expect(page.locator('.dev-audit-details pre')).toContainText('Business 01');
      if (!mobile) {
        await page.getByRole('button', { name: 'Collapse sidebar' }).click();
        await expect(page.getByRole('button', { name: 'Expand sidebar' })).toHaveAttribute('aria-expanded', 'false');
        await section(page, 'overview', false);
        await page.screenshot({ path: `qa/artifacts/developer-${mode.width}-collapsed.png`, fullPage: true });
      }
      await page.getByRole('button', { name: 'Platform Developer' }).click();
      const account = page.getByRole('menu', { name: 'Developer account' });
      await expect(account).toHaveCount(1);
      const signOut = account.getByRole('menuitem', { name: 'Sign Out' });
      await expect(signOut).toBeInViewport();
      await signOut.click();
      await expect(account).toHaveCount(0);
      await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('pos-auth')).state.user)).toBeNull();
      expect(errors).toEqual([]);
    });
  });
}

test('dashboard review, section history and keyboard record search', async ({ page }) => {
  await setup(page, 'light');
  await page.getByRole('button', { name: /Suspended businesses/ }).click();
  await expect(page.getByRole('article')).toHaveCount(1);
  await expect(page.getByRole('article')).toContainText('Business 14');
  await expect(page).toHaveURL(/section=businesses/);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Business Tenants' })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Developer Dashboard' })).toBeVisible();
  const search = page.getByRole('combobox', { name: 'Search businesses and plans' });
  await search.fill('Business 04');
  await search.press('ArrowDown');
  await search.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Business 04' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 390, height: 844 });
  await search.fill('Standard');
  await page.getByRole('listbox', { name: 'Search results' }).getByRole('option', { name: /Standard/ }).click();
  await expect(page.getByRole('dialog')).toHaveAccessibleName('Edit Subscription Plan');
});

test('developer accent previews, persists and resets', async ({ page }) => {
  await setup(page, 'dark');
  await section(page, 'settings', false);
  const violet = page.getByRole('button', { name: 'Violet', exact: true });
  await violet.click();
  await expect(violet).toHaveAttribute('aria-pressed', 'true');
  const picker = page.getByLabel('Custom color');
  await picker.fill('#ffe100');
  await page.reload();
  await expect(picker).toHaveValue('#ffe100');
  await section(page, 'overview', false);
  const primary = page.getByRole('button', { name: 'Provision Tenant', exact: true });
  await expect(primary).toHaveCSS('background-color', 'rgb(255, 225, 0)');
  await expect(primary).toHaveCSS('color', 'rgb(0, 0, 0)');
  await section(page, 'settings', false);
  await violet.click();
  await page.screenshot({ path: 'qa/artifacts/developer-theme-settings.png', fullPage: true });
  await page.getByRole('button', { name: 'Reset to default' }).click();
  await expect(picker).toHaveValue('#0f172a');
});

test('developer theme presets preview, save and stay scoped to the developer account', async ({ page, context }) => {
  await setup(page, 'light');
  await section(page, 'settings', false);
  const themes = page.getByRole('group', { name: 'Theme', exact: true });
  const consoleView = page.locator('.dev-workspace');
  await expect(themes.getByRole('radio')).toHaveCount(10);

  for (const [name, preset] of [
    ['Glassmorphism', 'glassmorphism'], ['Skeuomorphism', 'skeuomorphism'],
    ['Neo-Brutalism', 'neo-brutalism'], ['Claymorphism', 'claymorphism'], ['Liquid Glass', 'liquid-glass'],
  ]) {
    await themes.getByRole('radio', { name, exact: true }).check();
    await expect(consoleView).toHaveAttribute('data-appearance', preset);
  }
  await expect(page.locator('html')).not.toHaveAttribute('data-appearance', /.+/);
  await themes.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(themes.getByRole('radio', { name: 'Minimalism' })).toBeChecked();

  await themes.getByRole('radio', { name: 'Liquid Glass' }).check();
  await expect(consoleView).toHaveCSS('--appearance-radius', '1.65rem');
  await page.emulateMedia({ colorScheme: 'dark' });
  await themes.getByLabel('Mode', { exact: true }).selectOption('system');
  await expect(consoleView).toHaveAttribute('data-theme', 'dark');
  await themes.getByRole('button', { name: 'Save appearance' }).click();
  await expect(themes.getByRole('status')).toHaveText('Developer appearance saved.');
  await page.reload();
  await expect(themes.getByRole('radio', { name: 'Liquid Glass' })).toBeChecked();
  await expect(themes.getByLabel('Mode', { exact: true })).toHaveValue('system');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('pos-theme'))).toBe('light');

  const other = await context.newPage();
  await setup(other, 'light', { ...user, _id: 'developer-second' });
  await expect(other.locator('.dev-workspace')).toHaveAttribute('data-appearance', 'minimal');
  await other.close();
  await themes.getByRole('button', { name: 'Restore theme defaults' }).click();
  await themes.getByRole('button', { name: 'Save appearance' }).click();
  await expect(consoleView).toHaveAttribute('data-appearance', 'minimal');
});


test('developer can open business entitlements and request a client password reset', async ({ page }) => {
  await setup(page, 'light');
  const business = { id: 'business-0', name: 'Business 01', domainType: 'retail', status: 'active' };
  await page.route('**/api/developer/features', route => route.fulfill({ json: [{ key: 'data-sync', label: 'Data Sync' }] }));
  await page.route('**/api/developer/clients', route => route.fulfill({ json: [{
    _id: 'client-1', name: 'Fixture Owner', email: 'owner@example.test', role: 'owner',
    emailVerified: true, isActive: true, business,
  }] }));
  let sent = 0;
  await page.route('**/api/developer/clients/business-0/client-1/password-reset', route => {
    sent++;
    return route.fulfill({ status: 201, json: { message: 'Reset link sent.' } });
  });
  await page.goto('/developer?section=clients');
  await page.getByRole('button', { name: 'Module Entitlements', exact: true }).click();
  await expect(page.getByRole('dialog').getByText('Data Sync', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Reset password for Fixture Owner' }).click();
  const dialog = page.getByRole('dialog', { name: 'Reset client password' });
  await expect(dialog).toBeVisible();
  expect(sent).toBe(0);
  await dialog.getByRole('button', { name: 'Send reset link' }).click();
  await expect(dialog.getByRole('status')).toHaveText('Reset link sent.');
  expect(sent).toBe(1);
});

test('Business Tenants card actions fit inside card bounds and Dashboard appears in Module Entitlements', async ({ page }) => {
  await setup(page, 'light');
  await section(page, 'businesses', false);
  const firstCard = page.getByRole('article').first();
  const cardBox = await firstCard.boundingBox();
  for (const label of ['Details', 'Accounts', 'Suspend Tenant', 'Delete Business 01']) {
    const btnBox = await firstCard.getByRole('button', { name: label, exact: true }).boundingBox();
    expect(btnBox.x).toBeGreaterThanOrEqual(cardBox.x);
    expect(btnBox.x + btnBox.width).toBeLessThanOrEqual(cardBox.x + cardBox.width + 1);
  }
  const entitlements = firstCard.getByRole('group', { name: 'Feature entitlements for Business 01' });
  await expect(entitlements.getByRole('switch', { name: 'Dashboard' })).toHaveAttribute('aria-checked', 'true');
  await page.route('**/api/developer/modules', route => route.fulfill({ json: [
    { key: 'dashboard', moduleId: 'MOD-DASHBOARD', label: 'Dashboard', installed: true, executable: true, isActive: true, releaseState: 'active', builtin: true },
  ] }));
  await section(page, 'modules', false);
  await expect(page.getByRole('row', { name: /MOD-DASHBOARD/ })).toContainText('Installed');
});
