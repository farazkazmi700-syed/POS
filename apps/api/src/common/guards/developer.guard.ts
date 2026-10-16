import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { AuthUser } from '../auth-user';
import { hasDeveloperAccess } from '../security-access';

@Injectable()
export class DeveloperGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest().user as AuthUser | undefined;
    if (!hasDeveloperAccess(user)) throw new ForbiddenException('Developer access required');
    return true;
  }
}