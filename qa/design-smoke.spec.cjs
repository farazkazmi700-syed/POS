// Uses isolated demo responses; never reads or changes real business records.
const path = require('node:path');
const { test, expect } = require(require.resolve('@playwright/test', { paths: [path.dirname(process.argv[1])] }));
const rights = ['dashboard', 'pos', 'products', 'customers', 'installments', 'orders', 'settings', 'barcode-generator', 'barcode-scanner'];
const features = { pos: true, inventory: true, reports: true, customers: true, installments: true, barcodes: true };
const tenant = { _id: '111111111111111111111111', name: 'Demo Retail', domainType: 'retail', currency: 'PKR', invoicePrefix: 'INV', taxProfile: { gstPercent: 18, reducedGstPercent: 5, serviceChargePercent: 0, otherCharges: [] }, featureFlags: features, navigationVisibility: {}, status: 'active' };
const overview = { businesses: 1, activeBusinesses: 1, suspendedBusinesses: 0, plans: 1, auditEvents: 0 };
const summary = { revenue: 0, orders: 0, tax: 0, discounts: 0, itemsSold: 0, averageOrder: 0, daily: [], topProducts: [], paymentModes: [], from: '2026-11-01', to: '2026-11-12' };
const stats = { activePlans: 0, outstanding: 0, overdueAmount: 0, overduePlans: 0, collectedToday: 0, totalProducts: 0, totalSales: 0, contractValue: 0, advancePayments: 0, installmentCollections: 0, outstandingReceivables: 0, overdueBalances: 0, upcomingInstallments: 0, completedAgreements: 0 };
const routes = ['/login', '/register', '/developer', '/developer?screen=login', '/super-admin', '/dashboard', '/pos', '/products', '/customers', '/orders', '/reports', '/settings', '/barcode-generator', '/barcode-scanner', '/installments', '/installments/444444444444444444444444', ...['dashboard', 'products', 'customers', 'sales/new', 'agreements', 'payments', 'schedules', 'ledgers', 'receipts', 'overdue', 'reports', 'settings'].map((page) => `/installments/${page}`)];

for (const mode of [{ name: 'desktop-light', width: 1440, height: 1000, theme: 'light' }, { name: 'mobile-dark', width: 390, height: 844, theme: 'dark' }]) {
  test.describe(mode.name, () => {
    test.use({ viewport: { width: mode.width, height: mode.height }, colorScheme: mode.theme });
    for (const route of routes) test(route, async ({ page }) => {
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      const user = { _id: '222222222222222222222222', tenantId: tenant._id, name: 'Demo Owner', email: 'owner@example.test', role: 'owner', moduleRights: rights, isActive: true, isDeveloper: route === '/developer', isSuperAdmin: route === '/super-admin' };
      await page.addInitScript(({ user, theme, signedOut }) => {
        localStorage.clear(); localStorage.setItem('pos-theme', theme);
        if (!signedOut) localStorage.setItem('pos-auth', JSON.stringify({ state: { user, accessToken: 'demo-access', refreshToken: 'demo-refresh' }, version: 0 }));
      }, { user, theme: mode.theme, signedOut: route === '/login' || route === '/register' || route.includes('?screen=login') });
      await page.route('**/api/**', async (request) => {
        if (!new URL(request.request().url()).pathname.startsWith('/api/')) return request.continue();
        const url = new URL(request.request().url()).pathname.replace(/^\/api/, '');
        let data = { data: [], total: 0, page: 1, limit: 20 };
        if (url === '/tenant/me') data = tenant;
        else if (url === '/branches') data = [];
        else if (url === '/auth/me') data = user;
        else if (url === '/auth/staff') data = [user];
        else if (url === '/products' && route === '/pos') data = { data: [{ _id: '555555555555555555555555', name: 'Demo product', sku: 'DEMO', unit: 'pcs', price: 100, costPrice: 50, stockQty: 20, lowStockThreshold: 2, trackStock: true, taxClass: 'exempt', attributes: {}, isActive: true }], total: 1, page: 1, limit: 20 };
        else if (url === '/orders/preview') data = { lines: [], subtotal: 100, discountTotal: 0, taxableTotal: 100, taxTotal: 0, charges: [], chargesTotal: 0, grandTotal: 100, taxBreakdown: [] };
        else if (url.endsWith('/overview')) data = overview;
        else if (url.endsWith('/businesses')) data = [{ ...tenant, businessId: tenant._id, subscriptionPlanId: null, subscriptionPlanName: null }];
        else if (url.endsWith('/plans')) data = [{ _id: '333333333333333333333333', name: 'Standard', description: 'Everyday business essentials', price: 2500, billingInterval: 'monthly', features, isActive: true }];
        else if (url.endsWith('/audit')) data = [];
        else if (url.includes('/stats/summary') || url === '/reports/sales') data = summary;
        else if (url === '/installments/stats' || url === '/installments/dashboard') data = stats;
        else if (url === '/installments/444444444444444444444444') data = { _id: '444444444444444444444444', customerName: 'Demo customer', customerPhone: '00000000000', invoiceNo: 'DEMO-001', status: 'active', items: [], cashTotal: 12000, downPayment: 2000, markupPercent: 0, markupAmount: 0, totalPayable: 12000, financedAmount: 10000, months: 10, monthlyAmount: 1000, firstDueDate: '2026-12-01', schedule: [], payments: [], paidTotal: 2000, balance: 10000, overdueAmount: 0, overdueCount: 0, nextDue: null, createdByName: 'Demo owner', createdAt: '2026-11-12' };
        await request.fulfill({ json: data });
      });
      await page.goto(route);
      await expect(page.locator('h1:visible').first()).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await expect(page.locator('html')).toHaveAttribute('data-theme', mode.theme);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2 ? Array.from(document.querySelectorAll('body *')).map((element) => ({ tag: element.tagName, cls: element.className, right: element.getBoundingClientRect().right, width: element.getBoundingClientRect().width })).filter((element) => element.right > innerWidth + 2 && element.width > 0).slice(-15) : []);
      if (overflow.length) console.log(route, JSON.stringify(overflow));
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2)).toBe(true);
      expect(await page.locator('body').evaluate((element) => getComputedStyle(element).fontFamily)).toContain('Inter');
      expect(errors).toEqual([]);
      if (route === '/pos') {
        await page.getByRole('button', { name: /Demo product/ }).click();
        await page.getByRole('button', { name: 'Hold current sale', exact: true }).click();
        await page.getByRole('button', { name: /Resume Sale 1/ }).click();
        await expect(page.getByText('1 items in current sale', { exact: true })).toBeVisible();
        if (mode.width < 1024) await page.getByRole('button', { name: /Sale & Checkout/ }).click();
        await page.getByRole('button', { name: 'mixed', exact: true }).click();
        await page.getByLabel('Cash amount').fill('40');
        await expect(page.getByText(/Card remainder:.*60/)).toBeVisible();
      }
      if (route === '/products' || route === '/customers') {
        const trigger = page.getByRole('button', { name: route === '/products' ? '+ Add product' : '+ Add customer', exact: true });
        await trigger.click();
        const dialog = page.getByRole('dialog');
        await expect(dialog).toBeVisible();
        await expect(dialog.locator('input').first()).toBeFocused();
        await page.keyboard.press('Escape');
        await expect(dialog).not.toBeVisible();
        await expect(trigger).toBeFocused();
      }
      if (['/login', '/dashboard', '/products', '/developer', '/settings', '/installments/dashboard'].includes(route)) await page.screenshot({ path: `qa/artifacts/${mode.name}-${route.replaceAll('/', '-')}.png`, fullPage: true });
    });
  });
}

