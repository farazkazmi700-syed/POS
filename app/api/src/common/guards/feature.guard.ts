import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthUser } from '../auth-user';
import { FEATURE_KEY } from '../decorators/feature.decorator';
import { FeatureRequirement } from '../features';
import { hasAnyFeatureAccess } from '../security-access';
import { TenantService } from '../../modules/tenant/tenant.service';
import { ModuleRegistryService } from '../../modules/super-admin/module-registry.service';
import { PATH_METADATA } from '@nestjs/common/constants';
import { hasModuleRights } from '../module-rights';
import { permittedActions } from '../action-permissions';

@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly tenants: TenantService, private readonly registry: ModuleRegistryService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const feature = this.reflector.getAllAndOverride<FeatureRequirement>(FEATURE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!feature) return true;

    const user = context.switchToHttp().getRequest().user as AuthUser | undefined;
    if (!user) return false;
    const tenant = await this.tenants.findById(user.tenantId);
    const requiredFeatures = typeof feature === 'string' ? [feature] : feature;
    const executable = await this.registry.executableKeys(requiredFeatures);
    const allowed = requiredFeatures.some((key) => executable.includes(key) && hasAnyFeatureAccess(false, tenant.featureFlags, [key]));
    if (!allowed) {
      throw new ForbiddenException(`Required feature access is disabled for this business`);
    }
    const request = context.switchToHttp().getRequest();
    if (this.reflector.get<string>(PATH_METADATA, context.getClass()) === 'orders' && request.method === 'POST' && request.body?.paymentMode === 'installment') {
      if (tenant.featureFlags?.installments !== true || !(await this.registry.executableKeys(['installments'])).length
        || !hasModuleRights(user, 'installments', '/', 'POST') || !permittedActions(user).includes('installments.write')) {
        throw new ForbiddenException('Installment execution is not permitted');
      }
    }
    return true;
  }
}
