import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../../common/auth-user';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresFeature } from '../../common/decorators/feature.decorator';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { CustomerService } from './customer.service';
import { CreateCustomerDto, QueryCustomerDto, UpdateCustomerDto } from './dto/customer.dto';

@ApiTags('customers')
@ApiBearerAuth()
@RequiresFeature('customers')
@Controller('customers')
export class CustomerController {
  constructor(private readonly customers: CustomerService) {}

  @Get()
  findAll(@CurrentUser() user: AuthUser, @Query() q: QueryCustomerDto) {
    return this.customers.findAll(user.tenantId, q);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string) {
    return this.customers.findOne(user.tenantId, id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCustomerDto) {
    return this.customers.create(user.tenantId, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string, @Body() dto: UpdateCustomerDto) {
    return this.customers.update(user.tenantId, id, dto);
  }
}
