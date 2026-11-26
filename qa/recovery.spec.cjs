const path = require('node:path');
const { test, expect } = require(require.resolve('@playwright/test', { paths: [path.dirname(process.argv[1])] }));
for (const separator of ['#', '?']) {
  test(`reset link with ${separator} protects the token and prevents repeat submissions`, async ({ page }) => {
    let requests = 0;
    let release;
    const delay = new Promise(resolve => { release = resolve; });
    await page.route('**/api/auth/reset-password', async route => {
      requests++;
      expect(route.request().headers().referer).toBeUndefined();
      expect(route.request().postDataJSON()).toEqual({ token: 'fixture-token', newPassword: 'test-passphrase-123' });
      await delay;
      await route.fulfill({ json: { message: 'Password updated.' } });
    });
    await page.goto('/reset-password' + separator + 'token=fixture-token');
    await page.getByLabel('New password', { exact: true }).fill('test-passphrase-123');
    await page.getByLabel('Confirm password').fill('test-passphrase-123');
    await page.getByRole('button', { name: 'Update password' }).click();
    try {
      await expect(page.getByRole('button', { name: 'Updating password' })).toBeDisabled();
    } finally {
      release();
    }
    await expect(page.getByRole('status')).toContainText('Password updated');
    await expect(page.getByLabel('New password', { exact: true })).toHaveCount(0);
    expect(requests).toBe(1);
  });
}

