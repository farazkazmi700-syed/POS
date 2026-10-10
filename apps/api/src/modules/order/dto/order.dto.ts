import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsDefined, IsEnum, IsMongoId, IsNumber, IsOptional, IsString, Max, MaxLength, Min,
  ValidateIf, ValidateNested,
} from 'class-validator';
import { PaymentMode } from '../../../common/enums';
import { InstallmentTermsDto } from '../../installment/dto/installment.dto';

export class OrderItemDto {
  @ApiProperty() @IsMongoId() productId: string;
  @ApiProperty({ example: 1 }) @IsNumber({ maxDecimalPlaces: 3 }) @Min(0.001) qty: number;
  @ApiPropertyOptional({ example: 0 }) @IsOptional() @IsNumber() @Min(0) @Max(100) discountPercent?: number;
  @ApiPropertyOptional({ description: 'IMEI / serial number(s)' }) @IsOptional() @IsString() @MaxLength(200) serialNo?: string;
}

export class PreviewOrderDto {
  @ApiProperty({ type: [OrderItemDto] })
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200)
  @ValidateNested({ each: true }) @Type(() => OrderItemDto)
  items: OrderItemDto[];
}

export class CustomerDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(32) phone?: string;
}

export class CreateOrderDto extends PreviewOrderDto {
  @ApiProperty({ enum: PaymentMode }) @IsEnum(PaymentMode) paymentMode: PaymentMode;
  @ApiPropertyOptional({ type: CustomerDto }) @IsOptional() @ValidateNested() @Type(() => CustomerDto) customer?: CustomerDto;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) note?: string;
  @ApiPropertyOptional({ type: InstallmentTermsDto, description: 'Required when paymentMode is "installment"' })
  @ValidateIf((o: CreateOrderDto) => o.paymentMode === PaymentMode.Installment)
  @IsDefined() @ValidateNested() @Type(() => InstallmentTermsDto)
  installment?: InstallmentTermsDto;
}

export class ListOrdersDto {
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @Type(() => Number) @IsNumber() @Min(1) page?: number;
  @ApiPropertyOptional({ default: 20 }) @IsOptional() @Type(() => Number) @IsNumber() @Min(1) @Max(100) limit?: number;
}

export class SummaryQueryDto {
  @ApiPropertyOptional({ default: 7 }) @IsOptional() @Type(() => Number) @IsNumber() @Min(1) @Max(365) days?: number;
}
