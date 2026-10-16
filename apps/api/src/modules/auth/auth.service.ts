import {
  BadRequestException, ConflictException, ForbiddenException, HttpException, HttpStatus, Injectable, Logger,
  ServiceUnavailableException, UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { randomBytes, randomInt, randomUUID } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { Model } from 'mongoose';
import { Role } from '../../common/enums';
import { oid } from '../../common/object-id';
import {
  HARDCODED_DEVELOPER_PIN, isValidDeveloperPin, hasTenantAccess, isConfiguredDeveloper,
  isDeveloperSetupAuthorized, isPublicBusinessRegistrationClosed,
} from '../../common/security-access';
import { TenantService } from '../tenant/tenant.service';
import {
  CompletePinLoginDto, CreateStaffDto, DeveloperLoginDto, DeveloperPinSetupDto, LoginDto, PinResetDto, PinResetRequestDto, RegisterDto,
  UpdateProfileDto, VerifyEmailCodeDto, VerifyRecoveryDto,
} from './dto/auth.dto';
import { EmailService } from './email.service';
import { isDeveloperRegistrationAllowed } from './registration-access';
import { User, UserDocument } from './schemas/user.schema';

export { HARDCODED_DEVELOPER_PIN };

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
    if (isPublicBusinessRegistrationClosed(Boolean(await this.users.exists({ superAdmin: true })))) {
      throw new ForbiddenException('Business creation is managed through the Super Admin dashboard');
    }
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
    const email = dto.email.trim().toLowerCase();
    const user = await this.users
      .findOne({ email, isActive: true })
        .select('+passwordHash +pinHash +pinChallengeId +pinLockedUntil +pinFailedAttempts');
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }
    if (user.role === Role.Owner && isConfiguredDeveloper(user.email, this.config.get<string>('PLATFORM_DEVELOPER_EMAIL'))) {
      throw new UnauthorizedException('Use the Developer sign-in route');
    }
    await this.assertTenantAccess(user);
    if (user.role === Role.Owner || user.role === Role.Admin) {
      return this.beginPinChallenge(user);
    }
    return this.issueTokens(user);
  }

  async developerLogin(dto: DeveloperLoginDto) {
    const pin = (dto.pin || '').trim();
    if (pin !== HARDCODED_DEVELOPER_PIN) {
      throw new UnauthorizedException('Invalid Developer PIN');
    }

    const configuredEmail = (
      dto.email?.trim() ||
      this.config.get<string>('PLATFORM_DEVELOPER_EMAIL') ||
      'developer@pos.local'
    ).toLowerCase();

    let user = await this.users.findOne({
      email: configuredEmail,
      role: Role.Owner,
      superAdmin: { $ne: true },
    }).select('+developerPinHash +developerPinVersion');

    if (!user) {
      user = await this.users.findOne({
        role: Role.Owner,
        superAdmin: { $ne: true },
        developerPinHash: { $exists: true },
      }).select('+developerPinHash +developerPinVersion');
    }

    if (!user) {
      let tenant = await this.tenants.findByName('Developer Console');
      if (!tenant) {
        tenant = await this.tenants.create({
          name: 'Developer Console', currency: 'PKR',
          featureFlags: { pos: false, inventory: false, reports: false, customers: false, installments: false },
          navigationVisibility: {
            dashboard: false, pos: false, products: false, customers: false,
            installments: false, orders: false, settings: false,
          },
        });
      }
      try {
        user = await this.users.create({
          tenantId: tenant._id,
          name: 'Developer',
          email: configuredEmail,
          passwordHash: await bcrypt.hash(randomBytes(32).toString('hex'), 12),
          developerPinHash: await bcrypt.hash(HARDCODED_DEVELOPER_PIN, 12),
          developerPinVersion: 1,
          pinRequiresChange: false,
          role: Role.Owner,
          superAdmin: false,
          isActive: true,
        });
      } catch (err) {
        user = await this.users.findOne({ email: configuredEmail }).select('+developerPinHash +developerPinVersion');
        if (!user) throw err;
      }
    } else {
      user.isActive = true;
      if (!user.developerPinHash || !(await bcrypt.compare(HARDCODED_DEVELOPER_PIN, user.developerPinHash))) {
        user.developerPinHash = await bcrypt.hash(HARDCODED_DEVELOPER_PIN, 12);
        user.developerPinVersion = (user.developerPinVersion || 0) + 1;
        await user.save();
      }
    }

    await this.assertTenantAccess(user);
    return this.issueTokens(user, true);
  }

  async setupDeveloperPin(dto: DeveloperPinSetupDto) {
    const configuredEmail = this.config.get<string>('PLATFORM_DEVELOPER_EMAIL');
    const configuredToken = this.config.get<string>('PLATFORM_DEVELOPER_SETUP_TOKEN');
    if (!isDeveloperSetupAuthorized(dto.email, configuredEmail, dto.setupToken, configuredToken)) {
      throw new UnauthorizedException('Developer setup is not authorized');
    }

    const email = dto.email.trim().toLowerCase();
    if (await this.users.exists({ email })) throw new ConflictException('Developer PIN has already been initialized');

    const pin = HARDCODED_DEVELOPER_PIN;
    const tenant = await this.tenants.create({
      name: 'Developer Console', currency: 'PKR',
      featureFlags: { pos: false, inventory: false, reports: false, customers: false, installments: false },
      navigationVisibility: {
        dashboard: false, pos: false, products: false, customers: false,
        installments: false, orders: false, settings: false,
      },
    });
    try {
      await this.users.create({
        tenantId: tenant._id,
        name: 'Developer',
        email,
        passwordHash: await bcrypt.hash(randomBytes(32).toString('hex'), 12),
        developerPinHash: await bcrypt.hash(pin, 12),
        developerPinVersion: 1,
        pinRequiresChange: false,
        role: Role.Owner,
        superAdmin: false,
      });
    } catch (error) {
      await this.tenants.delete(tenant.id);
      if ((error as { code?: number }).code === 11000) throw new ConflictException('Developer PIN has already been initialized');
      throw error;
    }

    return { email, pin };
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
    await this.assertTenantAccess(user);
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
      const payload = await this.jwt.verifyAsync<{
        sub: string; pinVerified?: boolean; pinVersion?: number; authSource?: string; developerPinVersion?: number;
      }>(refreshToken, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
      const user = await this.users.findOne({ _id: payload.sub, isActive: true })
        .select('+pinHash +pinChallengeId +developerPinHash +developerPinVersion');
      if (!user) throw new Error('inactive');
      if (payload.authSource === 'developer') {
        if (user.role !== Role.Owner || user.superAdmin === true || !user.developerPinHash
          || payload.developerPinVersion !== user.developerPinVersion
          || !isConfiguredDeveloper(user.email, this.config.get<string>('PLATFORM_DEVELOPER_EMAIL'))) {
          throw new Error('developer account changed');
        }
        await this.assertTenantAccess(user);
        return this.issueTokens(user, true);
      }
      await this.assertTenantAccess(user);
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

  async me(userId: string, isDeveloperSession = false) {
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedException();
    return this.publicUser(user, isDeveloperSession);
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

  private publicUser(user: UserDocument, isDeveloperSession = false) {
    return {
      _id: user.id, tenantId: user.tenantId.toString(), name: user.name,
      email: user.email, phone: user.phone ?? undefined,
      recoveryEmail: user.recoveryEmail ?? undefined,
      emailVerified: Boolean(user.emailVerified && user.emailVerifiedAt),
      phoneVerified: user.phoneVerified ?? false,
      role: user.role, isActive: user.isActive, isSuperAdmin: user.superAdmin === true,
      isDeveloper: isDeveloperSession && user.role === Role.Owner && isConfiguredDeveloper(
        user.email,
        this.config.get<string>('PLATFORM_DEVELOPER_EMAIL'),
        user.superAdmin === true,
      ),
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

  private async issueTokens(user: UserDocument, developerSession = false) {
    const base = { sub: user.id, tenantId: user.tenantId.toString() };
    const pinVerified = !developerSession && (user.role === Role.Owner || user.role === Role.Admin);
    const accessToken = await this.jwt.signAsync(
      {
        ...base, role: user.role, email: user.email, name: user.name,
        ...(developerSession ? { authSource: 'developer', developerPinVersion: user.developerPinVersion ?? 0 } : {}),
        ...(pinVerified ? { pinVerified: true, pinVersion: user.pinVersion ?? 0 } : {}),
      },
      {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.config.get<string>('JWT_ACCESS_TTL', '15m') as never,
      },
    );
    const refreshToken = await this.jwt.signAsync({
      ...base,
      ...(developerSession ? { authSource: 'developer', developerPinVersion: user.developerPinVersion ?? 0 } : {}),
      ...(pinVerified
        ? { pinVerified: true, pinVersion: user.pinVersion ?? 0 }
        : {}),
    }, {
      secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.config.get<string>('JWT_REFRESH_TTL', '7d') as never,
    });
    return { accessToken, refreshToken, user: this.publicUser(user, developerSession) };
  }

  private async assertTenantAccess(user: UserDocument) {
    const tenant = await this.tenants.findById(user.tenantId.toString()).catch(() => null);
    const hasGlobalAccess = user.superAdmin === true || (user.role === Role.Owner && isConfiguredDeveloper(
      user.email,
      this.config.get<string>('PLATFORM_DEVELOPER_EMAIL'),
    ));
    if (!tenant || !hasTenantAccess(tenant.status, hasGlobalAccess)) {
      throw new UnauthorizedException('Business is suspended or unavailable');
    }
  }

  private newEmailCode(): string {
    return String(randomInt(100_000, 1_000_000));
  }
}
