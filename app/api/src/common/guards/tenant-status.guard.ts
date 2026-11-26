import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthUser } from '../auth-user';
import { ALLOW_SUSPENDED_TENANT_KEY } from '../decorators/allow-suspended-tenant.decorator';
import { hasTenantAccess } from '../security-access';
import { TenantService } from '../../modules/tenant/tenant.service';

@Injectable()
export class TenantStatusGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly tenants: TenantService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const allowSuspended = this.reflector.getAllAndOverride<boolean>(ALLOW_SUSPENDED_TENANT_KEY, [
      context.getHandler(), context.getClass(),
    ]);
    const user = context.switchToHttp().getRequest().user as AuthUser | undefined;
    if (!user || (allowSuspended && (user.isDeveloper || user.isSuperAdmin))) return true;
    const tenant = await this.tenants.findById(user.tenantId).catch(() => null);
    if (!tenant || tenant.trashedAt) throw new UnauthorizedException('Business unavailable');
    if (allowSuspended) return true;
    if (!hasTenantAccess(tenant.status, false)) throw new UnauthorizedException('Business is suspended');
    if (tenant.licenseExpiresAt && tenant.licenseExpiresAt.getTime() <= Date.now()) throw new UnauthorizedException('Business license has expired. Contact the platform owner.');
    return true;
  }
}
