import {
  BadRequestException, ConflictException, ForbiddenException, HttpException, HttpStatus, Injectable, Logger,
  NotFoundException, ServiceUnavailableException, UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { randomBytes, randomInt, randomUUID } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { Model } from 'mongoose';
import { Role } from '../../common/enums';
import { AuthUser } from '../../common/auth-user';
import { permittedActions } from '../../common/action-permissions';
import { BranchService } from '../branch/branch.module';
import { oid } from '../../common/object-id';
import {
  hasTenantAccess, isConfiguredDeveloper, isDeveloperSetupAuthorized, isPublicBusinessRegistrationClosed,
} from '../../common/security-access';
import { TenantService } from '../tenant/tenant.service';
import {
  CompletePinLoginDto, CreateStaffDto, DeveloperLoginDto, DeveloperSetupPasswordDto, LoginDto, PinResetDto, PinResetRequestDto, RegisterDto,
  UpdateProfileDto, VerifyEmailCodeDto, VerifyRecoveryDto,
} from './dto/auth.dto';
import { EmailService } from './email.service';
import { PasswordHashingService } from './password-hashing.service';
import { PasswordRecoveryService, validatePasswordPolicy } from './password-recovery.service';
import { RecoveryService } from './recovery.service';
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
    private readonly recovery: RecoveryService,
    private readonly passwordHashing: PasswordHashingService,
    private readonly passwordRecovery: PasswordRecoveryService,
    private readonly branches: BranchService,
  ) {}

  /** Creates a new business (tenant) together with its owner account. */
  async register(dto: RegisterDto) {
    validatePasswordPolicy(dto.password);
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
        passwordHash: await this.passwordHashing.hashPassword(dto.password), pinHash: await bcrypt.hash('0000', 12),
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
    if (!user || !user.passwordHash || !(await this.passwordHashing.verifyPassword(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }
    // Transparent legacy-bcrypt-to-Argon2id upgrade after a successful verify.
    if (this.passwordHashing.needsUpgrade(user.passwordHash)) {
      await this.users.updateOne({ _id: user._id }, { $set: { passwordHash: await this.passwordHashing.hashPassword(dto.password) } });
    }
    if (user.role === Role.Owner && isConfiguredDeveloper(user.email, this.config.get<string>('PLATFORM_DEVELOPER_EMAIL'))) {
      throw new UnauthorizedException('Use the Developer sign-in route');
    }
    await this.assertTenantAccess(user);
    if (user.role === Role.Owner || user.role === Role.Admin || user.pinEnabled) {
      return this.beginPinChallenge(user);
    }
    return this.issueTokens(user);
  }

  async developerLogin(dto: DeveloperLoginDto) {
    const configuredEmail = this.config.get<string>('PLATFORM_DEVELOPER_EMAIL');
    if (!configuredEmail) {
      throw new UnauthorizedException('Developer access is not configured');
    }
    const email = configuredEmail.trim().toLowerCase();
    if (dto.email.trim().toLowerCase() !== email) {
      throw new UnauthorizedException('Invalid developer credentials');
    }
    const user = await this.users.findOne({ email, role: Role.Owner, superAdmin: { $ne: true }, isActive: true })
      .select('+passwordHash +pinLockedUntil +pinFailedAttempts +developerSessionVersion');
    if (!user) {
      throw new UnauthorizedException('Developer account not found');
    }
    if (user.pinLockedUntil && user.pinLockedUntil.getTime() > Date.now()) throw new HttpException('Developer access temporarily locked', HttpStatus.TOO_MANY_REQUESTS);
    const passwordHash = user.passwordHash;
    if (!passwordHash || !(await this.passwordHashing.verifyPassword(dto.password, passwordHash))) {
      const failed = (user.pinFailedAttempts ?? 0) + 1;
      await this.users.updateOne({ _id: user._id }, { $inc: { pinFailedAttempts: 1 }, ...(failed >= 5 ? { $set: { pinLockedUntil: new Date(Date.now() + 15 * 60_000) } } : {}) });
      throw new UnauthorizedException('Invalid developer credentials');
    }
    if (this.passwordHashing.needsUpgrade(passwordHash)) {
      await this.users.updateOne({ _id: user._id }, { $set: { passwordHash: await this.passwordHashing.hashPassword(dto.password) } });
    }
    await this.assertTenantAccess(user);
    await this.users.updateOne({ _id: user._id }, { $set: { pinFailedAttempts: 0, pinLockedUntil: null } });
    return this.issueTokens(user, true);
  }

  /** One-time developer password setup. Authorized via the configured email + setup token. */
  async setupPassword(dto: DeveloperSetupPasswordDto) {
    const configuredEmail = this.config.get<string>('PLATFORM_DEVELOPER_EMAIL');
    const configuredToken = this.config.get<string>('PLATFORM_DEVELOPER_SETUP_TOKEN');
    if (!isDeveloperSetupAuthorized(dto.email, configuredEmail, dto.setupToken, configuredToken)) {
      throw new UnauthorizedException('Developer setup not authorized');
    }
    validatePasswordPolicy(dto.password);
    const email = dto.email.trim().toLowerCase();
    const passwordHash = await this.passwordHashing.hashPassword(dto.password);
    let user = await this.users.findOne({
      email,
      role: Role.Owner,
      superAdmin: { $ne: true },
      isActive: true,
    });
    if (!user) {
      const tenant = await this.tenants.create({ name: 'Developer Console', featureFlags: { pos: false, inventory: false, reports: false, customers: false, installments: false, barcodes: false } });
      try { user = await this.users.create({ tenantId: tenant._id, name: 'Platform Developer', email, passwordHash, role: Role.Owner, isActive: true }); }
      catch (error) { await this.tenants.delete(tenant.id); throw error; }
    }
    const updated = await this.users.updateOne(
      { _id: user._id, isActive: true },
      {
        $set: { passwordHash, pinFailedAttempts: 0, pinLockedUntil: null },
        $unset: { developerPinHash: 1, developerStarterHash: 1 },
        $inc: { sessionVersion: 1, developerSessionVersion: 1 },
      },
    );
    if (!updated.matchedCount) throw new UnauthorizedException('Developer account is inactive');
    return { email, passwordSet: true as const };
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
    if (!user || (user.role !== Role.Owner && user.role !== Role.Admin && !user.pinEnabled) || user.pinChallengeId !== payload.jti || !user.pinHash) {
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
    return this.recovery.request({ email: dto.email, purpose: 'pin', channel: 'email' });
  }

  async resetPin(dto: PinResetDto) {
    return this.recovery.confirmLegacyPin(dto.email, dto.code, dto.newPin);
  }

  async refresh(refreshToken: string) {
    try {
      const payload = await this.jwt.verifyAsync<{
        sub: string; pinVerified?: boolean; pinVersion?: number; authSource?: string; developerSessionVersion?: number; sessionVersion?: number;
      }>(refreshToken, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
      const user = await this.users.findOne({ _id: payload.sub, isActive: true })
        .select('+pinHash +pinChallengeId +developerSessionVersion');
      if (!user) throw new Error('inactive');
      if ((payload.sessionVersion ?? 0) !== (user.sessionVersion ?? 0)) throw new Error('Session revoked');
      if (payload.authSource === 'developer') {
        if (user.role !== Role.Owner || user.superAdmin === true
          || payload.developerSessionVersion !== user.developerSessionVersion
          || !isConfiguredDeveloper(user.email, this.config.get<string>('PLATFORM_DEVELOPER_EMAIL'))) {
          throw new Error('developer account changed');
        }
        await this.assertTenantAccess(user);
        return this.issueTokens(user, true);
      }
      await this.assertTenantAccess(user);
      if ((user.role === Role.Owner || user.role === Role.Admin || user.pinEnabled)
        && (payload.pinVerified !== true || payload.pinVersion !== (user.pinVersion ?? 0))) {
        return this.beginPinChallenge(user);
      }
      return this.issueTokens(user);
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async createStaff(tenantId: string, dto: CreateStaffDto, actor?: AuthUser) {
    validatePasswordPolicy(dto.password);
    this.assertGrantableRights(dto.moduleRights, actor);
    if (dto.branchIds) {
      if (!actor || (actor.role !== Role.Owner && dto.branchIds.some((id) => !actor.branchIds?.includes(id)))) throw new ForbiddenException('Branch grant is outside your scope');
      await Promise.all(dto.branchIds.map((id) => this.branches.validate(tenantId, id)));
    }
    const email = dto.email.toLowerCase();
    if (await this.users.exists({ email })) throw new ConflictException('Email already registered');
    const user = await this.users.create({
      tenantId: oid(tenantId), name: dto.name, email,
      passwordHash: await this.passwordHashing.hashPassword(dto.password),
      ...(dto.role === Role.Admin ? { pinHash: await bcrypt.hash('0000', 12), pinRequiresChange: true } : {}),
      role: dto.role,
      moduleRights: dto.moduleRights ?? [],
      branchIds: (dto.branchIds ?? []).map(oid),
      ...(actor?.role === Role.Admin ? { permissions: [...permittedActions(actor)] } : {}),
    });
    return this.publicUser(user);
  }

  async updateStaffRights(actorTenantId: string, staffId: string, moduleRights: string[], actor?: AuthUser, permissions?: string[], branchIds?: string[]) {
    const staff = await this.users.findOne({ _id: staffId, tenantId: oid(actorTenantId), role: { $ne: Role.Owner } });
    if (!staff) throw new NotFoundException('Staff member not found');
    if (actor?.role === Role.Admin && staff.role === Role.Admin && staff.id !== actor.userId) throw new ForbiddenException('Only the business owner can manage another admin account');
    if (actor?.role === Role.Admin && staff.branchIds?.some((id) => !actor.branchIds?.includes(String(id)))) throw new ForbiddenException('Staff account is outside your branch scope');
    // Preserve existing grants outside an admin's own scope; reject only new grants.
    this.assertGrantableRights(moduleRights, actor, staff.moduleRights);
    staff.moduleRights = [...new Set(moduleRights)];
    if (permissions) {
      if (!actor || permissions.some((permission) => !permittedActions(actor).includes(permission))) throw new ForbiddenException('You cannot grant actions outside your own permissions');
      staff.permissions = [...new Set(permissions)];
    }
    if (branchIds) {
      if (!actor || (actor.role !== Role.Owner && branchIds.some((id) => !actor.branchIds?.includes(id)))) throw new ForbiddenException('You cannot grant access to an unassigned branch');
      await Promise.all(branchIds.map((id) => this.branches.validate(actorTenantId, id)));
      staff.branchIds = [...new Set(branchIds)].map(oid);
    }
    await staff.save();
    return this.publicUser(staff);
  }

  async listStaff(tenantId: string, actor?: AuthUser) {
    const users = await this.users.find({ tenantId: oid(tenantId), ...(actor?.role === Role.Admin && actor.branchIds?.length ? { $or: [{ branchIds: { $in: actor.branchIds.map(oid) } }, { _id: oid(actor.userId) }] } : {}) }).sort({ createdAt: 1 });
    return users.map((u) => this.publicUser(u));
  }

  async updateStaffStatus(actor: AuthUser, staffId: string, isActive: boolean) {
    if (actor.userId === staffId) throw new BadRequestException('You cannot disable your own account');
    const target = await this.users.findOne({ _id: staffId, tenantId: oid(actor.tenantId) });
    if (!target || target.role === Role.Owner) throw new NotFoundException('Staff member not found');
    if (actor.role === Role.Admin && target.role === Role.Admin) throw new ForbiddenException('Only the owner can manage another admin account');
    if (actor.role === Role.Admin && target.branchIds?.some((id) => !actor.branchIds?.includes(String(id)))) throw new ForbiddenException('Staff account is outside your branch scope');
    const staff = await this.users.findOneAndUpdate({ _id: staffId, tenantId: oid(actor.tenantId), role: { $ne: Role.Owner }, superAdmin: { $ne: true } }, { $set: { isActive }, $inc: { sessionVersion: 1 } }, { new: true });
    if (!staff) throw new NotFoundException('Staff member not found');
    return this.publicUser(staff);
  }

  async revokeSessions(userId: string) {
    await this.users.updateOne({ _id: userId }, { $inc: { sessionVersion: 1, developerSessionVersion: 1 } });
    return { revoked: true };
  }

  /** Authenticated self-service password change (requires current password). */
  async changePassword(actor: AuthUser, currentPassword: string, newPassword: string) {
    const user = await this.users.findOne({ _id: actor.userId, isActive: true }).select('+passwordHash');
    if (!user || !user.passwordHash || !(await this.passwordHashing.verifyPassword(currentPassword, user.passwordHash))) {
      throw new BadRequestException('Your current password is incorrect.');
    }
    validatePasswordPolicy(newPassword);
    const passwordHash = await this.passwordHashing.hashPassword(newPassword);
    const updated = await this.users.updateOne(
      { _id: user._id, isActive: true, passwordHash: user.passwordHash },
      {
        $set: { passwordHash, passwordRequiresChange: false },
        $inc: { sessionVersion: 1, developerSessionVersion: 1, pinVersion: 1 },
        $unset: { pinChallengeId: 1 },
      },
    );
    if (!updated.modifiedCount) throw new ConflictException('Account changed. Sign in again.');
    return { message: 'Password changed. Sign in with your new password.' };
  }

  /** Whether the signed-in account must establish a new password (admin reset enrollment). */
  async passwordChangeRequired(userId: string): Promise<boolean> {
    const user = await this.users.findOne({ _id: userId }).select('+enrollmentExpiresAt');
    if (!user?.passwordRequiresChange) return false;
    if (user.enrollmentExpiresAt && user.enrollmentExpiresAt.getTime() <= Date.now()) {
      await this.users.updateOne({ _id: user._id }, { $set: { isActive: false } });
      return false;
    }
    return true;
  }

  private assertGrantableRights(rights: string[] | undefined, actor?: AuthUser, existing: string[] = []) {
    if (actor?.role === Role.Admin && actor.moduleRights !== undefined
      && (!rights || rights.some((right) => !actor.moduleRights!.includes(right) && !existing.includes(right)))) {
      throw new ForbiddenException('You can only grant module rights assigned to your own account');
    }
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
      if (phone !== user.phone) {
        user.phone = phone;
        user.phoneVerified = false;
        user.phoneVerifiedAt = null;
      }
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
      return this.recovery.requestPhone(userId);
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
      phoneVerified: Boolean(user.phoneVerified && user.phoneVerifiedAt),
      role: user.role, isActive: user.isActive, isSuperAdmin: user.superAdmin === true,
      moduleRights: Array.isArray(user.moduleRights) ? user.moduleRights : undefined,
      permissions: permittedActions(user),
      branchIds: user.branchIds?.map(String) ?? [],
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
    const base = { sub: user.id, tenantId: user.tenantId.toString(), sessionVersion: user.sessionVersion ?? 0 };
    const pinVerified = !developerSession && (user.role === Role.Owner || user.role === Role.Admin || user.pinEnabled);
    const accessToken = await this.jwt.signAsync(
      {
        ...base, role: user.role, email: user.email, name: user.name,
        ...(developerSession ? { authSource: 'developer', developerSessionVersion: user.developerSessionVersion ?? 0 } : {}),
        ...(pinVerified ? { pinVerified: true, pinVersion: user.pinVersion ?? 0 } : {}),
      },
      {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.config.get<string>('JWT_ACCESS_TTL', '15m') as never,
      },
    );
    const refreshToken = await this.jwt.signAsync({
      ...base,
      ...(developerSession ? { authSource: 'developer', developerSessionVersion: user.developerSessionVersion ?? 0 } : {}),
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
    if (!tenant || tenant.trashedAt || !hasTenantAccess(tenant.status, hasGlobalAccess)) {
      throw new UnauthorizedException('Business is suspended or unavailable');
    }
    if (!hasGlobalAccess && tenant.licenseExpiresAt && tenant.licenseExpiresAt.getTime() <= Date.now()) throw new UnauthorizedException('Business license has expired');
  }

  private newEmailCode(): string {
    return String(randomInt(100_000, 1_000_000));
  }
}
