// Runs against the deployed stack; never creates business records.
const path = require('node:path');
const { test, expect } = require(require.resolve('@playwright/test', { paths: [path.dirname(process.argv[1])] }));

test('deployed sign-in and API proxy work together', async ({ page, request }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const health = await request.get('/api/health');
  expect(health.ok()).toBeTruthy();
  expect(health.headers()['cache-control']).toMatch(/\bno-store\b/);
  expect((await health.json()).database).toBe('connected');
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Log in to your account' })).toBeVisible();
  const hero = await request.get('/kazmion-store-banner.jpg');
  expect(hero.ok()).toBeTruthy();
  expect(hero.headers()['content-type']).toContain('image/jpeg');
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
  for (const [channel, route, heading, label] of [
    ['email', '/recover', 'Recover account access', 'Email'],
    ['whatsapp', '/recover/whatsapp', 'Recover with WhatsApp', 'WhatsApp'],
  ]) {
    await page.goto(route);
    await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    const send = page.getByRole('button', { name: 'Send verification code', exact: true });
    if (options[channel]) {
      await expect(send).toBeEnabled();
    } else {
      await expect(page.getByRole('status')).toContainText(`${label} delivery is not configured`);
      await expect(send).toBeDisabled();
    }
  }
});
