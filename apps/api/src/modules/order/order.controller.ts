import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../../common/auth-user';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresFeature } from '../../common/decorators/feature.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { CreateOrderDto, ListOrdersDto, PreviewOrderDto, SummaryQueryDto } from './dto/order.dto';
import { OrderService } from './order.service';

@ApiTags('orders')
@ApiBearerAuth()
@Controller('orders')
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
    return this.orders.list(user.tenantId, q.page, q.limit);
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
    return this.orders.findOne(user.tenantId, id);
  }

  @Post(':id/void')
  @Roles(Role.Owner, Role.Admin)
  void(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string) {
    return this.orders.voidOrder(user.tenantId, id);
  }
}
