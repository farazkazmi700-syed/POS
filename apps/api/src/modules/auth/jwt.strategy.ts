import { InjectModel } from '@nestjs/mongoose';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Model } from 'mongoose';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthUser } from '../../common/auth-user';
import { Role } from '../../common/enums';
import { isConfiguredDeveloper, isPersistedSuperAdmin } from '../../common/security-access';
import { User } from './schemas/user.schema';

interface JwtPayload {
  sub: string; tenantId: string; role: Role; email: string; name: string;
  purpose?: string; authSource?: string; pinVerified?: boolean; pinVersion?: number; developerPinVersion?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly config: ConfigService,
    @InjectModel(User.name) private readonly users: Model<User>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthUser> {
    if (payload.purpose === 'admin-pin') throw new UnauthorizedException('PIN challenge is not a session token');
    const user = await this.users.findById(payload.sub)
      .select('tenantId role email name isActive superAdmin pinVersion +developerPinVersion +developerPinHash');
    if (!user || !user.isActive) throw new UnauthorizedException('Account is inactive');
    const isDeveloper = payload.authSource === 'developer'
      && user.role === Role.Owner
      && isConfiguredDeveloper(user.email, this.config.get<string>('PLATFORM_DEVELOPER_EMAIL'))
      && user.superAdmin !== true
      && Boolean(user.developerPinHash)
      && payload.developerPinVersion === user.developerPinVersion;
    if (payload.authSource === 'developer' && !isDeveloper) {
      throw new UnauthorizedException('Developer access is no longer configured');
    }
    if (!isDeveloper && (user.role === Role.Owner || user.role === Role.Admin)) {
      if (payload.pinVerified !== true || payload.pinVersion === undefined) {
        throw new UnauthorizedException('Admin PIN verification is required');
      }
      if ((user.pinVersion ?? 0) !== payload.pinVersion) {
        throw new UnauthorizedException('PIN changed. Sign in again.');
      }
    }
    const isSuperAdmin = isPersistedSuperAdmin(user);
    return {
      userId: user.id, tenantId: user.tenantId.toString(), role: user.role,
      isSuperAdmin, isDeveloper, email: user.email, name: user.name,
    };
  }
}
