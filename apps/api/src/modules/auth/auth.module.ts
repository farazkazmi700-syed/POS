import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { TenantModule } from '../tenant/tenant.module';
import { AuthController } from './auth.controller';
import { EmailService } from './email.service';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { User, UserSchema } from './schemas/user.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
    PassportModule,
    JwtModule.register({}), // secrets/TTLs are passed per-token in AuthService
    TenantModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, EmailService, JwtStrategy],
})
export class AuthModule {}
