import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PATH_METADATA } from '@nestjs/common/constants';
import { AuthUser } from '../auth-user';
import { BranchService } from '../../modules/branch/branch.module';
import { TenantService } from '../../modules/tenant/tenant.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
@Injectable() export class BranchGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly tenants: TenantService, private readonly branches: BranchService) {}
  async canActivate(context: ExecutionContext) {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()])) return true;
    const request = context.switchToHttp().getRequest(); const user = request.user as AuthUser | undefined;
    if (!user || user.isDeveloper || user.isSuperAdmin) return true;
    const controller = this.reflector.get<string>(PATH_METADATA, context.getClass());
    if (controller === 'auth' || controller === 'tenant' || controller === 'branches' || controller === 'support') return true;
    const tenant = await this.tenants.findById(user.tenantId);
    const defaultBranchId = tenant.defaultBranchId?.toString();
    const requested = request.headers['x-branch-id'];
    if (requested !== undefined && typeof requested !== 'string') throw new ForbiddenException('Invalid branch selection');
    const branchId = requested || (user.role === 'owner' ? defaultBranchId : user.branchIds?.[0]);
    if (!branchId && !defaultBranchId) return true; // Legacy single-branch tenants until provisioned.
    if (!branchId || (user.role !== 'owner' && !user.branchIds?.includes(branchId))) throw new ForbiddenException('No authorized branch selected');
    await this.branches.validate(user.tenantId, branchId);
    user.branchId = branchId; user.defaultBranchId = defaultBranchId;
    return true;
  }
}
