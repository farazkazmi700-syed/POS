import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { AuthUser } from '../auth-user';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { actionForRoute, permittedActions } from '../action-permissions';

@Injectable()
export class ActionPermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(context: ExecutionContext) {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()])) return true;
    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthUser | undefined;
    if (!user) return false;
    const controller = this.reflector.get<string>(PATH_METADATA, context.getClass()) ?? '';
    if (controller === 'developer' || controller === 'super-admin') return controller === 'developer' ? user.isDeveloper : user.isSuperAdmin;
    if (controller === 'auth' && ['me', 'logout'].includes(this.reflector.get<string>(PATH_METADATA, context.getHandler()) ?? '')) return true;
    const action = actionForRoute(controller, this.reflector.get<string>(PATH_METADATA, context.getHandler()) ?? '', request.method);
    if (!action || !permittedActions(user).includes(action)) throw new ForbiddenException('This action is not permitted for your account');
    return true;
  }
}
