import { SetMetadata } from '@nestjs/common';

export const ALLOW_SUSPENDED_TENANT_KEY = 'allow-suspended-tenant';
export const AllowSuspendedTenant = () => SetMetadata(ALLOW_SUSPENDED_TENANT_KEY, true);