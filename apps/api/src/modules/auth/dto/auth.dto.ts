import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsOptional, IsString, Length, Matches, MaxLength, MinLength } from 'class-validator';
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
  @ApiProperty() @IsString() password: string;
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
  @ApiPropertyOptional() @IsOptional() @IsEmail() recoveryEmail?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(7, 32) phone?: string;
}

export class VerifyRecoveryDto {
  @ApiProperty({ enum: ['email', 'phone'] }) @IsEnum(['email', 'phone'] as const) type: 'email' | 'phone';
}

export class CreateStaffDto {
  @ApiProperty() @IsString() @Length(2, 80) name: string;
  @ApiProperty() @IsEmail() email: string;
  @ApiProperty() @IsString() @MinLength(8) @MaxLength(72) password: string;
  @ApiProperty({ enum: [Role.Admin, Role.Cashier] }) @IsEnum(Role) role: Role.Admin | Role.Cashier;
}
