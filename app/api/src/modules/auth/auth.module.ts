import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { TenantModule } from '../tenant/tenant.module';
import { AuthController } from './auth.controller';
import { EmailService } from './email.service';
import { AuthService } from './auth.service';
import { PasswordHashingService } from './password-hashing.service';
import { PasswordRecoveryService } from './password-recovery.service';
import { JwtStrategy } from './jwt.strategy';
import { User, UserSchema } from './schemas/user.schema';
import { RecoveryModule } from './recovery.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
    PassportModule,
    JwtModule.register({}), // secrets/TTLs are passed per-token in AuthService
    TenantModule,
    RecoveryModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, EmailService, JwtStrategy, PasswordHashingService, PasswordRecoveryService],
})
export class AuthModule {}
