const path = require('node:path');
const { test, expect } = require(require.resolve('@playwright/test', { paths: [path.dirname(process.argv[1])] }));

function signInSpacing(page) {
  return page.locator('.sign-in-card').evaluate((card) => ({
    width: card.getBoundingClientRect().width,
    padding: getComputedStyle(card).padding,
    margin: getComputedStyle(card).margin,
    formGap: getComputedStyle(card.querySelector('.sign-in-form')).rowGap,
  }));
}

const screens = [
  [320, 568, 'light'], [390, 844, 'dark'], [768, 1024, 'light'],
  [1023, 768, 'light'], [1024, 768, 'dark'], [1199, 900, 'light'], [1200, 800, 'dark'],
  [1440, 900, 'light'], [1920, 1080, 'dark'], [2560, 1080, 'light'], [844, 390, 'light'],
];
for (const [width, height, theme] of screens) {
  test(`${width}x${height} ${theme}: credentials, PIN and recovery`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.addInitScript((theme) => { localStorage.clear(); localStorage.setItem('pos-theme', theme); }, theme);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/api/auth/**', async (route) => {
      const url = new URL(route.request().url()).pathname;
      if (!url.startsWith('/api/auth/')) return route.continue();
      if (url === '/api/auth/login') return route.fulfill({ json: { requiresPin: true, challengeToken: 'test-challenge', pinRequiresChange: false } });
      if (url === '/api/auth/login/pin') return route.fulfill({ status: 401, json: { message: 'Incorrect PIN. Try again.' } });
      return route.fulfill({ json: { message: 'Recovery instructions have been sent.' } });
    });
    const fits = async () => {
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      const layout = await page.locator('.sign-in-page').boundingBox();
      expect(layout.height).toBeGreaterThanOrEqual(height);
      const card = await page.locator('.sign-in-card').boundingBox();
      expect(card.x).toBeGreaterThanOrEqual(0);
      expect(card.x + card.width).toBeLessThanOrEqual(width + 1);
      const artwork = await page.locator('.sign-in-artwork').boundingBox();
      const banner = await page.locator('.sign-in-artwork img').boundingBox();
      expect(banner.width).toBeGreaterThan(0);
      expect(banner.height).toBeGreaterThan(0);
      expect(banner.x).toBeGreaterThanOrEqual(artwork.x - 1);
      expect(banner.y).toBeGreaterThanOrEqual(artwork.y - 1);
      expect(banner.x + banner.width).toBeLessThanOrEqual(artwork.x + artwork.width + 1);
      expect(banner.y + banner.height).toBeLessThanOrEqual(artwork.y + artwork.height + 1);
      expect(artwork.x).toBeGreaterThanOrEqual(0);
      expect(artwork.x + artwork.width).toBeLessThanOrEqual(width + 1);
      expect(Math.abs(banner.width - layout.width)).toBeLessThanOrEqual(1);
      expect(Math.abs(banner.height - height)).toBeLessThanOrEqual(1);
      expect(Math.abs(banner.y)).toBeLessThanOrEqual(1);
      await expect(page.locator('.sign-in-artwork')).toHaveCSS('position', 'fixed');
      await expect(page.locator('.sign-in-artwork img')).toHaveCSS('object-fit', 'cover');
      const cardIsAboveBanner = await page.locator('.sign-in-card').evaluate((element) => {
        const box = element.getBoundingClientRect();
        const x = box.left + box.width / 2;
        const y = Math.max(0, box.top) + 8;
        return element.contains(document.elementFromPoint(x, y));
      });
      expect(cardIsAboveBanner).toBe(true);
    };
    await page.goto('/login');
    await page.evaluate(() => document.fonts.ready);
    const banner = page.locator('.sign-in-artwork img');
    await expect(banner).toHaveAttribute('src', '/kazmion-store-banner.jpg');
    await expect.poll(() => banner.evaluate((image) => image.complete && image.naturalWidth > 0)).toBe(true);
    if (width === 1440) {
      await expect.poll(() => banner.evaluate((image) => new URL(image.currentSrc).pathname))
        .toBe('/kazmion-store-banner-1670.png');
    }
    await expect(page.getByText('POINT OF SALE SYSTEM', { exact: true })).toBeVisible();
    await expect(page.locator('#sign-in-description')).toHaveText('Sign in to manage your business.');
    await expect(page.getByText('BUSINESS WORKSPACE', { exact: true })).toHaveCount(0);
    await expect(page.getByText('SIGN IN TO YOUR WORKSPACE', { exact: true })).toHaveCount(0);
    await fits();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await expect(page.getByRole('heading', { name: 'Log in to your account' })).toBeVisible();
    if ([390, 768, 1440].includes(width)) await page.screenshot({ path: `qa/artifacts/sign-in-${width}-${theme}.png`, fullPage: true });
    await page.getByLabel('Email address').fill('a-long-account-name.for.testing@business.example');
    await page.getByLabel('Password', { exact: true }).fill('example-password');
    await page.getByRole('button', { name: 'Show password', exact: true }).click();
    await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'text');
    await expect(page.getByRole('button', { name: 'Reset PIN', exact: true })).toHaveCount(0);
    const reference = await signInSpacing(page);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByLabel('4-digit PIN', { exact: true })).toBeFocused();
    await expect(page.getByLabel('Sign-in progress')).toBeVisible();
    expect(await signInSpacing(page)).toEqual(reference);
    await expect(page.locator('.sign-in-account')).toHaveCSS('flex-direction', 'row');
    expect((await page.getByRole('button', { name: 'Reset PIN', exact: true }).boundingBox()).height).toBeGreaterThanOrEqual(44);
    await fits();
    await page.getByLabel('4-digit PIN', { exact: true }).fill('1234');
    await page.getByRole('button', { name: 'Verify PIN', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Incorrect PIN');
    await page.getByRole('button', { name: 'Reset PIN', exact: true }).click();
    await expect(page.getByLabel('Email address')).toBeFocused();
    await page.getByRole('button', { name: 'Send reset code', exact: true }).click();
    await expect(page.getByLabel('6-digit email code')).toBeFocused();
    await fits();
    await page.getByLabel('6-digit email code').fill('123456');
    await page.getByLabel('New 4-digit PIN').fill('5678');
    await page.getByRole('button', { name: 'Reset PIN', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Log in to your account' })).toBeVisible();
    await expect(page.getByRole('status')).toContainText('Recovery instructions');
    expect(errors).toEqual([]);
  });
}

for (const [width, height] of [[320, 568], [1440, 900]]) {
  test(`${width}x${height}: Developer security step matches sign-in spacing`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/login');
    const reference = await signInSpacing(page);
    await page.goto('/developer');
    await page.getByLabel('Verified developer email').fill('a-long-developer-account-name@business.example');
    await page.getByRole('button', { name: 'Continue to password' }).click();
    await expect(page.getByRole('heading', { name: 'Enter your password' })).toBeVisible();
    expect(await signInSpacing(page)).toEqual(reference);
    await expect(page.locator('.sign-in-account')).toHaveCSS('flex-direction', 'row');
    await expect(page.getByRole('button', { name: 'Change', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Show password' }).click();
    await expect(page.getByLabel('Developer password', { exact: true })).toHaveAttribute('type', 'text');
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  });
}