for (const scenario of [
  { name: 'restricted admin', permissions: ['users.read'], sections: ['Admin account', 'Staff'] },
  { name: 'business admin', permissions: ['tax.configure', 'installments.write'], sections: ['Navigation', 'Business details', 'Admin account'] },
  { name: 'owner', role: 'owner', sections: ['Navigation', 'Business details', 'Installments', 'Admin account', 'Tax and service charges', 'Staff'] },
]) {
  test(`settings rights for ${scenario.name}`, async ({ page }) => {
    const user = { _id: 'settings-user', tenantId: tenant._id, name: 'Settings user', role: scenario.role ?? 'admin', moduleRights: scenario.role === 'owner' ? ['orders', 'settings', 'installments'] : ['settings', 'installments'], permissions: scenario.permissions };
    await page.addInitScript((user) => localStorage.setItem('pos-auth', JSON.stringify({ state: { user, accessToken: 'fixture', refreshToken: 'fixture' }, version: 0 })), user);
    await page.route('**/api/**', (route) => {
      const url = new URL(route.request().url()).pathname;
      if (!url.startsWith('/api/')) return route.continue();
      const data = url === '/api/auth/me' ? user : url === '/api/tenant/me'
        ? { ...tenant, featureFlags: { ...features, installments: user.role === 'owner' } }
        : url === '/api/auth/staff' ? [user] : url === '/api/branches' ? [] : { data: [] };
      return route.fulfill({ json: data });
    });
    await page.goto('/settings#taxes');
    const links = page.getByRole('navigation', { name: 'Settings sections' }).getByRole('link');
    await expect(links).toHaveText(scenario.sections);
    await expect(page.locator('#taxes')).toHaveCount(user.role === 'owner' ? 1 : 0);
    if (user.role === 'owner') {
      await page.getByLabel('Service charge (%)').fill('7.5');
      const saved = page.waitForRequest((r) => r.method() === 'PATCH' && r.url().endsWith('/tenant/me'));
      await page.getByRole('button', { name: 'Save tax settings' }).click();
      expect((await saved).postDataJSON()).toEqual({ taxProfile: { ...tenant.taxProfile, serviceChargePercent: 7.5 } });
    }
    await expect(page.locator('#installments')).toHaveCount(user.role === 'owner' ? 1 : 0);
    if (scenario.name === 'restricted admin') {
      await expect(page.locator('#business, #navigation, #branches')).toHaveCount(0);
      await expect(page.getByRole('button', { name: /Add staff member|Edit rights|Save settings/ })).toHaveCount(0);
    }
    if (scenario.name === 'business admin') {
      await expect(page.locator('#navigation input')).toHaveCount(1);
      const saved = page.waitForRequest((r) => r.method() === 'PATCH' && r.url().endsWith('/tenant/me'));
      await page.getByRole('button', { name: 'Save settings' }).click();
      const body = (await saved).postDataJSON();
      expect(body).not.toHaveProperty('invoicePrintSettings');
      expect(body).not.toHaveProperty('invoicePrefix');
      expect(body).not.toHaveProperty('taxProfile');
      expect(body).not.toHaveProperty('installmentMarkupPercent');
    }
  });
}
