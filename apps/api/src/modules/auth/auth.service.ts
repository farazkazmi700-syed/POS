import {
  BadRequestException, ConflictException, HttpException, HttpStatus, Injectable, Logger,
  ServiceUnavailableException, UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { randomInt, randomUUID } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { Model } from 'mongoose';
import { Role } from '../../common/enums';
import { oid } from '../../common/object-id';
import { TenantService } from '../tenant/tenant.service';
import {
  CompletePinLoginDto, CreateStaffDto, LoginDto, PinResetDto, PinResetRequestDto, RegisterDto,
  UpdateProfileDto, VerifyEmailCodeDto, VerifyRecoveryDto,
} from './dto/auth.dto';
import { EmailService } from './email.service';
import { isDeveloperRegistrationAllowed } from './registration-access';
import { User, UserDocument } from './schemas/user.schema';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectModel(User.name) private readonly users: Model<User>,
    private readonly tenants: TenantService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly email: EmailService,
  ) {}

  /** Creates a new business (tenant) together with its owner account. */
  async register(dto: RegisterDto) {
    const email = dto.email.toLowerCase();
    if (!(await isDeveloperRegistrationAllowed(
      dto.developerEmail,
      dto.developerPassword,
      this.config.get<string>('DEV_ACCOUNT_EMAIL'),
      this.config.get<string>('DEV_ACCOUNT_PASSWORD_HASH'),
    ))) {
      throw new UnauthorizedException('Business registration is restricted to authorized developers');
    }
    if (await this.users.exists({ email })) throw new ConflictException('Email already registered');

    const tenant = await this.tenants.create({
      name: dto.businessName, domainType: dto.domainType,
      taxRegNo: dto.taxRegNo, address: dto.address, currency: dto.currency?.toUpperCase(),
    });
    try {
      const user = await this.users.create({
        tenantId: tenant._id, name: dto.ownerName, email,
        passwordHash: await bcrypt.hash(dto.password, 12), pinHash: await bcrypt.hash('0000', 12),
        pinRequiresChange: true, role: Role.Owner,
      });
      return { registered: true };
    } catch (err) {
      await this.tenants.delete(tenant.id); // don't leave an orphan tenant behind
      throw err;
    }
  }

  async login(dto: LoginDto) {
    const user = await this.users
      .findOne({ email: dto.email.toLowerCase(), isActive: true })
        .select('+passwordHash +pinHash +pinChallengeId +pinLockedUntil +pinFailedAttempts');
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }
    if (user.role === Role.Owner || user.role === Role.Admin) {
      return this.beginPinChallenge(user);
    }
    return this.issueTokens(user);
  }

  async completePinLogin(dto: CompletePinLoginDto) {
    let payload: { sub: string; purpose: string; jti: string };
    try {
      payload = await this.jwt.verifyAsync(dto.challengeToken, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('PIN challenge expired. Sign in again.');
    }
    if (payload.purpose !== 'admin-pin' || !payload.sub || !payload.jti) {
      throw new UnauthorizedException('Invalid PIN challenge');
    }

      const user = await this.users.findOne({ _id: payload.sub, isActive: true })
        .select('+pinHash +pinChallengeId +pinLockedUntil +pinFailedAttempts');
    if (!user || (user.role !== Role.Owner && user.role !== Role.Admin) || user.pinChallengeId !== payload.jti || !user.pinHash) {
      throw new UnauthorizedException('Invalid PIN challenge');
    }
    if (user.pinLockedUntil && user.pinLockedUntil.getTime() > Date.now()) {
      throw new HttpException('PIN temporarily locked. Try again later or reset it by email.', HttpStatus.TOO_MANY_REQUESTS);
    }
    if (!(await bcrypt.compare(dto.pin, user.pinHash))) {
      const failedAttempts = (user.pinFailedAttempts ?? 0) + 1;
      await this.users.updateOne(
        { _id: user._id, pinChallengeId: payload.jti },
        {
          $set: {
            pinFailedAttempts: failedAttempts,
            ...(failedAttempts >= 5 ? { pinLockedUntil: new Date(Date.now() + 15 * 60_000) } : {}),
          },
        },
      );
      throw new UnauthorizedException('Invalid PIN');
    }
    if (user.pinRequiresChange && !dto.newPin) {
      throw new BadRequestException('Set a new PIN before continuing');
    }
    if (dto.newPin === '0000') throw new BadRequestException('Choose a PIN other than the default 0000');
    if (dto.newPin && await bcrypt.compare(dto.newPin, user.pinHash)) {
      throw new BadRequestException('Choose a PIN different from your current PIN');
    }

    const updated = await this.users.findOneAndUpdate(
      { _id: user._id, pinChallengeId: payload.jti },
      {
        $set: {
          pinHash: dto.newPin ? await bcrypt.hash(dto.newPin, 12) : user.pinHash,
          pinRequiresChange: false,
          pinFailedAttempts: 0,
          pinLockedUntil: null,
        },
        ...(dto.newPin ? { $inc: { pinVersion: 1 } } : {}),
        $unset: { pinChallengeId: 1 },
      },
      { new: true },
    );
    if (!updated) throw new UnauthorizedException('PIN challenge already used. Sign in again.');
    return this.issueTokens(updated);
  }

  async requestPinReset(dto: PinResetRequestDto) {
    const genericResponse = { message: 'If the account has a verified email, a PIN reset code has been sent.' };
    const user = await this.users.findOne({
      email: dto.email.toLowerCase(), isActive: true, role: { $in: [Role.Owner, Role.Admin] },
    }).select('+pinResetCodeHash +pinResetExpiresAt +pinResetAttempts');
    if (!user || !user.emailVerified || !user.emailVerifiedAt || !user.recoveryEmail) return genericResponse;

    const code = this.newEmailCode();
    user.pinResetCodeHash = await bcrypt.hash(code, 10);
    user.pinResetExpiresAt = new Date(Date.now() + 10 * 60_000);
    user.pinResetAttempts = 0;
    await user.save();
    try {
      await this.email.sendSecurityCode(user.recoveryEmail, code, 'PIN reset');
    } catch (error) {
      this.logger.error(`PIN reset email delivery failed: ${(error as Error).message}`);
      await this.users.updateOne({ _id: user._id }, { $unset: { pinResetCodeHash: 1, pinResetExpiresAt: 1 } });
    }
    return genericResponse;
  }

  async resetPin(dto: PinResetDto) {
    const user = await this.users.findOne({
      email: dto.email.toLowerCase(), isActive: true, role: { $in: [Role.Owner, Role.Admin] },
    }).select('+pinResetCodeHash +pinResetExpiresAt +pinResetAttempts');
    if (!user || !user.emailVerified || !user.emailVerifiedAt || !user.recoveryEmail
      || !user.pinResetCodeHash || !user.pinResetExpiresAt || user.pinResetExpiresAt.getTime() <= Date.now()
      || (user.pinResetAttempts ?? 0) >= 5) {
      throw new BadRequestException('Invalid or expired PIN reset code');
    }
    if (!(await bcrypt.compare(dto.code, user.pinResetCodeHash))) {
      user.pinResetAttempts = (user.pinResetAttempts ?? 0) + 1;
      if (user.pinResetAttempts >= 5) {
        user.pinResetCodeHash = undefined;
        user.pinResetExpiresAt = undefined;
      }
      await user.save();
      throw new BadRequestException('Invalid or expired PIN reset code');
    }
    if (dto.newPin === '0000') throw new BadRequestException('Choose a PIN other than the default 0000');

    const updated = await this.users.findOneAndUpdate(
      {
        _id: user._id,
        pinResetCodeHash: user.pinResetCodeHash,
        pinResetExpiresAt: { $gt: new Date() },
        pinResetAttempts: { $lt: 5 },
      },
      {
        $set: {
          pinHash: await bcrypt.hash(dto.newPin, 12),
          pinRequiresChange: false,
          pinFailedAttempts: 0,
          pinLockedUntil: null,
        },
        $inc: { pinVersion: 1 },
        $unset: { pinChallengeId: 1, pinResetCodeHash: 1, pinResetExpiresAt: 1 },
      },
      { new: true },
    );
    if (!updated) throw new BadRequestException('Invalid or expired PIN reset code');
    return { message: 'PIN reset successfully. Sign in with your new PIN.' };
  }

  async refresh(refreshToken: string) {
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; pinVerified?: boolean; pinVersion?: number }>(refreshToken, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
      const user = await this.users.findOne({ _id: payload.sub, isActive: true }).select('+pinHash +pinChallengeId');
      if (!user) throw new Error('inactive');
      if ((user.role === Role.Owner || user.role === Role.Admin)
        && (payload.pinVerified !== true || payload.pinVersion !== (user.pinVersion ?? 0))) {
        return this.beginPinChallenge(user);
      }
      return this.issueTokens(user);
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async createStaff(tenantId: string, dto: CreateStaffDto) {
    const email = dto.email.toLowerCase();
    if (await this.users.exists({ email })) throw new ConflictException('Email already registered');
    const user = await this.users.create({
      tenantId: oid(tenantId), name: dto.name, email,
      passwordHash: await bcrypt.hash(dto.password, 12),
      ...(dto.role === Role.Admin ? { pinHash: await bcrypt.hash('0000', 12), pinRequiresChange: true } : {}),
      role: dto.role,
    });
    return this.publicUser(user);
  }

  async listStaff(tenantId: string) {
    const users = await this.users.find({ tenantId: oid(tenantId) }).sort({ createdAt: 1 });
    return users.map((u) => this.publicUser(u));
  }

  async me(userId: string) {
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedException();
    return this.publicUser(user);
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedException();

    if (dto.name) user.name = dto.name.trim();
    if (dto.recoveryEmail !== undefined) {
      const recoveryEmail = dto.recoveryEmail ? dto.recoveryEmail.trim().toLowerCase() : null;
      if (recoveryEmail !== user.recoveryEmail) {
        user.recoveryEmail = recoveryEmail;
        user.emailVerified = false;
        user.emailVerifiedAt = null;
        user.emailVerificationCodeHash = undefined;
        user.emailVerificationExpiresAt = undefined;
        user.emailVerificationAttempts = 0;
      }
    }
    if (dto.phone !== undefined) {
      const phone = dto.phone ? dto.phone.trim() : null;
      user.phone = phone;
      user.phoneVerified = false;
    }

    await user.save();
    return this.publicUser(user);
  }

  async verifyRecovery(userId: string, dto: VerifyRecoveryDto) {
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedException();

    if (dto.type === 'email') {
      if (!user.recoveryEmail) throw new BadRequestException('Add a recovery email before verification.');
      const code = this.newEmailCode();
      user.emailVerificationCodeHash = await bcrypt.hash(code, 10);
      user.emailVerificationExpiresAt = new Date(Date.now() + 10 * 60_000);
      user.emailVerificationAttempts = 0;
      user.emailVerified = false;
      user.emailVerifiedAt = null;
      await user.save();
      try {
        await this.email.sendSecurityCode(user.recoveryEmail, code, 'email verification');
      } catch (error) {
        user.emailVerificationCodeHash = undefined;
        user.emailVerificationExpiresAt = undefined;
        await user.save();
        this.logger.error(`Email verification delivery failed: ${(error as Error).message}`);
        throw new ServiceUnavailableException('Could not send verification email. Check SMTP configuration.');
      }
      return { message: 'Verification code sent to your recovery email.' };
    }

    if (dto.type === 'phone') {
      if (!user.phone || user.phone.trim().length < 7) {
        throw new BadRequestException('Add a valid phone number before verification.');
      }
      user.phoneVerified = true;
    }

    await user.save();
    return this.publicUser(user);
  }

  async confirmRecoveryEmail(userId: string, dto: VerifyEmailCodeDto) {
    const user = await this.users.findById(userId)
      .select('+emailVerificationCodeHash +emailVerificationExpiresAt +emailVerificationAttempts');
    if (!user || !user.recoveryEmail || !user.emailVerificationCodeHash || !user.emailVerificationExpiresAt
      || user.emailVerificationExpiresAt.getTime() <= Date.now() || (user.emailVerificationAttempts ?? 0) >= 5) {
      throw new BadRequestException('Invalid or expired email verification code');
    }
    if (!(await bcrypt.compare(dto.code, user.emailVerificationCodeHash))) {
      user.emailVerificationAttempts = (user.emailVerificationAttempts ?? 0) + 1;
      if (user.emailVerificationAttempts >= 5) {
        user.emailVerificationCodeHash = undefined;
        user.emailVerificationExpiresAt = undefined;
      }
      await user.save();
      throw new BadRequestException('Invalid or expired email verification code');
    }
    user.emailVerified = true;
    user.emailVerifiedAt = new Date();
    user.emailVerificationCodeHash = undefined;
    user.emailVerificationExpiresAt = undefined;
    user.emailVerificationAttempts = 0;
    await user.save();
    return this.publicUser(user);
  }

  private publicUser(user: UserDocument) {
    return {
      _id: user.id, tenantId: user.tenantId.toString(), name: user.name,
      email: user.email, phone: user.phone ?? undefined,
      recoveryEmail: user.recoveryEmail ?? undefined,
      emailVerified: Boolean(user.emailVerified && user.emailVerifiedAt),
      phoneVerified: user.phoneVerified ?? false,
      role: user.role, isActive: user.isActive,
    };
  }

  private async beginPinChallenge(user: UserDocument) {
    if (!user.pinHash) {
      user.pinHash = await bcrypt.hash('0000', 12);
      user.pinRequiresChange = true;
    }
    const challengeId = randomUUID();
    user.pinChallengeId = challengeId;
    await user.save();
    const challengeToken = await this.jwt.signAsync(
      { sub: user.id, purpose: 'admin-pin', jti: challengeId },
      { secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'), expiresIn: '5m' },
    );
    return { requiresPin: true as const, challengeToken, pinRequiresChange: user.pinRequiresChange };
  }

  private async issueTokens(user: UserDocument) {
    const base = { sub: user.id, tenantId: user.tenantId.toString() };
    const pinVerified = user.role === Role.Owner || user.role === Role.Admin;
    const accessToken = await this.jwt.signAsync(
      {
        ...base, role: user.role, email: user.email, name: user.name,
        ...(pinVerified ? { pinVerified: true, pinVersion: user.pinVersion ?? 0 } : {}),
      },
      {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.config.get<string>('JWT_ACCESS_TTL', '15m') as never,
      },
    );
    const refreshToken = await this.jwt.signAsync({
      ...base,
      ...(pinVerified
        ? { pinVerified: true, pinVersion: user.pinVersion ?? 0 }
        : {}),
    }, {
      secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.config.get<string>('JWT_REFRESH_TTL', '7d') as never,
    });
    return { accessToken, refreshToken, user: this.publicUser(user) };
  }

  private newEmailCode(): string {
    return String(randomInt(100_000, 1_000_000));
  }
}
