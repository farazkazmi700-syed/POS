import { Controller, Get, Module, Post, Body, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../../common/auth-user';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresFeature } from '../../common/decorators/feature.decorator';
import { ProductModule } from '../product/product.module';
import { ProductService } from '../product/product.service';
import { QueryProductDto } from '../product/dto/product.dto';
import { GenerateBarcodeDto, LookupBarcodeDto } from './barcode.dto';
import { BarcodeService } from './barcode.service';

@ApiTags('barcodes') @ApiBearerAuth() @RequiresFeature('barcodes') @Controller('barcodes')
class BarcodeController {
  constructor(private readonly barcodes: BarcodeService, private readonly products: ProductService) {}
  @Post('generate') generate(@CurrentUser() user: AuthUser, @Body() dto: GenerateBarcodeDto) { return this.barcodes.generate(user.tenantId, dto); }
  @Get('lookup') lookup(@CurrentUser() user: AuthUser, @Query() dto: LookupBarcodeDto) { return this.products.findByBarcode(user.tenantId, dto.value); }
  @Get('products') catalog(@CurrentUser() user: AuthUser, @Query() dto: QueryProductDto) { return this.products.findAll(user.tenantId, { ...dto, includeInactive: false }); }
}
@Module({ imports: [ProductModule], controllers: [BarcodeController], providers: [BarcodeService] })
export class BarcodeModule {}
