import { isDeveloperRegistrationAllowed } from './registration-access';

describe('developer-only business registration', () => {
  const configuredEmail = 'dev@example.com';
  let configuredPasswordHash: string;

  beforeAll(async () => {
    const bcrypt = await import('bcryptjs');
    configuredPasswordHash = await bcrypt.hash('test-dev-password', 4);
  });

  it('allows the configured developer email with the matching password', async () => {
    await expect(isDeveloperRegistrationAllowed(
      'Dev@Example.com', 'test-dev-password', configuredEmail, configuredPasswordHash,
    )).resolves.toBe(true);
  });

  it('rejects other emails, incorrect passwords, and missing configuration', async () => {
    await expect(isDeveloperRegistrationAllowed(
      'other@example.com', 'test-dev-password', configuredEmail, configuredPasswordHash,
    )).resolves.toBe(false);
    await expect(isDeveloperRegistrationAllowed(
      configuredEmail, 'wrong-password', configuredEmail, configuredPasswordHash,
    )).resolves.toBe(false);
    await expect(isDeveloperRegistrationAllowed(configuredEmail, 'password', undefined, configuredPasswordHash)).resolves.toBe(false);
    await expect(isDeveloperRegistrationAllowed(configuredEmail, 'password', configuredEmail, undefined)).resolves.toBe(false);
  });
});