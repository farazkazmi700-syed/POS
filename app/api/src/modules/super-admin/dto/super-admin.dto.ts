import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray,
  IsBoolean, IsEmail, IsEnum, IsMongoId, IsNumber, IsObject, IsOptional, IsString, Length, Max,
  MaxLength, Min, MinLength, Matches, ValidateNested, IsDateString, IsInt, IsIn,
} from 'class-validator';
import { DomainType } from '../../../common/enums';

export class FeatureFlagsDto {
  @IsOptional() @IsBoolean() pos?: boolean;
  @IsOptional() @IsBoolean() inventory?: boolean;
  @IsOptional() @IsBoolean() reports?: boolean;
  @IsOptional() @IsBoolean() customers?: boolean;
  @IsOptional() @IsBoolean() installments?: boolean;
  @IsOptional() @IsBoolean() barcodes?: boolean;
  @IsOptional() @IsBoolean() settings?: boolean;
  @IsOptional() @IsBoolean() 'data-sync'?: boolean;
  @IsOptional() @IsBoolean() 'stock-replenishment'?: boolean;
  @IsOptional() @IsBoolean() 'collections-forecast'?: boolean;
}

export class PlanFeaturesDto {
  @IsBoolean() pos: boolean;
  @IsBoolean() inventory: boolean;
  @IsBoolean() reports: boolean;
  @IsBoolean() customers: boolean;
  @IsBoolean() installments: boolean;
  @IsBoolean() barcodes: boolean;
  @IsBoolean() settings: boolean;
  @IsOptional() @IsBoolean() 'data-sync'?: boolean;
  @IsOptional() @IsBoolean() 'stock-replenishment'?: boolean;
  @IsOptional() @IsBoolean() 'collections-forecast'?: boolean;
}

export class ProvisionAccountDto {
  @IsString() @Length(2, 80) name: string;
  @IsEmail() email: string;
  @IsString() @MinLength(8) @MaxLength(72) password: string;
  @IsIn(['admin', 'staff', 'cashier']) role: 'admin' | 'staff' | 'cashier';
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) moduleRights?: string[];
}

export class CreatePlatformModuleDto {
  @IsString() @Length(2, 40) @Matches(/^[a-z0-9][a-z0-9-]*$/)
  key: string;
  @IsString() @Length(2, 60) label: string;
  @IsOptional() @IsString() @MaxLength(300) description?: string;
}

export class UpdatePlatformModuleDto {
  @IsOptional() @IsString() @Length(2, 60) label?: string;
  @IsOptional() @IsString() @MaxLength(300) description?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CreateBusinessDto {
  @IsOptional() @IsMongoId() initialPlanId?: string;
  @IsString() @Length(2, 120) name: string;
  @IsEnum(DomainType) domainType: DomainType;
  @IsString() @Length(2, 80) ownerName: string;
  @IsEmail() ownerEmail: string;
  @IsString() @MinLength(12) @MaxLength(72) ownerPassword: string;
  @IsOptional() @IsString() @MaxLength(300) address?: string;
  @IsOptional() @IsString() @Length(3, 3) currency?: string;
  /** Owner contact used for password reset & verification. Required. */
  @IsString() @Matches(/^\+?[0-9]{7,15}$/) ownerPhone: string;
  /** Optional: seed role accounts (admin/staff/cashier) from the business-type package. */
  @IsOptional() @IsArray() @ArrayMaxSize(24) @ValidateNested({ each: true }) @Type(() => ProvisionAccountDto)
  accounts?: ProvisionAccountDto[];
}

export class UpdateBusinessDto {
  @IsOptional() @IsIn(['cloud', 'offline', 'hybrid']) deploymentMode?: 'cloud' | 'offline' | 'hybrid';
  @IsOptional() @IsDateString() licenseExpiresAt?: string;
  @IsOptional() @IsInt() @Min(1) @Max(1000) branchLimit?: number;
  @IsOptional() @IsString() @Length(2, 120) name?: string;
  @IsOptional() @IsEnum(['active', 'suspended'] as const) status?: 'active' | 'suspended';
}

export class UpdateBusinessFeaturesDto {
  @IsObject() @ValidateNested() @Type(() => FeatureFlagsDto) featureFlags: FeatureFlagsDto;
}

export class ProvisionTenantAccountsDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(24) @ValidateNested({ each: true }) @Type(() => ProvisionAccountDto)
  accounts: ProvisionAccountDto[];
}

export class AssignPlanDto {
  @IsMongoId() subscriptionPlanId: string;
}

const BILLING_INTERVALS = ['monthly', 'yearly', 'lifetime'] as const;
type BillingIntervalValue = (typeof BILLING_INTERVALS)[number];

export class CreatePlanDto {
  @IsOptional() @IsEnum(DomainType) domainType?: DomainType;
  @IsString() @Length(2, 80) name: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsNumber() @Min(0) @Max(1_000_000_000) price: number;
  @IsIn(BILLING_INTERVALS) billingInterval: BillingIntervalValue;
  @IsObject() @ValidateNested() @Type(() => PlanFeaturesDto) features: PlanFeaturesDto;
}

export class UpdatePlanDto {
  @IsOptional() @IsEnum(DomainType) domainType?: DomainType | null;
  @IsOptional() @IsString() @Length(2, 80) name?: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(1_000_000_000) price?: number;
  @IsOptional() @IsIn(BILLING_INTERVALS) billingInterval?: BillingIntervalValue;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => PlanFeaturesDto) features?: PlanFeaturesDto;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
