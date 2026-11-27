type SyncConfigKey = 'DATA_SYNC_TENANT_ID' | 'DATA_SYNC_URL' | 'DATA_SYNC_TOKEN';
type SyncConfig = { get(key: SyncConfigKey): string | undefined };

export function configuredDataSyncBusiness(config: SyncConfig): string | null {
  const businessId = config.get('DATA_SYNC_TENANT_ID');
  return businessId && /^[a-f0-9]{24}$/.test(businessId) && dataSyncDestination(config, businessId)
    ? businessId
    : null;
}

export function dataSyncDestination(config: SyncConfig, businessId: string) {
  const endpoint = config.get('DATA_SYNC_URL');
  const token = config.get('DATA_SYNC_TOKEN');
  if (!/^[a-f0-9]{24}$/.test(businessId) || !endpoint || !token || !/^[a-f0-9]{64}$/i.test(token)
      || config.get('DATA_SYNC_TENANT_ID') !== businessId) return null;
  try {
    const url = new URL(endpoint);
    if (url.protocol === 'https:' && url.pathname === '/v1/business-snapshot' && !url.username && !url.password && !url.search && !url.hash) {
      return { url, token };
    }
  } catch {
    // Invalid endpoint configuration is reported as unavailable.
  }
  return null;
}