test('missing reset token shows an actionable message immediately', async ({ page }) => {
  await page.goto('/reset-password');
  await expect(page.getByRole('alert')).toContainText('Open the link');
  await expect(page.getByRole('link', { name: 'recover your account' })).toHaveAttribute('href', '/recover');
  await expect(page.getByLabel('New password', { exact: true })).toHaveCount(0);
});
for (const width of [390, 1440]) {
  test(`${width}: email recovery verifies OTP, confirms password, and enforces resend delay`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() => localStorage.clear());
    let confirmations = 0;
    await page.route('**/api/auth/recovery/**', async (route) => {
      const url = new URL(route.request().url()).pathname;
      if (url.endsWith('/options')) return route.fulfill({ json: { email: true, whatsapp: true } });
      if (url.endsWith('/request')) return route.fulfill({ json: { challengeId: 'c001fa51-5b3d-4e62-86fc-947d7715e308', resendAfter: 60, message: 'If eligible, check your registered contact.' } });
      confirmations++;
      return route.request().postDataJSON().code === '123456' ? route.fulfill({ json: { message: 'Updated successfully. All sessions have been signed out.' } }) : route.fulfill({ status: 400, json: { message: 'Invalid or expired code.' } });
    });
    await page.goto('/recover');
    await page.getByLabel('Account sign-in email').fill('owner@example.test');
    await page.getByRole('button', { name: 'Send verification code', exact: true }).click();
    await expect(page.getByRole('button', { name: /Resend in/ })).toBeDisabled();
    await page.getByLabel('6-digit verification code').fill('654321');
    await page.getByLabel('New password', { exact: true }).fill('secure-password-123');
    await page.getByLabel('Confirm password', { exact: true }).fill('wrong-confirmation');
    await page.getByRole('button', { name: 'Verify and update password' }).click();
    await expect(page.getByRole('alert')).toContainText('confirmation does not match'); expect(confirmations).toBe(0);
    await page.getByLabel('Confirm password', { exact: true }).fill('secure-password-123');
    await page.getByRole('button', { name: 'Verify and update password' }).click();
    await expect(page.getByRole('alert')).toContainText('Invalid or expired');
    await page.getByLabel('6-digit verification code').fill('123456');
    await page.getByRole('button', { name: 'Verify and update password' }).click();
    await expect(page.getByRole('link', { name: 'Continue to sign in' })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: `qa/artifacts/recovery-${width}.png`, fullPage: true });
  });
}
test('developer password recovery sends the password purpose and returns to Developer sign in', async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  let sent;
  await page.route('**/api/auth/recovery/**', async (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { email: true, whatsapp: true } });
    sent = route.request().postDataJSON();
    return route.fulfill({ json: { challengeId: 'c001fa51-5b3d-4e62-86fc-947d7715e308', resendAfter: 60, message: 'Check your registered contact.' } });
  });
  await page.goto('/recover?purpose=password&source=developer');
  await expect(page.getByRole('link', { name: '← Back to sign in' })).toHaveAttribute('href', '/developer');
  await expect(page.locator('option[value="developer-pin"]')).toHaveCount(0);
  await page.getByRole('link', { name: 'Recover with WhatsApp' }).click();
  await expect(page).toHaveURL(/\/recover\/whatsapp\?purpose=password&source=developer/);
  await expect(page.getByRole('heading', { name: 'Recover with WhatsApp' })).toBeVisible();
  await expect(page.getByRole('link', { name: '← Back to sign in' })).toHaveAttribute('href', '/developer');
  await page.getByLabel('Account sign-in email').fill('developer@example.test');
  await page.getByRole('button', { name: 'Send verification code', exact: true }).click();
  await expect(page.getByLabel('New password', { exact: true })).toBeVisible();
  expect(sent).toEqual({ email: 'developer@example.test', purpose: 'password', channel: 'whatsapp' });
});
test('unconfigured providers are unavailable and never imply code delivery', async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.route('**/api/auth/recovery/options', (route) => route.fulfill({ json: { email: false, whatsapp: false } }));
  await page.goto('/recover');
  await expect(page.getByRole('button', { name: 'Send verification code', exact: true })).toBeDisabled();
  await expect(page.getByRole('status')).toContainText('Email delivery is not configured');
  await page.getByRole('link', { name: 'Recover with WhatsApp' }).click();
  await expect(page.getByRole('button', { name: 'Send verification code', exact: true })).toBeDisabled();
  await expect(page.getByRole('status')).toContainText('WhatsApp delivery is not configured');
});
test('signed-in staff must verify a WhatsApp code before enrollment succeeds', async ({ page }) => {
  await page.addInitScript(() => { localStorage.clear(); localStorage.setItem('pos-auth', JSON.stringify({ state: { user: { _id: '222222222222222222222222', email: 'cashier@example.test', role: 'cashier' }, accessToken: 'demo', refreshToken: 'demo' }, version: 0 })); });
  let verified = false;
  await page.route('**/api/auth/**', async (route) => {
    const url = new URL(route.request().url()).pathname;
    if (url.endsWith('/options')) return route.fulfill({ json: { email: true, whatsapp: true } });
    if (url.endsWith('/phone/request')) return route.fulfill({ json: { challengeId: 'c001fa51-5b3d-4e62-86fc-947d7715e308', resendAfter: 60, message: 'Check your WhatsApp for a verification code.' } });
    if (url.endsWith('/phone/confirm')) { verified = route.request().postDataJSON().code === '123456'; return route.fulfill({ json: { message: 'WhatsApp number verified for account recovery.' } }); }
    return route.fulfill({ json: {} });
  });
  await page.goto('/account-security');
  await page.getByRole('link', { name: 'WhatsApp recovery', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'WhatsApp recovery' })).toBeVisible();
  await expect(page.getByLabel('Current password')).toHaveCount(0);
  await expect(page.getByLabel('Account sign-in email')).toHaveCount(0);
  await page.getByLabel('WhatsApp number with country code').fill('+923001234567');
  await page.getByLabel('Send account security codes to my WhatsApp number.').check();
  await page.getByRole('button', { name: 'Send WhatsApp verification code', exact: true }).click();
  await expect(page.getByLabel('WhatsApp verification code', { exact: true })).toBeFocused();
  expect(verified).toBe(false);
  await page.getByLabel('WhatsApp verification code', { exact: true }).fill('123456');
  await page.getByRole('button', { name: 'Verify WhatsApp number', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('WhatsApp number verified');
  expect(verified).toBe(true);
});

test('signed-in Developer can open recovery and change password as separate pages', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('pos-auth', JSON.stringify({
      state: { user: { _id: 'developer-1', email: 'developer@example.test', role: 'owner', isDeveloper: true }, accessToken: 'demo' },
      version: 0,
    }));
  });
  await page.route('**/api/auth/recovery/options', route => route.fulfill({ json: { email: true, whatsapp: true } }));
  await page.route('**/api/auth/change-password', route => {
    expect(route.request().postDataJSON()).toEqual({
      currentPassword: 'current-password', newPassword: 'updated-password-123',
    });
    return route.fulfill({ json: { message: 'Password changed.' } });
  });
  await page.route('**/api/auth/logout', route => route.fulfill({ status: 204 }));
  await page.goto('/account-security?source=developer');
  await expect(page.getByRole('heading', { name: 'Account security' })).toBeVisible();
  await expect(page.getByRole('textbox')).toHaveCount(0);

  await page.getByRole('link', { name: 'Recover account access' }).click();
  await expect(page).toHaveURL(/\/recover\?source=developer/);
  await expect(page.getByLabel('Account sign-in email')).toBeVisible();
  await expect(page.getByLabel('Current password')).toHaveCount(0);
  await expect(page.getByLabel('WhatsApp number with country code')).toHaveCount(0);

  await page.getByRole('link', { name: '← Account security' }).click();
  await page.getByRole('link', { name: 'Change password' }).click();
  await expect(page).toHaveURL(/\/account-security\/change-password\?source=developer/);
  await expect(page.getByLabel('Account sign-in email')).toHaveCount(0);
  await expect(page.getByLabel('WhatsApp number with country code')).toHaveCount(0);
  await page.getByLabel('Current password', { exact: true }).fill('current-password');
  await page.getByLabel('New password', { exact: true }).fill('updated-password-123');
  await page.getByLabel('Confirm new password', { exact: true }).fill('updated-password-123');
  await page.getByRole('button', { name: 'Save new password' }).click();
  await expect(page.getByRole('heading', { name: 'Password changed' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Continue to sign in' })).toHaveAttribute('href', '/developer');
});
