import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthUser } from '../auth-user';
import { DEVELOPER_SCOPE_KEY } from '../decorators/developer-scope.decorator';
import { canUseDeveloperRoute } from '../security-access';

@Injectable()
export class DeveloperScopeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest().user as AuthUser | undefined;
    const allowed = this.reflector.getAllAndOverride<boolean>(DEVELOPER_SCOPE_KEY, [
      context.getHandler(), context.getClass(),
    ]);
    if (!canUseDeveloperRoute(user?.isDeveloper === true, allowed === true)) {
      throw new ForbiddenException('Developer accounts are limited to Developer tools');
    }
    return true;
  }
}