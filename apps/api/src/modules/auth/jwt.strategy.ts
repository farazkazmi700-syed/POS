import { InjectModel } from '@nestjs/mongoose';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Model } from 'mongoose';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthUser } from '../../common/auth-user';
import { Role } from '../../common/enums';
import { User } from './schemas/user.schema';

interface JwtPayload {
  sub: string; tenantId: string; role: Role; email: string; name: string;
  purpose?: string; pinVerified?: boolean; pinVersion?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService, @InjectModel(User.name) private readonly users: Model<User>) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthUser> {
    if (payload.purpose === 'admin-pin') throw new UnauthorizedException('PIN challenge is not a session token');
    if (payload.role === Role.Owner || payload.role === Role.Admin) {
      if (payload.pinVerified !== true || payload.pinVersion === undefined) {
        throw new UnauthorizedException('Admin PIN verification is required');
      }
      const user = await this.users.findById(payload.sub).select('pinVersion isActive');
      if (!user || !user.isActive || (user.pinVersion ?? 0) !== payload.pinVersion) {
        throw new UnauthorizedException('PIN changed. Sign in again.');
      }
    }
    return {
      userId: payload.sub, tenantId: payload.tenantId, role: payload.role,
      email: payload.email, name: payload.name,
    };
  }
}
