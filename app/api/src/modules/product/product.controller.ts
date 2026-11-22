import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../../common/auth-user';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresFeature } from '../../common/decorators/feature.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { BulkCreateProductsDto, CreateProductDto, QueryProductDto, UpdateProductDto } from './dto/product.dto';
import { ProductService } from './product.service';

@ApiTags('products')
@ApiBearerAuth()
@Controller('products')
export class ProductController {
  constructor(private readonly products: ProductService) {}

  @Get()
  @RequiresFeature(['pos', 'inventory'])
  findAll(@CurrentUser() user: AuthUser, @Query() query: QueryProductDto) {
    return this.products.findAll(user.tenantId, query);
  }

  @Get(':id')
  @RequiresFeature(['pos', 'inventory'])
  findOne(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string) {
    return this.products.findOne(user.tenantId, id);
  }

  @Post()
  @Roles(Role.Owner, Role.Admin)
  @RequiresFeature('inventory')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateProductDto) {
    return this.products.create(user.tenantId, dto);
  }

  @Post('bulk')
  @Roles(Role.Owner, Role.Admin)
  @RequiresFeature('inventory')
  bulk(@CurrentUser() user: AuthUser, @Body() dto: BulkCreateProductsDto) {
    return this.products.bulkCreate(user.tenantId, dto);
  }

  @Patch(':id')
  @Roles(Role.Owner, Role.Admin)
  @RequiresFeature('inventory')
  update(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string, @Body() dto: UpdateProductDto) {
    return this.products.update(user.tenantId, id, dto);
  }

  @Delete(':id')
  @Roles(Role.Owner, Role.Admin)
  @RequiresFeature('inventory')
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string) {
    return this.products.remove(user.tenantId, id);
  }
}
