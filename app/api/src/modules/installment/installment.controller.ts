import { Body, Controller, Delete, Get, Header, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../../common/auth-user';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresFeature } from '../../common/decorators/feature.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import {
  CreateInstallmentProductDto,
  CreateInstallmentSaleDto,
  QueryInstallmentProductsDto,
  QueryInstallmentSalesDto,
  QuoteDto,
  RecordInstallmentSalePaymentDto,
  RecordPaymentDto,
  UpdateInstallmentProductDto,
  QueryInstallmentsDto,
} from './dto/installment.dto';
import { INSTALLMENT_ALLOWED_ROLES } from './installment.roles';
import { InstallmentService } from './installment.service';

@ApiTags('installments')
@ApiBearerAuth()
@Roles(...INSTALLMENT_ALLOWED_ROLES)
@RequiresFeature('installments')
@Controller('installments')
export class InstallmentController {
  constructor(private readonly installments: InstallmentService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() q: QueryInstallmentsDto) {
    return this.installments.list(user.tenantId, q);
  }

  @Get('stats')
  stats(@CurrentUser() user: AuthUser) {
    return this.installments.stats(user.tenantId);
  }

  @Get('dashboard')
  dashboard(@CurrentUser() user: AuthUser) {
    return this.installments.dashboard(user.tenantId);
  }

  @Post('quote')
  quote(@Body() dto: QuoteDto) {
    return this.installments.quote(dto);
  }

  @Get('products')
  listProducts(@CurrentUser() user: AuthUser, @Query() q: QueryInstallmentProductsDto) {
    return this.installments.listProducts(user.tenantId, q);
  }

  @Get('products/:id')
  findProduct(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string) {
    return this.installments.findProduct(user.tenantId, id);
  }

  @Post('products')
  @Roles(Role.Owner, Role.Admin)
  createProduct(@CurrentUser() user: AuthUser, @Body() dto: CreateInstallmentProductDto) {
    return this.installments.createProduct(user.tenantId, dto);
  }

  @Patch('products/:id')
  @Roles(Role.Owner, Role.Admin)
  updateProduct(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string, @Body() dto: UpdateInstallmentProductDto) {
    return this.installments.updateProduct(user.tenantId, id, dto);
  }

  @Delete('products/:id')
  @Roles(Role.Owner, Role.Admin)
  removeProduct(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string) {
    return this.installments.removeProduct(user.tenantId, id);
  }

  @Get('sales')
  listSales(@CurrentUser() user: AuthUser, @Query() q: QueryInstallmentSalesDto) {
    return this.installments.listSales(user.tenantId, q);
  }

  @Get('sales/:id')
  findSale(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string) {
    return this.installments.findSale(user.tenantId, id);
  }

  @Post('sales')
  createSale(@CurrentUser() user: AuthUser, @Body() dto: CreateInstallmentSaleDto) {
    return this.installments.createSale(user, dto);
  }

  @Post('sales/:id/payments')
  paySale(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string, @Body() dto: RecordInstallmentSalePaymentDto) {
    return this.installments.recordSalePayment(user, id, dto);
  }

  @Get('collections-forecast')
  @Header('Cache-Control', 'no-store')
  @Roles(Role.Owner, Role.Admin)
  @RequiresFeature('collections-forecast')
  collectionForecast(@CurrentUser() user: AuthUser) {
    return this.installments.collectionForecast(user.tenantId);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string) {
    return this.installments.findOne(user.tenantId, id);
  }

  /** Snapshot of a plan for invoice rendering (includes remaining balance). */
  @Get(':id/invoice')
  invoiceView(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string) {
    return this.installments.invoiceView(user.tenantId, id);
  }

  @Post(':id/payments')
  pay(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string, @Body() dto: RecordPaymentDto) {
    return this.installments.recordPayment(user, id, dto);
  }
}
