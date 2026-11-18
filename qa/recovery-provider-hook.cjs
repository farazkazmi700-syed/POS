// Explicitly preloaded only by the isolated integration-test child process.
if (!/\/pos_spec_test_\d+_[a-f0-9]{8}$/.test(new URL(process.env.MONGO_URI).pathname) || !/^http:\/\/127\.0\.0\.1:\d+$/.test(process.env.RECOVERY_TEST_PROVIDER || '')) throw new Error('Recovery provider fixture requires a disposable test database and loopback sink.');
const actualFetch = globalThis.fetch;
// Exercise the persisted OTP cooldown/attempt limits without the HTTP IP limiter interrupting fixtures.
process.env.THROTTLE_ENABLED = 'false';
globalThis.fetch = (url, options) => actualFetch(String(url).startsWith('https://api.twilio.com/') ? process.env.RECOVERY_TEST_PROVIDER : url, options);
