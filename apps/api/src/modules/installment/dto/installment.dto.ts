import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn, IsInt, IsMongoId, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateNested,
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
}

export class QueryInstallmentsDto {
  @ApiPropertyOptional({ enum: ['active', 'overdue', 'completed', 'all'] }) @IsOptional() @IsIn(['active', 'overdue', 'completed', 'all']) filter?: 'active' | 'overdue' | 'completed' | 'all';
  @ApiPropertyOptional() @IsOptional() @IsString() q?: string;
  @ApiPropertyOptional() @IsOptional() @IsMongoId() customerId?: string;
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @Type(() => Number) @IsNumber() @Min(1) page?: number;
  @ApiPropertyOptional({ default: 20 }) @IsOptional() @Type(() => Number) @IsNumber() @Min(1) @Max(100) limit?: number;
}
