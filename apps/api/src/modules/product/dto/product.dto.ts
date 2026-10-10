import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsEnum, IsNumber, IsObject, IsOptional, IsString,
  Length, Max, Min, ValidateNested,
} from 'class-validator';
import { TaxClass } from '../../../common/enums';

export class CreateProductDto {
  @ApiProperty() @IsString() @Length(1, 160) name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 64) sku?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() category?: string;
  @ApiPropertyOptional({ example: 'pcs' }) @IsOptional() @IsString() unit?: string;
  @ApiProperty() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) price: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) costPrice?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) stockQty?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) lowStockThreshold?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() trackStock?: boolean;
  @ApiPropertyOptional({ enum: TaxClass }) @IsOptional() @IsEnum(TaxClass) taxClass?: TaxClass;
  @ApiPropertyOptional({ description: 'Free-form, domain-specific fields' })
  @IsOptional() @IsObject() attributes?: Record<string, string | number | boolean>;
  @ApiPropertyOptional() @IsOptional() @IsString() imageUrl?: string;
}

export class UpdateProductDto extends PartialType(CreateProductDto) {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class BulkCreateProductsDto {
  @ApiProperty({ type: [CreateProductDto] })
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(500)
  @ValidateNested({ each: true }) @Type(() => CreateProductDto)
  products: CreateProductDto[];
}

const toBool = ({ value }: { value: unknown }) => value === true || value === 'true';

export class QueryProductDto {
  @ApiPropertyOptional() @IsOptional() @IsString() q?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() category?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(toBool) @IsBoolean() lowStock?: boolean;
  @ApiPropertyOptional() @IsOptional() @Transform(toBool) @IsBoolean() includeInactive?: boolean;
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @Type(() => Number) @IsNumber() @Min(1) page?: number;
  @ApiPropertyOptional({ default: 30 }) @IsOptional() @Type(() => Number) @IsNumber() @Min(1) @Max(200) limit?: number;
}
