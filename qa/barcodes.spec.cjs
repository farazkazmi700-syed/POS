const path = require('node:path');
const fs = require('node:fs');
const { createRequire } = require('node:module');
const { test, expect } = require(require.resolve('@playwright/test', { paths: [path.dirname(process.argv[1])] }));
const root = path.resolve(__dirname, '..');
const requireApi = createRequire(path.join(root, 'app/api/package.json'));
const { BarcodeService } = requireApi('./dist/modules/barcode/barcode.service.js');
const encoder = new BarcodeService({});
const decoderBundle = path.join(root, 'app/web/node_modules/@zxing/browser/umd/zxing-browser.min.js');
const product = { _id: '555555555555555555555555', name: 'Scanner test product', sku: 'SKU-001', barcode: '4006381333931', price: 250, stockQty: 2, trackStock: true, unit: 'pcs', isActive: true };
const tenant = { _id: '111111111111111111111111', name: 'Demo Retail', currency: 'PKR', featureFlags: { pos: true, inventory: true, barcodes: true }, navigationVisibility: {} };
const user = { _id: '222222222222222222222222', tenantId: tenant._id, name: 'Demo owner', role: 'owner', isActive: true };
async function setup(page, theme = 'light') {
  await page.addInitScript(({ user, theme }) => { localStorage.clear(); localStorage.setItem('pos-theme', theme); localStorage.setItem('pos-auth', JSON.stringify({ state: { user, accessToken: 'test', refreshToken: 'test' }, version: 0 })); }, { user, theme });
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url()); if (!url.pathname.startsWith('/api/')) return route.continue();
    let data = { data: [], total: 0 };
    if (url.pathname === '/api/auth/me') data = user;
    if (url.pathname === '/api/tenant/me') data = tenant;
    if (url.pathname === '/api/branches') data = [];
    if (url.pathname === '/api/barcodes/products') data = { data: [product], total: 1 };
    if (url.pathname === '/api/barcodes/lookup') return url.searchParams.get('value') === 'MISSING' ? route.fulfill({ status: 404, json: { message: 'No active product matches this barcode or SKU in the selected branch.' } }) : route.fulfill({ json: product });
    if (url.pathname === '/api/barcodes/generate') {
      try { data = await encoder.generate(tenant._id, route.request().postDataJSON()); }
      catch (error) { return route.fulfill({ status: 400, json: { message: error.message } }); }
    }
    return route.fulfill({ json: data });
  });
}
async function fits(page) { await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true); }

