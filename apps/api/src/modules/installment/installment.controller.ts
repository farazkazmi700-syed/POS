import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../../common/auth-user';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { QueryInstallmentsDto, QuoteDto, RecordPaymentDto } from './dto/installment.dto';
import { InstallmentService } from './installment.service';

@ApiTags('installments')
@ApiBearerAuth()
@Controller('installments')
export class InstallmentController {
  constructor(private readonly installments: InstallmentService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() q: QueryInstallmentsDto) {
    return this.installments.list(user.tenantId, q);
  }

  // fixed paths must be declared before ':id'
  @Get('stats')
  stats(@CurrentUser() user: AuthUser) {
    return this.installments.stats(user.tenantId);
  }

  @Post('quote')
  quote(@Body() dto: QuoteDto) {
    return this.installments.quote(dto);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string) {
    return this.installments.findOne(user.tenantId, id);
  }

  @Post(':id/payments')
  pay(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string, @Body() dto: RecordPaymentDto) {
    return this.installments.recordPayment(user, id, dto);
  }
}
