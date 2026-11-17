module.exports = {
  testDir: '.', testMatch: ['design-smoke.spec.cjs', 'sign-in.spec.cjs', 'barcodes.spec.cjs', 'recovery.spec.cjs'],
  outputDir: 'artifacts/browser', timeout: 45000, workers: 3, fullyParallel: true,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:5173', channel: process.env.CI ? undefined : 'msedge', headless: true, screenshot: 'only-on-failure' },
  webServer: { command: 'npm --prefix apps/web run dev -- --host 127.0.0.1', cwd: require('node:path').resolve(__dirname, '..'), url: 'http://localhost:5173', reuseExistingServer: !process.env.CI },
};
