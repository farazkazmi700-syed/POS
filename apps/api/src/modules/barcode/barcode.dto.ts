import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsMongoId, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

export const BARCODE_FORMATS = ['CODE128', 'CODE39', 'EAN13', 'EAN8', 'UPC'] as const;
export type BarcodeFormat = typeof BARCODE_FORMATS[number];
export class GenerateBarcodeDto {
  @ApiProperty({ enum: BARCODE_FORMATS }) @IsIn(BARCODE_FORMATS) format: BarcodeFormat;
  @ApiPropertyOptional() @IsOptional() @IsString() @Matches(/^[\x20-\x7E]{1,80}$/) value?: string;
  @ApiPropertyOptional() @IsOptional() @IsMongoId() productId?: string;
  @ApiPropertyOptional({ default: 2 }) @IsOptional() @IsInt() @Min(1) @Max(6) scale?: number;
  @ApiPropertyOptional({ default: 25, description: 'Bar height in millimeters' }) @IsOptional() @IsInt() @Min(10) @Max(60) height?: number;
  @ApiPropertyOptional({ default: true }) @IsOptional() @IsBoolean() displayValue?: boolean;
}
export class LookupBarcodeDto {
  @ApiProperty() @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @Matches(/^[\x20-\x7E]{1,80}$/) value: string;
}
