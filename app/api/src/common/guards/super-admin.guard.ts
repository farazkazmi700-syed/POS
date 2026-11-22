import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { AuthUser } from '../auth-user';
import { hasSuperAdminAccess } from '../security-access';

@Injectable()
export class SuperAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest().user as AuthUser | undefined;
    if (!hasSuperAdminAccess(user)) throw new ForbiddenException('Super Admin access required');
    return true;
  }
}