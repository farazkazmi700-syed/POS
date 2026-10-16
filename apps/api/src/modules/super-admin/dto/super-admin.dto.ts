import { Type } from 'class-transformer';
import {
  IsBoolean, IsEmail, IsEnum, IsMongoId, IsNumber, IsObject, IsOptional, IsString, Length, Max,
  MaxLength, Min, MinLength, ValidateNested,
} from 'class-validator';
import { DomainType } from '../../../common/enums';

export class FeatureFlagsDto {
  @IsOptional() @IsBoolean() pos?: boolean;
  @IsOptional() @IsBoolean() inventory?: boolean;
  @IsOptional() @IsBoolean() reports?: boolean;
  @IsOptional() @IsBoolean() customers?: boolean;
  @IsOptional() @IsBoolean() installments?: boolean;
}

export class PlanFeaturesDto {
  @IsBoolean() pos: boolean;
  @IsBoolean() inventory: boolean;
  @IsBoolean() reports: boolean;
  @IsBoolean() customers: boolean;
  @IsBoolean() installments: boolean;
}

export class CreateBusinessDto {
  @IsString() @Length(2, 120) name: string;
  @IsEnum(DomainType) domainType: DomainType;
  @IsString() @Length(2, 80) ownerName: string;
  @IsEmail() ownerEmail: string;
  @IsString() @MinLength(12) @MaxLength(72) ownerPassword: string;
  @IsOptional() @IsString() @MaxLength(300) address?: string;
  @IsOptional() @IsString() @Length(3, 3) currency?: string;
}

export class UpdateBusinessDto {
  @IsOptional() @IsString() @Length(2, 120) name?: string;
  @IsOptional() @IsEnum(['active', 'suspended'] as const) status?: 'active' | 'suspended';
}

export class UpdateBusinessFeaturesDto {
  @IsObject() @ValidateNested() @Type(() => FeatureFlagsDto) featureFlags: FeatureFlagsDto;
}

export class AssignPlanDto {
  @IsMongoId() subscriptionPlanId: string;
}

export class CreatePlanDto {
  @IsString() @Length(2, 80) name: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsNumber() @Min(0) @Max(1_000_000_000) price: number;
  @IsEnum(['monthly', 'yearly'] as const) billingInterval: 'monthly' | 'yearly';
  @IsObject() @ValidateNested() @Type(() => PlanFeaturesDto) features: PlanFeaturesDto;
}

export class UpdatePlanDto {
  @IsOptional() @IsString() @Length(2, 80) name?: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(1_000_000_000) price?: number;
  @IsOptional() @IsEnum(['monthly', 'yearly'] as const) billingInterval?: 'monthly' | 'yearly';
  @IsOptional() @IsObject() @ValidateNested() @Type(() => PlanFeaturesDto) features?: PlanFeaturesDto;
  @IsOptional() @IsBoolean() isActive?: boolean;
}