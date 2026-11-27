import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
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
    const { user, method } = context.switchToHttp().getRequest<{ user?: AuthUser; method: string }>();
    if (!user || (allowSuspended && (user.isDeveloper || user.isSuperAdmin))) return true;
    const tenant = await this.tenants.findById(user.tenantId).catch(() => null);
    if (!tenant || tenant.trashedAt) throw new UnauthorizedException('Business unavailable');
    if (allowSuspended) return true;
    if (!hasTenantAccess(tenant.status, false)) throw new UnauthorizedException('Business is suspended');
    if (tenant.licenseExpiresAt && tenant.licenseExpiresAt.getTime() <= Date.now() && !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      throw new ForbiddenException('Business license has expired. Records are read-only until renewal.');
    }
    return true;
  }
}
