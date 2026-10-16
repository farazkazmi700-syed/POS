import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthUser } from '../auth-user';
import { FEATURE_KEY } from '../decorators/feature.decorator';
import { FeatureRequirement } from '../features';
import { hasAnyFeatureAccess } from '../security-access';
import { TenantService } from '../../modules/tenant/tenant.service';

@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly tenants: TenantService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const feature = this.reflector.getAllAndOverride<FeatureRequirement>(FEATURE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!feature) return true;

    const user = context.switchToHttp().getRequest().user as AuthUser | undefined;
    if (!user) return false;
    if (user.isSuperAdmin) return true;

    const tenant = await this.tenants.findById(user.tenantId);
    const requiredFeatures = typeof feature === 'string' ? [feature] : feature;
    const allowed = hasAnyFeatureAccess(false, tenant.featureFlags, requiredFeatures);
    if (!allowed) {
      throw new ForbiddenException(`Required feature access is disabled for this business`);
    }
    return true;
  }
}