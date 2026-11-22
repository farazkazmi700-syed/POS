import { ApiPropertyOptional } from '@nestjs/swagger';
import { Matches, IsOptional, IsString } from 'class-validator';

export class SalesReportQueryDto {
  @ApiPropertyOptional({ description: 'Range start (YYYY-MM-DD). Defaults to 7 days before "to".', example: '2026-10-01' })
  @IsOptional() @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'from must be YYYY-MM-DD' })
  from?: string;

  @ApiPropertyOptional({ description: 'Range end (YYYY-MM-DD). Defaults to today.', example: '2026-10-16' })
  @IsOptional() @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'to must be YYYY-MM-DD' })
  to?: string;
}