import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray, IsEnum, IsNumber, IsOptional, IsString, Length, Max, MaxLength, Min, ValidateNested,
} from 'class-validator';
import { ChargeType, DomainType } from '../../../common/enums';

export class ChargeRuleDto {
  @IsString() @MaxLength(60) label: string;
  @IsEnum(ChargeType) type: ChargeType;
  @IsNumber() @Min(0) value: number;
}

export class TaxProfileDto {
  @IsNumber() @Min(0) @Max(100) gstPercent: number;
  @IsNumber() @Min(0) @Max(100) reducedGstPercent: number;
  @IsNumber() @Min(0) @Max(100) serviceChargePercent: number;
  @IsArray() @ValidateNested({ each: true }) @Type(() => ChargeRuleDto) otherCharges: ChargeRuleDto[];
}

export class UpdateTenantDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(2, 120) name?: string;
  @ApiPropertyOptional({ enum: DomainType }) @IsOptional() @IsEnum(DomainType) domainType?: DomainType;
  @ApiPropertyOptional() @IsOptional() @IsString() address?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() taxRegNo?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(3, 3) currency?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(2, 8) invoicePrefix?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() logoUrl?: string;
  @ApiPropertyOptional({ type: TaxProfileDto }) @IsOptional() @ValidateNested() @Type(() => TaxProfileDto) taxProfile?: TaxProfileDto;
}
