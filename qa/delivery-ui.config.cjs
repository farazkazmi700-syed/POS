const base = require('./playwright.config.cjs');
module.exports = { ...base, testMatch: ['delivery-ui.spec.cjs'], outputDir: 'artifacts/delivery-browser', workers: 2 };
