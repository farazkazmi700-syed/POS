import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../../common/auth-user';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresFeature } from '../../common/decorators/feature.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { CreateOrderDto, ListOrdersDto, PreviewOrderDto, RefundOrderDto, SummaryQueryDto } from './dto/order.dto';
import { OrderService } from './order.service';

@ApiTags('orders')
@ApiBearerAuth()
@Controller('orders')
@RequiresFeature('pos')
export class OrderController {
  constructor(private readonly orders: OrderService) {}

  @Post('preview')
  @RequiresFeature('pos')
  preview(@CurrentUser() user: AuthUser, @Body() dto: PreviewOrderDto) {
    return this.orders.preview(user.tenantId, dto);
  }

  @Post()
  @RequiresFeature('pos')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateOrderDto) {
    return this.orders.create(user, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() q: ListOrdersDto) {
    return this.orders.list(user.tenantId, q.page, q.limit, user.role === Role.Cashier ? user.userId : undefined);
  }

  // must be declared before ':id'
  @Get('stats/summary')
  @Roles(Role.Owner, Role.Admin)
  @RequiresFeature('reports')
  summary(@CurrentUser() user: AuthUser, @Query() q: SummaryQueryDto) {
    return this.orders.summary(user.tenantId, q.days);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string) {
    return this.orders.findOne(user.tenantId, id, user.role === Role.Cashier ? user.userId : undefined);
  }

  @Post(':id/void')
  @Roles(Role.Owner, Role.Admin)
  void(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string) {
    return this.orders.voidOrder(user.tenantId, id);
  }

  @Post(':id/refund') @Roles(Role.Owner, Role.Admin)
  refund(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string, @Body() dto: RefundOrderDto) { return this.orders.refund(user, id, dto.reason); }
}
