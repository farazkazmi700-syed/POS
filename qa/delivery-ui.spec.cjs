const path = require('node:path');
const { test, expect } = require(require.resolve('@playwright/test', { paths: [path.dirname(process.argv[1])] }));
const tenant = { _id: '111111111111111111111111', name: 'Fixture Electronics', domainType: 'electronics', currency: 'PKR', timeZone: 'Asia/Karachi', featureFlags: { installments: true }, status: 'active', invoicePrintSettings: { paperSize: '58mm', orientation: 'portrait' } };
const sale = { _id: '222222222222222222222222', tenantId: tenant._id, agreementId: 'AGR-TEST', customerId: '333333333333333333333333', actualPrice: 100, advancePayment: 10, commissionAmount: 9, totalInstallmentPrice: 109, installmentDuration: 3, paymentFrequency: 'monthly', outstandingBalance: 99, totalPaid: 10, saleStatus: 'active', isActive: true, schedule: [{ installmentId: 'r1', dueDate: '2026-12-01', expectedAmount: 99, amountPaid: 0, remainingAmount: 99, status: 'pending' }], payments: [{ paymentId: 'p1', receiptNo: 'RCPT-1', paidAt: '2026-11-16', mode: 'cash', amount: 10 }] };
async function setup(page, rights, canExport = false, account) {
  const user = account ?? { _id: '444444444444444444444444', tenantId: tenant._id, name: 'Fixture cashier', role: 'cashier', email: 'fixture@example.test', moduleRights: rights };
  await page.addInitScript((user) => { localStorage.setItem('pos-auth', JSON.stringify({ state: { user, accessToken: 'fixture', refreshToken: 'fixture' }, version: 0 })); }, user);
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url()).pathname;
    if (!url.startsWith('/api/')) return route.continue();
    let data = { data: [], total: 0, page: 1, limit: 20 };
    if (url === '/api/auth/me') data = user;
    else if (url === '/api/tenant/me') data = tenant;
    else if (url === '/api/branches' || url === '/api/auth/staff') data = [];
    else if (url === '/api/support') data = { entitlements: { backup: true }, backup: { canExport, format: 'kazmion-business-export-v2', consistentSnapshot: false, includesCredentials: false, included: ['orders'], excluded: ['credentials'] } };
    else if (url === '/api/installments/sales') data = { data: [sale], total: 1, page: 1, limit: 20 };
    else if (url === `/api/installments/sales/${sale._id}`) data = sale;
    else if (url === '/api/installments/dashboard') data = { totalProducts: 1, totalSales: 1, contractValue: 109, advancePayments: 10, installmentCollections: 10, outstandingReceivables: 99, overdueBalances: 0, upcomingInstallments: 3, completedAgreements: 0 };
    await route.fulfill({ json: data });
  });
}
for (const width of [390, 1440]) {
  test.describe(`${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });
    test('staff cannot open the owner backup page and can reach Help', async ({ page }) => {
      await setup(page, []);
      await page.goto('/backup');
      await expect(page.getByRole('heading', { name: 'Access restricted' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Download Business Backup (ZIP)' })).toHaveCount(0);
      await expect(page.getByRole('link', { name: 'Help', exact: true })).toHaveAttribute('href', '/help');
    });
    test('payment retry keeps its key and agreement preview includes full ledger', async ({ page }) => {
      await setup(page, ['installments']);
      const attempts = [];
      await page.route(`**/api/installments/sales/${sale._id}/payments`, async (route) => {
        attempts.push(route.request().postDataJSON());
        if (attempts.length === 1) return route.fulfill({ status: 503, json: { message: 'Temporary failure' } });
        await route.fulfill({ json: { ...sale, totalPaid: 20, outstandingBalance: 89 } });
      });
      await page.goto('/installments/payments');
      await page.getByLabel('Agreement', { exact: true }).selectOption(sale._id);
      await page.getByLabel('Amount', { exact: true }).fill('10');
      await page.getByRole('button', { name: 'Collect payment' }).click();
      await expect(page.getByRole('alert')).toBeVisible();
      await page.getByRole('button', { name: 'Collect payment' }).click();
      await expect(page.getByRole('status')).toContainText('Payment posted');
      expect(attempts).toHaveLength(2); expect(attempts[0].idempotencyKey).toBe(attempts[1].idempotencyKey);
      await page.getByRole('button', { name: 'Print preview / PDF', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Installment print preview' });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole('heading', { name: 'Full payment schedule' })).toBeVisible();
      await expect(dialog.getByText('RCPT-1')).toBeVisible();
      await page.emulateMedia({ media: 'print' });
      await expect(page.locator('#root')).toBeHidden();
      await expect(dialog.locator('article')).toBeVisible();
      await page.emulateMedia({ media: 'screen' });
      await dialog.getByRole('button', { name: 'Close preview' }).click();
      await expect(dialog).toHaveCount(0);
    });
  });
}

test('profile contacts and business logo can be added, updated and removed', async ({ page }) => {
  const account = { _id: '444444444444444444444444', tenantId: tenant._id, role: 'owner', name: 'Owner', email: 'owner@example.test' };
  const business = { ...tenant, invoicePrefix: 'INV', featureFlags: { pos: true } };
  await setup(page, [], false, account);
  for (const [url, record] of [['auth/me', account], ['tenant/me', business]]) {
    await page.route('**/api/' + url, async route => {
      if (route.request().method() === 'PATCH') Object.assign(record, route.request().postDataJSON());
      await route.fulfill({ json: record });
    });
  }
  await page.goto('/settings');
  for (const [email, phone] of [['one@example.test', '03001234567'], ['two@example.test', '03007654321']]) {
    await page.getByLabel('Recovery email', { exact: true }).fill(email);
    await page.getByLabel('Recovery phone', { exact: true }).fill(phone);
    await page.getByRole('button', { name: 'Save profile' }).click();
    await expect(page.getByText('Profile saved.', { exact: true })).toBeVisible();
    await expect.poll(() => [account.recoveryEmail, account.phone]).toEqual([email, phone]);
  }
  await page.getByRole('button', { name: 'Remove email' }).click();
  await page.getByRole('button', { name: 'Remove phone' }).click();
  await page.getByRole('button', { name: 'Save profile' }).click();
  await expect.poll(() => [account.recoveryEmail, account.phone]).toEqual([null, null]);
  await page.getByRole('button', { name: 'Use KazmiOn Logo' }).click();
  await page.getByRole('button', { name: 'Save Logo' }).click();
  await expect.poll(() => business.logoUrl).toBe('/kazmion-logo.jpg');
  await page.getByPlaceholder('https://cdn.example.com/logo.png').fill('/updated-logo.png');
  await page.getByRole('button', { name: 'Save Logo' }).click();
  await expect.poll(() => business.logoUrl).toBe('/updated-logo.png');
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await page.getByRole('button', { name: 'Save Logo' }).click();
  await expect.poll(() => business.logoUrl).toBe('');
  await page.reload();
  await expect(page.getByLabel('Recovery email', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Recovery phone', { exact: true })).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Save Logo' })).toBeDisabled();
});

test('owner can recover from an export limit and download a ZIP', async ({ page }) => {
  const owner = { _id: '444444444444444444444444', tenantId: tenant._id, role: 'owner', name: 'Owner' };
  await setup(page, [], true, owner);
  let attempts = 0;
  await page.route('**/api/support/backup', async (route) => {
    attempts++;
    if (attempts === 1) return route.fulfill({ status: 413, json: { message: 'Use a native backup for this business.' } });
    return route.fulfill({
      body: Buffer.from('504b0506000000000000000000000000000000000000', 'hex'),
      contentType: 'application/zip',
      headers: { 'Content-Disposition': 'attachment; filename="business.zip"' },
    });
  });
  await page.goto('/backup');
  const button = page.getByRole('button', { name: 'Download Business Backup (ZIP)' });
  await button.click();
  await expect(page.getByRole('alert')).toHaveText('Use a native backup for this business.');
  const downloaded = page.waitForEvent('download');
  await button.click();
  expect((await downloaded).suggestedFilename()).toBe('business.zip');
  await expect(page.getByText('ZIP download started')).toBeVisible();
});
