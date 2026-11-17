module.exports = {
  testDir: '.', testMatch: 'runtime-smoke.spec.cjs', timeout: 45000, workers: 1,
  outputDir: 'artifacts/runtime', reporter: [['list']],
  use: { baseURL: process.env.SMOKE_BASE_URL || 'http://localhost:8080', channel: process.env.CI ? undefined : 'msedge', headless: true },
};
