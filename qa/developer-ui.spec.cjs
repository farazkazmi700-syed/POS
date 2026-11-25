// Isolated UI fixtures: no request reaches a real developer API.
const path = require('node:path');
const { test, expect } = require(require.resolve('@playwright/test', { paths: [path.dirname(process.argv[1])] }));
const sections = { overview: 'Developer Dashboard', businesses: 'Business Tenants', plans: 'Subscription Plans', packages: 'Account Packages', 'module-rights': 'Module Rights Control', modules: 'Module Entitlements', clients: 'Client Accounts', backup: 'Backup & Snapshot', help: 'Help & Playbook', 'create-business': 'Provision Tenant', audit: 'Audit & Telemetry', settings: 'Console Settings' };
const labels = ['Overview', 'Businesses', 'Plans', 'Packages', 'Module Rights', 'Modules', 'Clients', 'Backup', 'Help', 'Provision', 'Audit Log', 'Settings'];
const businesses = Array.from({ length: 14 }, (_, i) => ({ businessId: `business-${i}`, _id: `business-${i}`, name: `Business ${String(i + 1).padStart(2, '0')}`, status: i === 13 ? 'suspended' : 'active', domainType: 'retail', currency: 'PKR', featureFlags: { pos: true }, subscriptionPlanId: null }));
const user = { _id: 'developer-demo', name: 'Demo Developer', email: 'demo@example.test', role: 'owner', isDeveloper: true, isActive: true, moduleRights: [] };
async function setup(page, theme) {
  await page.addInitScript(({ user, theme }) => {
    localStorage.setItem('pos-theme', theme);
    localStorage.setItem('pos-auth', JSON.stringify({ state: { user, accessToken: 'demo', refreshToken: 'demo' }, version: 0 }));
  }, { user, theme });
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url()).pathname;
    if (!url.startsWith('/api/')) return route.continue();
    let data = [];
    if (url.endsWith('/auth/me')) data = user;
    else if (url.endsWith('/overview')) data = { businesses: 14, activeBusinesses: 13, suspendedBusinesses: 1, plans: 1, auditEvents: 1 };
    else if (url.endsWith('/businesses')) data = businesses;
    else if (url.endsWith('/plans')) data = [{ _id: 'plan-1', name: 'Standard', description: 'Business essentials', price: 2500, billingInterval: 'monthly', features: { pos: true }, isActive: true }];
    else if (url.endsWith('/role-packages')) data = {};
    else if (url.endsWith('/modules')) data = [
      { key: 'pos', moduleId: 'MOD-POS', label: 'POS', installed: true, executable: true, isActive: true, releaseState: 'active', builtin: true },
      { key: 'reports', moduleId: 'MOD-REPORTS', label: 'Reports', installed: true, executable: true, isActive: true, releaseState: 'active', builtin: true },
      { key: 'help', moduleId: 'MOD-HELP', label: 'Help', installed: true, executable: true, isActive: true, releaseState: 'active', builtin: true, universal: true },
    ];
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
      const account = page.getByRole('group', { name: 'Developer account' });
      await expect(account).toHaveCount(1);
      await expect(account).toContainText(user.name);
      await expect(account).toContainText(user.email);
      const signOut = account.getByRole('button', { name: 'Sign out' });
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
  await expect(picker).toHaveValue('#2463eb');
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
