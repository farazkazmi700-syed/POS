const base = require('./playwright.config.cjs');
module.exports = { ...base, testMatch: ['developer-ui.spec.cjs'], workers: 2 };
