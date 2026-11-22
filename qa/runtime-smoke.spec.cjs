// Runs against the deployed stack; never creates business records.
const path = require('node:path');
const { test, expect } = require(require.resolve('@playwright/test', { paths: [path.dirname(process.argv[1])] }));

test('deployed sign-in and API proxy work together', async ({ page, request }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const health = await request.get('/api/health');
  expect(health.ok()).toBeTruthy();
  expect((await health.json()).database).toBe('connected');
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Log in to your account' })).toBeVisible();
  const hero = await request.get('/smart-pos-storefront-banner.png');
  expect(hero.ok()).toBeTruthy();
  expect(hero.headers()['content-type']).toContain('image/png');
  await page.getByLabel('Email address').fill(`smoke-${Date.now()}@example.invalid`);
  await page.getByLabel('Password', { exact: true }).fill('invalid-smoke-password');
  await page.getByRole('button', { name: 'Show password', exact: true }).click();
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'text');
  const response = page.waitForResponse((res) => new URL(res.url()).pathname === '/api/auth/login');
  await page.locator('button.sign-in-submit').click();
  expect((await response).status()).toBe(401);
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.locator('button.sign-in-submit')).toBeEnabled();
  expect(errors).toEqual([]);
});
test('deployed recovery exposes only configured delivery channels', async ({ page, request }) => {
  const response = await request.get('/api/auth/recovery/options');
  expect(response.ok()).toBeTruthy();
  const options = await response.json();
  expect(typeof options.email).toBe('boolean'); expect(typeof options.whatsapp).toBe('boolean');
  await page.goto('/recover');
  await expect(page.getByRole('heading', { name: 'Recover account access' })).toBeVisible();
  if (options.whatsapp) await expect(page.locator('option[value="whatsapp"]')).toBeEnabled();
  else await expect(page.locator('option[value="whatsapp"]')).toBeDisabled();
  if (options.email) await expect(page.getByRole('button', { name: 'Send verification code', exact: true })).toBeEnabled();
  else await expect(page.getByRole('status')).toContainText('Email delivery is not configured');
});
