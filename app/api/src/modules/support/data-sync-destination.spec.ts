import { configuredDataSyncBusiness, dataSyncDestination } from './data-sync-destination';

describe('data sync destination', () => {
  const businessId = '507f1f77bcf86cd799439011';
  const destination = (overrides: Record<string, string | undefined> = {}) => {
    const settings: Record<string, string | undefined> = {
      DATA_SYNC_TENANT_ID: businessId,
      DATA_SYNC_URL: 'https://snapshots.example.test/v1/business-snapshot',
      DATA_SYNC_TOKEN: 'a'.repeat(64),
      ...overrides,
    };
    return { get: (key: string) => settings[key] };
  };

  it('reports the same configured business used by the owner upload', () => {
    const config = destination();
    expect(configuredDataSyncBusiness(config)).toBe(businessId);
    expect(dataSyncDestination(config, businessId)?.url.pathname).toBe('/v1/business-snapshot');
    expect(dataSyncDestination(config, '507f1f77bcf86cd799439012')).toBeNull();
  });

  it.each([
    { DATA_SYNC_TOKEN: 'invalid' },
    { DATA_SYNC_TENANT_ID: 'invalid' },
    { DATA_SYNC_URL: 'http://snapshots.example.test' },
    { DATA_SYNC_URL: 'https://user@snapshots.example.test' },
    { DATA_SYNC_URL: 'https://snapshots.example.test?token=invalid' },
    { DATA_SYNC_URL: 'malformed' },
  ])('rejects invalid configuration %j', (overrides) => {
    expect(configuredDataSyncBusiness(destination(overrides))).toBeNull();
  });
});
