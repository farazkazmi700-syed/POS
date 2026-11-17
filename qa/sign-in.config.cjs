module.exports = {
  ...require('./playwright.config.cjs'),
  testMatch: 'sign-in.spec.cjs', workers: 2,
};
