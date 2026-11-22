import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsBoolean, IsEmail, IsEnum, IsIn, IsMongoId, IsOptional, IsString, Length, Matches, MaxLength, MinLength } from 'class-validator';
import { ACTIONS } from '../../../common/action-permissions';
import { DomainType, Role } from '../../../common/enums';

export class RegisterDto {
  @ApiProperty() @IsEmail() developerEmail: string;
  @ApiProperty() @IsString() @MinLength(8) @MaxLength(72) developerPassword: string;
  @ApiProperty() @IsString() @Length(2, 120) businessName: string;
  @ApiProperty({ enum: DomainType }) @IsEnum(DomainType) domainType: DomainType;
  @ApiProperty() @IsString() @Length(2, 80) ownerName: string;
  @ApiProperty() @IsEmail() email: string;
  @ApiProperty() @IsString() @MinLength(8) @MaxLength(72) password: string;
  @ApiPropertyOptional() @IsOptional() @IsString() taxRegNo?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() address?: string;
  @ApiPropertyOptional({ example: 'PKR' }) @IsOptional() @IsString() @Length(3, 3) currency?: string;
}

export class LoginDto {
  @ApiProperty() @IsEmail() email: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(254) password: string;
}

export class DeveloperLoginDto {
  @ApiProperty() @IsEmail() email: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(128) password: string;
}

export class DeveloperSetupPasswordDto {
  @ApiProperty() @IsEmail() email: string;
  @ApiProperty() @IsString() @MinLength(32) setupToken: string;
  @ApiProperty() @IsString() @MinLength(12) @MaxLength(128) password: string;
}

export class CompletePinLoginDto {
  @ApiProperty() @IsString() challengeToken: string;
  @ApiProperty() @IsString() @Matches(/^\d{4}$/) pin: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Matches(/^\d{4}$/) newPin?: string;
}

export class PinResetRequestDto {
  @ApiProperty() @IsEmail() email: string;
}

export class PinResetDto {
  @ApiProperty() @IsEmail() email: string;
  @ApiProperty() @IsString() @Matches(/^\d{6}$/) code: string;
  @ApiProperty() @IsString() @Matches(/^\d{4}$/) newPin: string;
}

export class VerifyEmailCodeDto {
  @ApiProperty() @IsString() @Matches(/^\d{6}$/) code: string;
}

export class RefreshDto {
  @ApiProperty() @IsString() refreshToken: string;
}

export class UpdateProfileDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(2, 80) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() recoveryEmail?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(7, 32) phone?: string | null;
}

export class VerifyRecoveryDto {
  @ApiProperty({ enum: ['email', 'phone'] }) @IsEnum(['email', 'phone'] as const) type: 'email' | 'phone';
}

export class CreateStaffDto {
  @IsOptional() @IsArray() @ArrayMaxSize(100) @IsMongoId({ each: true }) branchIds?: string[];
  @ApiProperty() @IsString() @Length(2, 80) name: string;
  @ApiProperty() @IsEmail() email: string;
  @ApiProperty() @IsString() @MinLength(8) @MaxLength(72) password: string;
  @ApiProperty({ enum: [Role.Admin, Role.Cashier] }) @IsIn([Role.Admin, Role.Cashier]) role: Role.Admin | Role.Cashier;
  /** Modules this account may access; omit for full access per role. */
  @ApiPropertyOptional({ type: [String], enum: ['pos', 'inventory', 'reports', 'customers', 'installments', 'barcode-generator', 'barcode-scanner'] })
  @IsOptional() @IsArray() @ArrayMaxSize(9) @IsIn(['pos', 'products', 'dashboard', 'orders', 'settings', 'installments', 'customers', 'barcode-generator', 'barcode-scanner'], { each: true })
  moduleRights?: string[];
}

export class UpdateStaffRightsDto {
  @IsOptional() @IsArray() @ArrayMaxSize(100) @IsMongoId({ each: true }) branchIds?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(24) @IsIn(ACTIONS, { each: true }) permissions?: string[];
  @ApiProperty({ type: [String], enum: ['pos', 'products', 'dashboard', 'orders', 'settings', 'installments', 'customers', 'barcode-generator', 'barcode-scanner'] })
  @IsArray() @ArrayMaxSize(9) @IsIn(['pos', 'products', 'dashboard', 'orders', 'settings', 'installments', 'customers', 'barcode-generator', 'barcode-scanner'], { each: true })
  moduleRights: string[];
}

export class UpdateStaffStatusDto {
  @ApiProperty() @IsBoolean() isActive: boolean;
}

// ---------------------------------------------------------------------------
// Hybrid password recovery (online email token + offline recovery codes)
// ---------------------------------------------------------------------------
export class ForgotPasswordDto {
  @ApiProperty() @IsEmail() email: string;
}

export class ResetPasswordDto {
  @ApiProperty() @IsString() @MinLength(20) @MaxLength(120) token: string;
  @ApiProperty() @IsString() @MinLength(12) @MaxLength(128) newPassword: string;
}

export class RecoverOfflineDto {
  @ApiProperty() @IsEmail() email: string;
  @ApiProperty() @IsString() @MinLength(20) @MaxLength(80) recoveryCode: string;
  @ApiProperty() @IsString() @MinLength(12) @MaxLength(128) newPassword: string;
}

export class ChangePasswordDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(128) currentPassword: string;
  @ApiProperty() @IsString() @MinLength(12) @MaxLength(128) newPassword: string;
}

export class AdminResetStaffDto {
  @ApiProperty() @IsMongoId() staffId: string;
  /** The administrator's own current password (reauthentication). */
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(128) adminPassword: string;
}
