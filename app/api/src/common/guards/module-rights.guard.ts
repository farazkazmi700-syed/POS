import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PATH_METADATA } from '@nestjs/common/constants';
import { AuthUser } from '../auth-user';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { hasModuleRights } from '../module-rights';

@Injectable()
export class ModuleRightsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()])) return true;
    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthUser | undefined;
    if (!user) return true;
    const controller = this.reflector.get<string>(PATH_METADATA, context.getClass()) ?? '';
    const handler = this.reflector.get<string>(PATH_METADATA, context.getHandler()) ?? '';
    if (!hasModuleRights(user, controller, handler, request.method)) {
      throw new ForbiddenException('Your account does not have permission for this module');
    }
    return true;
  }
}
