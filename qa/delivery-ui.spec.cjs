const path = require('node:path');
const { test, expect } = require(require.resolve('@playwright/test', { paths: [path.dirname(process.argv[1])] }));
const tenant = { _id: '111111111111111111111111', name: 'Fixture Electronics', domainType: 'electronics', currency: 'PKR', timeZone: 'Asia/Karachi', featureFlags: { installments: true }, status: 'active', invoicePrintSettings: { paperSize: '58mm', orientation: 'portrait' } };
const sale = { _id: '222222222222222222222222', tenantId: tenant._id, agreementId: 'AGR-TEST', customerId: '333333333333333333333333', actualPrice: 100, advancePayment: 10, commissionAmount: 9, totalInstallmentPrice: 109, installmentDuration: 3, paymentFrequency: 'monthly', outstandingBalance: 99, totalPaid: 10, saleStatus: 'active', isActive: true, schedule: [{ installmentId: 'r1', dueDate: '2026-12-01', expectedAmount: 99, amountPaid: 0, remainingAmount: 99, status: 'pending' }], payments: [{ paymentId: 'p1', receiptNo: 'RCPT-1', paidAt: '2026-11-16', mode: 'cash', amount: 10 }] };
async function setup(page, rights, canExport = false) {
  const user = { _id: '444444444444444444444444', tenantId: tenant._id, name: 'Fixture cashier', role: 'cashier', email: 'fixture@example.test', moduleRights: rights };
  await page.addInitScript((user) => { localStorage.setItem('pos-auth', JSON.stringify({ state: { user, accessToken: 'fixture', refreshToken: 'fixture' }, version: 0 })); }, user);
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url()).pathname;
    let data = { data: [], total: 0, page: 1, limit: 20 };
    if (url === '/api/auth/me') data = user;
    else if (url === '/api/tenant/me') data = tenant;
    else if (url === '/api/branches') data = [];
    else if (url === '/api/support') data = { backup: { canExport } };
    else if (url === '/api/installments/sales') data = { data: [sale], total: 1, page: 1, limit: 20 };
    else if (url === `/api/installments/sales/${sale._id}`) data = sale;
    else if (url === '/api/installments/dashboard') data = { totalProducts: 1, totalSales: 1, contractValue: 109, advancePayments: 10, installmentCollections: 10, outstandingReceivables: 99, overdueBalances: 0, upcomingInstallments: 3, completedAgreements: 0 };
    await route.fulfill({ json: data });
  });
}
for (const width of [390, 1440]) {
  test.describe(`${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });
    test('support remains reachable without business-module grants', async ({ page }) => {
      await setup(page, []);
      await page.goto('/backup');
      await expect(page.getByRole('heading', { name: 'Help and Backup' })).toBeVisible();
      await expect(page.getByRole('heading', { name: /AI Chatbot/ })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Download business export' })).toHaveCount(0);
      await expect(page.getByText('Your owner or authorized administrator can export business data.')).toBeVisible();
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
