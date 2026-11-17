import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';

export class RecoveryRequestDto {
  @ApiProperty() @IsEmail() email: string;
  @ApiProperty({ enum: ['password', 'pin', 'developer-pin'] }) @IsIn(['password', 'pin', 'developer-pin']) purpose: 'password' | 'pin' | 'developer-pin';
  @ApiPropertyOptional({ enum: ['email', 'whatsapp'], default: 'email' }) @IsOptional() @IsIn(['email', 'whatsapp']) channel?: 'email' | 'whatsapp';
}
export class ConfirmOtpDto {
  @ApiProperty() @IsUUID() challengeId: string;
  @ApiProperty() @IsString() @Matches(/^\d{6}$/) code: string;
}
export class RecoveryConfirmDto extends ConfirmOtpDto {
  @ApiProperty() @IsString() @MinLength(4) @MaxLength(72) newSecret: string;
}
export class RecoveryPhoneDto {
  @ApiProperty({ example: '+923001234567' }) @IsString() @Matches(/^\+[1-9]\d{7,14}$/) phone: string;
}
