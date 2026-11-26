const { test, expect } = require('@playwright/test');

const tenant = { _id: '1'.repeat(24), name: 'Appearance Test', domainType: 'retail', currency: 'PKR', invoicePrefix: 'INV',
  taxProfile: { gstPercent: 0, reducedGstPercent: 0, serviceChargePercent: 0, otherCharges: [] },
  featureFlags: { pos: true, inventory: true, reports: true, customers: true, installments: true, settings: true }, navigationVisibility: {} };
const defaults = { preset: 'minimal', mode: 'system', sidebar: 'preset', dashboardDensity: 'comfortable', tableDensity: 'comfortable', primary: null, secondary: null, logo: '' };
const emptyPage = { data: [], total: 0, page: 1, limit: 20 };
const summary = { revenue: 0, orders: 0, tax: 0, discounts: 0, averageOrder: 0, itemsSold: 0,
  from: '2026-11-20', to: '2026-11-26', daily: [{ date: '2026-11-26', revenue: 1, orders: 1 }], topProducts: [], paymentModes: [] };

async function workspace(page, initial, role = 'owner', business = tenant) {
  const user = { _id: '2'.repeat(24), tenantId: tenant._id, role, name: 'Test User', isActive: true,
    moduleRights: ['dashboard', 'pos', 'products', 'customers', 'orders', 'reports', 'installments', 'settings'] };
  let saved = initial;
  await page.addInitScript(user => {
    localStorage.setItem('pos-auth', JSON.stringify({ state: { user, accessToken: 'test', refreshToken: 'test' }, version: 0 }));
  }, user);
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') return route.abort();
    if (!url.pathname.startsWith('/api/')) return route.continue();
    let data = emptyPage;
    if (url.pathname === '/api/tenant/me/appearance') {
      if (route.request().method() === 'PATCH') saved = route.request().postDataJSON();
      data = saved;
    } else if (url.pathname === '/api/tenant/me') data = business;
    else if (url.pathname === '/api/auth/me') data = user;
    else if (url.pathname === '/api/branches' || url.pathname === '/api/auth/staff') data = [];
    else if (url.pathname === '/api/orders/stats/summary' || url.pathname === '/api/reports/sales') data = summary;
    return route.fulfill({ json: data });
  });
  return () => saved;
}

for (const preset of [
  'minimal', 'modern', 'enterprise', 'premium', 'compact',
  'glassmorphism', 'skeuomorphism', 'neo-brutalism', 'claymorphism', 'liquid-glass',
]) {
  for (const mode of ['light', 'dark']) {
    test(`appearance ${preset} ${mode} across the workspace`, async ({ page }) => {
      test.setTimeout(90_000);
      const pageErrors = [];
      page.on('pageerror', error => pageErrors.push(error.message));
      await page.setViewportSize(mode === 'dark' ? { width: 390, height: 844 } : { width: 1360, height: 900 });
      await workspace(page, { ...defaults, preset, mode }, mode === 'dark' ? 'admin' : 'owner');
      for (const path of ['/dashboard', '/pos', '/products', '/customers', '/orders', '/reports', '/installments', '/settings']) {
        await page.goto(path);
        await expect(page.locator('html')).toHaveAttribute('data-appearance', preset);
        await expect(page.locator('html')).toHaveAttribute('data-theme', mode);
        await expect(page.locator('h1:visible').first(), `Expected the ${path} workspace to render`).toBeVisible();
        const appearance = await page.evaluate(() => {
          const styles = getComputedStyle(document.documentElement);
          function luminance(hex) {
            const values = hex.trim().slice(1).match(/../g).map(value => parseInt(value, 16) / 255)
              .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
            return 0.2126 * values[0] + 0.7152 * values[1] + 0.0722 * values[2];
          }
          function contrast(left, right) {
            const a = luminance(styles.getPropertyValue(left));
            const b = luminance(styles.getPropertyValue(right));
            return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
          }
          return {
            primary: contrast('--appearance-primary', '--appearance-primary-text'),
            secondary: contrast('--appearance-secondary', '--appearance-secondary-text'),
            sidebar: contrast('--appearance-sidebar', '--appearance-sidebar-text'),
            text: contrast('--appearance-surface', '--appearance-text'),
            fits: document.documentElement.scrollWidth <= innerWidth + 2,
          };
        });
        expect(appearance.fits).toBe(true);
        for (const part of ['primary', 'secondary', 'sidebar', 'text']) expect(appearance[part]).toBeGreaterThanOrEqual(4.5);
      }
      await expect(page.locator('#appearance')).toHaveCount(mode === 'dark' ? 0 : 1);
      expect(pageErrors).toEqual([]);
    });
  }
}

