const { randomBytes } = require('node:crypto');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const startApi = process.env.POS_E2E_START_API === '1';
const webServers = [{
  command: 'npm --prefix app/web run dev -- --host 127.0.0.1',
  cwd: root,
  url: 'http://localhost:5173',
  reuseExistingServer: !process.env.CI && !startApi,
  ...(startApi ? { env: { VITE_API_URL: 'http://127.0.0.1:3000' } } : {}),
}];

if (startApi) {
  webServers.unshift({
    command: 'node dist/main.js',
    cwd: path.join(root, 'app/api'),
    url: 'http://127.0.0.1:3000/api/health',
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      PORT: '3000',
      MONGO_URI: 'mongodb://127.0.0.1:27017/pos_browser_ci',
      REDIS_URL: 'redis://127.0.0.1:6379/0',
      JWT_ACCESS_SECRET: randomBytes(32).toString('hex'),
      JWT_REFRESH_SECRET: randomBytes(32).toString('hex'),
      CORS_ORIGIN: 'http://localhost:5173',
      PASSWORD_RESET_BASE_URL: 'http://localhost:5173/reset-password',
    },
  });
}

module.exports = {
  testDir: '.',
  testMatch: [
    'design-smoke.spec.cjs', 'appearance.spec.cjs', 'sign-in.spec.cjs', 'barcodes.spec.cjs',
    'recovery.spec.cjs', 'developer-ui.spec.cjs', 'delivery-ui.spec.cjs',
  ],
  outputDir: 'artifacts/browser', timeout: 45000, workers: 3, fullyParallel: true,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:5173', channel: process.env.CI ? undefined : 'msedge', headless: true, screenshot: 'only-on-failure' },
  webServer: webServers,
};
