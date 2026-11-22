import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn, IsInt, IsMongoId, IsNumber, IsObject, IsOptional, IsString, Length, Matches, Max, MaxLength, Min, ValidateNested,
} from 'class-validator';
import { GuarantorDto } from '../../customer/dto/customer.dto';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Terms sent together with a checkout when paymentMode = "installment". */
export class InstallmentTermsDto {
  @ApiProperty() @IsMongoId() customerId: string;
  @ApiProperty({ example: 10000 }) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) downPayment: number;
  @ApiPropertyOptional({ enum: ['cash', 'card', 'wallet'] }) @IsOptional() @IsIn(['cash', 'card', 'wallet']) downPaymentMode?: 'cash' | 'card' | 'wallet';
  @ApiProperty({ example: 6 }) @IsInt() @Min(1) @Max(60) months: number;
  @ApiProperty({ example: 10 }) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100) markupPercent: number;
  @ApiPropertyOptional({ example: '2026-11-10' }) @IsOptional() @Matches(DATE) firstDueDate?: string;
  @ApiPropertyOptional({ type: GuarantorDto }) @IsOptional() @ValidateNested() @Type(() => GuarantorDto) guarantor?: GuarantorDto;
}

export class QuoteDto {
  @ApiProperty() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) cashTotal: number;
  @ApiProperty() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) downPayment: number;
  @ApiProperty() @IsInt() @Min(1) @Max(60) months: number;
  @ApiProperty() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100) markupPercent: number;
  @ApiPropertyOptional() @IsOptional() @Matches(DATE) firstDueDate?: string;
}

export class RecordPaymentDto {
  @ApiProperty() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) amount: number;
  @ApiProperty({ enum: ['cash', 'card', 'wallet'] }) @IsIn(['cash', 'card', 'wallet']) mode: 'cash' | 'card' | 'wallet';
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) note?: string;
  @ApiPropertyOptional({ description: 'Stable retry key; repeating a payment request with the same key will not collect twice.' })
  @IsOptional() @IsString() @Length(16, 128) idempotencyKey?: string;
}

export class QueryInstallmentsDto {
  @ApiPropertyOptional({ enum: ['active', 'overdue', 'completed', 'all'] }) @IsOptional() @IsIn(['active', 'overdue', 'completed', 'all']) filter?: 'active' | 'overdue' | 'completed' | 'all';
  @ApiPropertyOptional() @IsOptional() @IsString() q?: string;
  @ApiPropertyOptional() @IsOptional() @IsMongoId() customerId?: string;
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @Type(() => Number) @IsNumber() @Min(1) page?: number;
  @ApiPropertyOptional({ default: 20 }) @IsOptional() @Type(() => Number) @IsNumber() @Min(1) @Max(100) limit?: number;
}

export class CreateInstallmentProductDto {
  @ApiProperty() @IsString() @Length(1, 160) name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 80) brand?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 80) model?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() category?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() imageUrl?: string;
  @ApiProperty({ example: 110000 }) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) actualPrice: number;
  @ApiProperty({ example: 40 }) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100) defaultCommissionRate: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @IsIn(['active', 'inactive', 'archived']) status?: 'active' | 'inactive' | 'archived';
  @ApiPropertyOptional({ description: 'Free-form metadata' }) @IsOptional() @IsObject() metadata?: Record<string, string | number | boolean | null>;
}

export class UpdateInstallmentProductDto extends PartialType(CreateInstallmentProductDto) {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class QueryInstallmentProductsDto {
  @ApiPropertyOptional() @IsOptional() @IsString() q?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() status?: 'active' | 'inactive' | 'archived';
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @Type(() => Number) @IsNumber() @Min(1) page?: number;
  @ApiPropertyOptional({ default: 20 }) @IsOptional() @Type(() => Number) @IsNumber() @Min(1) @Max(100) limit?: number;
}

export class CreateInstallmentSaleDto {
  @ApiProperty() @IsMongoId() customerId: string;
  @ApiProperty() @IsMongoId() installmentProductId: string;
  @ApiPropertyOptional({ example: '2026-11-11' }) @IsOptional() @Matches(DATE) saleDate?: string;
  @ApiPropertyOptional({ example: 110000 }) @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) actualPrice?: number;
  @ApiProperty({ example: 10000 }) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) advancePayment: number;
  @ApiPropertyOptional({ enum: ['cash', 'card', 'wallet'] }) @IsOptional() @IsIn(['cash', 'card', 'wallet']) advancePaymentMode?: 'cash' | 'card' | 'wallet';
  @ApiPropertyOptional({ example: 40 }) @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100) commissionRate?: number;
  @ApiPropertyOptional({ example: 13 }) @IsOptional() @IsInt() @Min(1) @Max(120) installmentDuration?: number;
  @ApiPropertyOptional({ example: 'monthly' }) @IsOptional() @IsIn(['monthly', 'weekly', 'biweekly']) paymentFrequency?: 'monthly' | 'weekly' | 'biweekly';
}

export class RecordInstallmentSalePaymentDto {
  @IsOptional() @IsString() @Length(16, 128) idempotencyKey?: string;
  @ApiProperty() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) amount: number;
  @ApiProperty({ enum: ['cash', 'card', 'wallet'] }) @IsIn(['cash', 'card', 'wallet']) mode: 'cash' | 'card' | 'wallet';
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) note?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() installmentId?: string;
}

export class QueryInstallmentSalesDto {
  @ApiPropertyOptional({ enum: ['active', 'completed', 'overdue', 'all'] }) @IsOptional() @IsIn(['active', 'completed', 'overdue', 'all']) filter?: 'active' | 'completed' | 'overdue' | 'all';
  @ApiPropertyOptional() @IsOptional() @IsMongoId() customerId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() q?: string;
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @Type(() => Number) @IsNumber() @Min(1) page?: number;
  @ApiPropertyOptional({ default: 20 }) @IsOptional() @Type(() => Number) @IsNumber() @Min(1) @Max(100) limit?: number;
}