for (const [width, height, theme] of [[1440, 1000, 'light'], [390, 844, 'dark']]) {
  test(`${width}: generate, validate and export a decodable barcode`, async ({ page }) => {
    await page.setViewportSize({ width, height }); await setup(page, theme);
    await page.goto('/barcode-generator'); await fits(page);
    await expect(page.getByRole('button', { name: 'Download PNG' })).toBeDisabled();
    await page.getByLabel('Barcode format', { exact: true }).selectOption('EAN13');
    await page.getByLabel('Barcode value', { exact: true }).fill('4006381333932');
    await page.getByRole('button', { name: 'Generate barcode', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Invalid check digit');
    await page.getByLabel('Barcode value', { exact: true }).fill('400638133393');
    await page.getByRole('button', { name: 'Generate barcode', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('4006381333931'); await fits(page);
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download PNG', exact: true }).click();
    const file = await download;
    expect(file.suggestedFilename()).toContain('4006381333931.png');
    const png = fs.readFileSync(await file.path()); expect(png.subarray(1, 4).toString()).toBe('PNG');
    await page.addScriptTag({ path: decoderBundle });
    const decoded = await page.evaluate(async (data) => (await new window.ZXingBrowser.BrowserMultiFormatOneDReader().decodeFromImageUrl(data)).getText(), `data:image/png;base64,${png.toString('base64')}`);
    expect(decoded).toBe('4006381333931');
    await page.screenshot({ path: `qa/artifacts/barcode-generator-${width}.png`, fullPage: true });
    const popupPromise = page.waitForEvent('popup');
    await page.getByRole('button', { name: 'Print label', exact: true }).click();
    const popup = await popupPromise; await expect(popup.locator('.sheet img')).toHaveCount(1); await popup.close();
    await page.getByRole('button', { name: 'Clear', exact: true }).click();
    await expect(page.getByLabel('Barcode value', { exact: true })).toBeFocused();
    await expect(page.getByRole('button', { name: 'Download PNG' })).toBeDisabled();
  });
  test(`${width}: scanner lookup, missing code, sale and camera denial`, async ({ page }) => {
    await page.setViewportSize({ width, height }); await setup(page, theme);
    await page.addInitScript(() => { Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: async () => { throw new DOMException('Denied', 'NotAllowedError'); } }); });
    await page.goto('/barcode-scanner'); await fits(page);
    const input = page.getByLabel('Barcode or SKU', { exact: true });
    await input.fill('MISSING'); await input.press('Enter'); await expect(page.getByRole('alert')).toContainText('No active product');
    await input.fill('4006381333931'); await input.press('Enter');
    await expect(page.getByRole('heading', { name: product.name, exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Add to sale', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'added to the current sale' })).toBeVisible();
    await page.getByRole('button', { name: 'Add to sale', exact: true }).click();
    await expect(page.getByRole('button', { name: 'No stock available' })).toBeDisabled();
    await page.getByRole('button', { name: 'Start camera scan' }).click();
    await expect(page.getByRole('alert')).toContainText('Camera permission was denied');
    await page.getByRole('button', { name: 'Clear history' }).click();
    await expect(page.getByText('Your last 10 matched codes appear here for this session.')).toBeVisible();
    await fits(page); await page.screenshot({ path: `qa/artifacts/barcode-scanner-${width}.png`, fullPage: true });
  });
}
test('independent decoder reads all five generated barcode formats', async ({ page }) => {
  await page.goto('/login'); await page.addScriptTag({ path: decoderBundle });
  for (const [format, value, expected] of [['CODE128', 'KZM-2026-001', 'KZM-2026-001'], ['CODE39', 'ABC-123', 'ABC-123'], ['EAN13', '400638133393', '4006381333931'], ['EAN8', '9638507', '96385074'], ['UPC', '03600029145', '036000291452']]) {
    const result = await encoder.generate('unused', { format, value });
    const decoded = await page.evaluate(async (svg) => (await new window.ZXingBrowser.BrowserMultiFormatOneDReader().decodeFromImageUrl(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`)).getText(), result.svg);
    expect(decoded === expected || format === 'UPC' && decoded === `0${expected}`).toBe(true);
  }
});
test('stopping during camera permission releases a late stream', async ({ page }) => {
  await setup(page);
  await page.addInitScript(() => { Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: () => new Promise((resolve) => { window.resolveTestCamera = () => { const canvas = document.createElement('canvas'); window.testCameraStream = canvas.captureStream(); resolve(window.testCameraStream); }; }) }); });
  await page.goto('/barcode-scanner'); await page.getByRole('button', { name: 'Start camera scan' }).click();
  await page.waitForFunction(() => typeof window.resolveTestCamera === 'function');
  await page.getByRole('button', { name: 'Stop camera' }).click();
  await page.evaluate(() => window.resolveTestCamera());
  await expect.poll(() => page.evaluate(() => window.testCameraStream.getTracks().every((track) => track.readyState === 'ended'))).toBe(true);
  await expect(page.getByRole('button', { name: 'Start camera scan' })).toBeVisible();
});
for (const cameraFormat of ['EAN13', 'QR']) test(`camera decodes ${cameraFormat} and stops its tracks after a match`, async ({ page }) => {
  const { svg } = cameraFormat === 'QR' ? { svg: requireApi('bwip-js').toSVG({ bcid: 'qrcode', text: product.barcode, scale: 4 }) } : await encoder.generate('unused', { format: 'EAN13', value: product.barcode, scale: 3 });
  await setup(page);
  await page.addInitScript((svg) => {
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: async () => {
      const image = new Image(); image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth + 120; canvas.height = image.naturalHeight + 120;
      const context = canvas.getContext('2d'); context.fillStyle = 'white'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 60, 60);
      window.testCameraStream = canvas.captureStream(10); return window.testCameraStream;
    } });
  }, svg.replace(/<svg viewBox="0 0 (\d+) (\d+)"/, '<svg width="$1" height="$2" viewBox="0 0 $1 $2"'));
  await page.goto('/barcode-scanner'); await page.getByRole('button', { name: 'Start camera scan' }).click();
  await expect(page.getByRole('heading', { name: product.name, exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.testCameraStream.getTracks().every((track) => track.readyState === 'ended'))).toBe(true);
  await expect(page.getByText('Camera off', { exact: true })).toBeVisible();
});
test('repeated scans build a bill and products remain ready in POS', async ({ page }) => {
  await setup(page);
  await page.route('**/api/orders/preview', (route) => route.fulfill({ json: { lines: [], subtotal: 500, discountTotal: 0, taxableTotal: 500, taxTotal: 0, charges: [], chargesTotal: 0, grandTotal: 500, taxBreakdown: [] } }));
  await page.goto('/barcode-scanner');
  await page.getByLabel('Add matched products directly to billing').check();
  const input = page.getByLabel('Barcode or SKU', { exact: true });
  for (let quantity = 1; quantity <= 2; quantity++) {
    await input.fill(product.barcode); await input.press('Enter');
    await expect(page.getByText(`${quantity} items ready for billing`, { exact: true })).toBeVisible();
    await expect(input).toBeFocused();
  }
  await input.fill(product.barcode); await input.press('Enter');
  await expect(page.getByRole('alert')).toContainText('Not enough stock');
  await page.getByRole('link', { name: 'Continue to billing', exact: true }).click();
  await expect(page.getByText('2 items in current sale', { exact: true })).toBeVisible();
  await expect(page.getByText(product.name, { exact: true })).toBeVisible();
  await page.getByLabel('Scan barcode for billing').fill(product.barcode);
  await page.getByRole('button', { name: 'Add to bill', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Not enough stock');
});
test('POS scanner adds a product outside the displayed catalog', async ({ page }) => {
  await setup(page);
  await page.route('**/api/orders/preview', (route) => route.fulfill({ json: { lines: [], subtotal: 250, discountTotal: 0, taxableTotal: 250, taxTotal: 0, charges: [], chargesTotal: 0, grandTotal: 250, taxBreakdown: [] } }));
  await page.goto('/pos');
  await page.getByLabel('Scan barcode for billing').fill(product.barcode);
  await page.getByLabel('Scan barcode for billing').press('Enter');
  await expect(page.getByText('1 items in current sale', { exact: true })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('added to billing');
  const search = page.getByPlaceholder('Search products or scan a barcode and press Enter');
  await search.fill(product.barcode); await search.press('Enter');
  await expect(page.getByText('2 items in current sale', { exact: true })).toBeVisible();
});

// Exercise the same multi-format decoder used by the live camera, with independent fixtures.
test('camera decoder reads QR, Data Matrix, PDF417 and Aztec product identifiers', async ({ page }) => {
  await page.goto('/login'); await page.addScriptTag({ path: decoderBundle });
  const bwip = requireApi('bwip-js');
  for (const format of ['qrcode', 'datamatrix', 'pdf417', 'azteccode']) {
    const value = 'PRODUCT-2026-001';
    const png = await bwip.toBuffer({ bcid: format, text: value, scale: 4, padding: 16, backgroundcolor: 'FFFFFF' });
    const decoded = await page.evaluate(async (data) => (await new window.ZXingBrowser.BrowserMultiFormatReader().decodeFromImageUrl(data)).getText(), `data:image/png;base64,${png.toString('base64')}`);
    expect(decoded, format).toBe(value);
  }
});

test('backup ZIP preserves records and verifies manifest checksums', async ({ page }) => {
  await page.goto('/login');
  const result = await page.evaluate(async () => {
    const { createBackupZip } = await import('/src/utils/backup.ts');
    const { unzipSync, strFromU8 } = await import('/node_modules/fflate/esm/browser.js');
    const snapshot = { meta: { version: 2 }, businessData: { Customer: [{ name: 'Customer', balance: 12.34 }] } };
    const file = await createBackupZip(snapshot);
    const files = unzipSync(new Uint8Array(await file.arrayBuffer()));
    const manifest = JSON.parse(strFromU8(files['manifest.json']));
    for (const entry of manifest.files) {
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', files[entry.name]))).map(v => v.toString(16).padStart(2, '0')).join('');
      if (hash !== entry.sha256 || files[entry.name].length !== entry.bytes) throw new Error('Checksum mismatch');
    }
    return { name: file.name, type: file.type, data: JSON.parse(strFromU8(files['businessData.json'])) };
  });
  expect(result.name).toMatch(/\.zip$/); expect(result.type).toBe('application/zip');
  expect(result.data.Customer[0].balance).toBe(12.34);
});

for (const cloud of [false, true]) test(`backup UI ${cloud ? 'cloud' : 'offline'} delivery options`, async ({ page }) => {
  const developer = { ...user, isDeveloper: true };
  await page.addInitScript(user => localStorage.setItem('pos-auth', JSON.stringify({ state: { user, accessToken: 'test', refreshToken: 'test' }, version: 0 })), developer);
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url()).pathname;
    if (!url.startsWith('/api/')) return route.continue();
    let data = [];
    if (url.endsWith('/auth/me')) data = developer;
    if (url.endsWith('/tenant/me')) data = tenant;
    if (url.endsWith('/overview')) data = { businesses: 0, activeBusinesses: 0, suspendedBusinesses: 0, plans: 0, auditEvents: 0 };
    if (url.endsWith('/backup/options')) data = { mode: cloud ? 'cloud' : 'offline', email: cloud, drive: cloud, emailTo: cloud ? 'backup@example.test' : undefined };
    if (url.endsWith('/backup')) data = { meta: { version: 2, generatedAt: new Date().toISOString(), generator: 'test', counts: { businesses: 0, activeBusinesses: 0, accounts: 0, plans: 0, customModules: 0, auditEvents: 0 } }, businessData: {} };
    if (url.endsWith('/backup/deliver')) data = { status: 'accepted' };
    await route.fulfill({ json: data });
  });
  await page.goto('/developer'); await page.getByRole('button', { name: 'Backup', exact: true }).click();
  const email = page.getByRole('button', { name: /Send ZIP by email/ });
  const drive = page.getByRole('button', { name: /Upload ZIP to Drive/ });
  if (cloud) {
    await expect(email).toBeEnabled(); await expect(drive).toBeEnabled();
    const request = page.waitForRequest(r => r.url().endsWith('/backup/deliver'));
    await email.click(); expect((await request).postDataJSON()).toEqual({ destination: 'email' });
  } else { await expect(email).toBeDisabled(); await expect(drive).toBeDisabled(); }
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download ZIP Backup' }).click();
  expect((await download).suggestedFilename()).toMatch(/\.zip$/);
});
