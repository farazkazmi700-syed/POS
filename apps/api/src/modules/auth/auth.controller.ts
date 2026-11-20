import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthUser } from '../../common/auth-user';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AllowDeveloperScope } from '../../common/decorators/developer-scope.decorator';
import { AllowSuspendedTenant } from '../../common/decorators/allow-suspended-tenant.decorator';
import { Role } from '../../common/enums';
import { AuthService } from './auth.service';
import { PasswordRecoveryService } from './password-recovery.service';
import { RecoveryService } from './recovery.service';
import {
  CompletePinLoginDto, CreateStaffDto, DeveloperLoginDto, DeveloperSetupPasswordDto, ForgotPasswordDto, LoginDto, PinResetDto, PinResetRequestDto, RefreshDto, RegisterDto,
  UpdateProfileDto, UpdateStaffRightsDto, UpdateStaffStatusDto, VerifyEmailCodeDto, VerifyRecoveryDto,
  AdminResetStaffDto, ChangePasswordDto, RecoverOfflineDto, ResetPasswordDto,
} from './dto/auth.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService, private readonly recovery: RecoveryService, private readonly passwordRecovery: PasswordRecoveryService) {}

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Post('developer/login')
  developerLogin(@Body() dto: DeveloperLoginDto) {
    return this.auth.developerLogin(dto);
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('developer/setup-password')
  setupPassword(@Body() dto: DeveloperSetupPasswordDto) {
    return this.auth.setupPassword(dto);
  }

  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Post('login/pin')
  completePinLogin(@Body() dto: CompletePinLoginDto) {
    return this.auth.completePinLogin(dto);
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('pin/reset/request')
  requestPinReset(@Body() dto: PinResetRequestDto) {
    return this.recovery.request({ email: dto.email, purpose: 'pin', channel: 'email' });
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('pin/reset')
  resetPin(@Body() dto: PinResetDto) {
    return this.recovery.confirmLegacyPin(dto.email, dto.code, dto.newPin);
  }

  @Public()
  @Post('refresh')
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @ApiBearerAuth()
  @Get('me')
  @AllowDeveloperScope()
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.userId, user.isDeveloper);
  }

  @ApiBearerAuth()
  @Patch('me')
  updateProfile(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.auth.updateProfile(user.userId, dto);
  }

  @ApiBearerAuth()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('me/verify-recovery')
  verifyRecovery(@CurrentUser() user: AuthUser, @Body() dto: VerifyRecoveryDto) {
    return this.auth.verifyRecovery(user.userId, dto);
  }

  @ApiBearerAuth()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('me/verify-recovery/confirm')
  confirmRecoveryEmail(@CurrentUser() user: AuthUser, @Body() dto: VerifyEmailCodeDto) {
    return this.auth.confirmRecoveryEmail(user.userId, dto);
  }

  @ApiBearerAuth()
  @Roles(Role.Owner, Role.Admin)
  @Post('staff')
  createStaff(@CurrentUser() user: AuthUser, @Body() dto: CreateStaffDto) {
    return this.auth.createStaff(user.tenantId, dto, user);
  }

  @ApiBearerAuth()
  @Roles(Role.Owner, Role.Admin)
  @Get('staff')
  listStaff(@CurrentUser() user: AuthUser) {
    return this.auth.listStaff(user.tenantId, user);
  }

  @ApiBearerAuth()
  @Roles(Role.Owner, Role.Admin)
  @Patch('staff/:id/rights')
  updateStaffRights(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string, @Body() dto: UpdateStaffRightsDto) {
    return this.auth.updateStaffRights(user.tenantId, id, dto.moduleRights, user, dto.permissions, dto.branchIds);
  }

  @ApiBearerAuth() @Roles(Role.Owner, Role.Admin) @Patch('staff/:id/status')
  updateStaffStatus(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string, @Body() dto: UpdateStaffStatusDto) { return this.auth.updateStaffStatus(user, id, dto.isActive); }

  @ApiBearerAuth() @Post('logout') @AllowDeveloperScope() @AllowSuspendedTenant()
  logout(@CurrentUser() user: AuthUser) { return this.auth.revokeSessions(user.userId); }

  // ------------------------------------------------------------------
  // Hybrid password recovery (online SMTP token + offline recovery codes)
  // ------------------------------------------------------------------

  /** Requests an email reset link. The response never reveals account existence. */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.passwordRecovery.requestEmailReset(dto.email);
  }

  /** Consumes a single-use email token, sets the new Argon2id hash and revokes sessions. */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.passwordRecovery.confirmEmailReset(dto.token, dto.newPassword);
  }

  /** Offline recovery: account email + one unused single-use recovery code, no internet needed. */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('recover-offline')
  recoverOffline(@Body() dto: RecoverOfflineDto) {
    return this.passwordRecovery.recoverOffline(dto.email, dto.recoveryCode, dto.newPassword);
  }

  /** Authenticated password change: verifies the current password and revokes other sessions. */
  @ApiBearerAuth()
  @AllowDeveloperScope()
  @AllowSuspendedTenant()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('change-password')
  changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(user, dto.currentPassword, dto.newPassword);
  }

  /** Owner/admin reset of a staff password; requires the administrator's own password. */
  @ApiBearerAuth()
  @Roles(Role.Owner, Role.Admin)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('admin/reset-staff')
  adminResetStaff(@CurrentUser() user: AuthUser, @Body() dto: AdminResetStaffDto) {
    return this.passwordRecovery.adminResetStaff(
      { userId: user.userId, tenantId: user.tenantId, role: user.role },
      dto.staffId,
      dto.adminPassword,
    );
  }

  /** Regenerates this account's offline recovery codes; previous codes are invalidated. */
  @ApiBearerAuth()
  @AllowDeveloperScope()
  @AllowSuspendedTenant()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('recovery-codes/rotate')
  rotateRecoveryCodes(@CurrentUser() user: AuthUser) {
    return this.passwordRecovery.rotateRecoveryCodes(user.userId).then((codes) => ({ recoveryCodes: codes, message: 'Store these codes somewhere safe. Each works once and replaces all previous codes.' }));
  }

  /** How many unused offline recovery codes this account still has. */
  @ApiBearerAuth()
  @AllowDeveloperScope()
  @AllowSuspendedTenant()
  @Get('recovery-codes/count')
  recoveryCodeCount(@CurrentUser() user: AuthUser) {
    return this.passwordRecovery.remainingRecoveryCodes(user.userId).then((remaining) => ({ remaining }));
  }
}