test('appearance previews, cancels, saves, reloads, and restores defaults', async ({ page }) => {
  const saved = await workspace(page, defaults);
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/settings');
  const section = page.locator('#appearance');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await section.getByRole('radio', { name: 'Glassmorphism' }).check();
  await expect(page.locator('html')).toHaveAttribute('data-appearance', 'glassmorphism');
  expect(saved().preset).toBe('minimal');
  await section.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-appearance', 'minimal');
  await section.getByRole('radio', { name: 'Compact' }).check();
  await section.getByLabel('Mode', { exact: true }).selectOption('dark');
  await section.getByLabel('Primary', { exact: true }).fill('#ffffff');
  await expect.poll(() => page.locator('html').evaluate(root => root.style.getPropertyValue('--appearance-primary-text'))).toBe('#000000');
  await section.getByLabel('Business logo').setInputFiles({
    name: 'logo.png', mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jhF0AAAAASUVORK5CYII=', 'base64'),
  });
  await expect(section.getByAltText('Business logo preview')).toBeVisible();
  await section.getByRole('button', { name: 'Save appearance' }).click();
  await expect(section.getByRole('status')).toHaveText('Business appearance saved.');
  expect(saved()).toMatchObject({ preset: 'compact', mode: 'dark', primary: '#ffffff', tableDensity: 'compact', dashboardDensity: 'compact' });
  expect(saved().logo).toMatch(/^data:image\/png;base64,/);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-appearance', 'compact');
  await section.getByRole('radio', { name: 'Liquid Glass' }).check();
  await section.getByRole('button', { name: 'Save appearance' }).click();
  await expect(section.getByRole('status')).toHaveText('Business appearance saved.');
  expect(saved()).toMatchObject({ preset: 'liquid-glass', mode: 'dark' });
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-appearance', 'liquid-glass');
  await section.getByRole('button', { name: 'Restore defaults' }).click();
  await section.getByRole('button', { name: 'Save appearance' }).click();
  await expect(section.getByRole('status')).toHaveText('Business appearance saved.');
  expect(saved()).toEqual(defaults);
});

test('appearance applies to the cashier workspace without exposing owner controls', async ({ page }) => {
  await workspace(page, { ...defaults, preset: 'claymorphism', mode: 'dark' }, 'cashier');
  await page.goto('/pos');
  await expect(page.locator('html')).toHaveAttribute('data-appearance', 'claymorphism');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.goto('/settings');
  await expect(page.locator('#appearance')).toHaveCount(0);
});

test('business branding shows only the logo and name on desktop and mobile', async ({ page }) => {
  const business = { ...tenant, name: 'Test Business With a Longer Name', domainType: 'electronics', logoUrl: '/kazmion-logo.jpg' };
  await workspace(page, defaults, 'owner', business);
  await page.setViewportSize({ width: 1360, height: 900 });
  await page.goto('/dashboard');
  const desktop = page.locator('.app-brand');
  const logo = { name: business.name, exact: true };
  await expect(desktop.getByRole('img', logo)).toBeVisible();
  await expect(desktop).toHaveText(business.name);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Open menu', exact: true }).click();
  const drawer = page.locator('aside').filter({ has: page.getByRole('button', { name: 'Close menu' }) });
  await expect(drawer.getByRole('img', logo)).toBeVisible();
  await expect(drawer.getByText(business.name, { exact: true })).toBeVisible();
  await expect(drawer.getByText(/electronics/i)).toHaveCount(0);
});
