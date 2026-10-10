import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsOptional, IsString, Length, MaxLength, MinLength } from 'class-validator';
import { DomainType, Role } from '../../../common/enums';

export class RegisterDto {
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

export class RefreshDto {
  @ApiProperty() @IsString() refreshToken: string;
}

export class CreateStaffDto {
  @ApiProperty() @IsString() @Length(2, 80) name: string;
  @ApiProperty() @IsEmail() email: string;
  @ApiProperty() @IsString() @MinLength(8) @MaxLength(72) password: string;
  @ApiProperty({ enum: [Role.Admin, Role.Cashier] }) @IsEnum(Role) role: Role.Admin | Role.Cashier;
}
