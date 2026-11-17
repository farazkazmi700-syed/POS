import { BadRequestException, Body, ConflictException, Controller, Get, Injectable, Module, Post, Query } from '@nestjs/common';
import { InjectModel, MongooseModule, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsMongoId, IsNumber, IsString, IsUUID, Length } from 'class-validator';
import { Model, Types } from 'mongoose';
import { AuthUser } from '../../common/auth-user';
import { branchScoped } from '../../common/branch-scope';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresFeature } from '../../common/decorators/feature.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums';
import { ProductModule } from '../product/product.module';
import { ProductService } from '../product/product.service';

@Schema({ timestamps: true }) class StockAdjustment {
  @Prop({ type: Types.ObjectId, required: true }) tenantId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, required: true }) productId: Types.ObjectId;
  @Prop({ required: true }) idempotencyKey: string;
  @Prop({ required: true }) delta: number;
  @Prop({ required: true }) reason: string;
  @Prop({ required: true }) actorId: string;
  @Prop({ default: 'pending', enum: ['pending', 'applied', 'rejected'] }) status: string;
}
const schema = SchemaFactory.createForClass(StockAdjustment); schema.plugin(branchScoped); schema.index({ tenantId: 1, idempotencyKey: 1 }, { unique: true });
class AdjustStockDto { @IsMongoId() productId: string; @IsUUID() idempotencyKey: string; @IsNumber({ maxDecimalPlaces: 3, allowNaN: false, allowInfinity: false }) delta: number; @IsString() @Length(3, 300) reason: string; }
@Injectable() class StockService {
  constructor(@InjectModel(StockAdjustment.name) private readonly adjustments: Model<StockAdjustment>, private readonly products: ProductService) {}
  async list(user: AuthUser, pageValue?: string) {
    const page = Number(pageValue ?? 1); if (!Number.isSafeInteger(page) || page < 1 || page > 100000) throw new BadRequestException('Page must be a positive integer'); const filter = { tenantId: new Types.ObjectId(user.tenantId) };
    const [data, total] = await Promise.all([this.adjustments.find(filter).sort({ createdAt: -1 }).skip((page - 1) * 30).limit(30), this.adjustments.countDocuments(filter)]);
    return { data, total, page, limit: 30 };
  }
  async adjust(user: AuthUser, dto: AdjustStockDto) {
    if (dto.delta === 0 || Math.abs(dto.delta) > 1_000_000) throw new ConflictException('Adjustment must be a non-zero quantity within supported limits');
    await this.products.findOne(user.tenantId, dto.productId);
    const filter = { tenantId: new Types.ObjectId(user.tenantId), idempotencyKey: dto.idempotencyKey };
    let adjustment = await this.adjustments.findOne(filter);
    if (!adjustment) {
      try { adjustment = await this.adjustments.create({ ...dto, tenantId: filter.tenantId, productId: new Types.ObjectId(dto.productId), actorId: user.userId }); }
      catch (error) { if ((error as { code?: number }).code === 11000) throw new ConflictException('Adjustment is being processed. Retry with the same key.'); throw error; }
    }
    if (adjustment.productId.toString() !== dto.productId || adjustment.delta !== dto.delta || adjustment.reason !== dto.reason) throw new ConflictException('Idempotency key was used for another adjustment');
    if (adjustment.status === 'rejected') throw new ConflictException('Adjustment was rejected. Review stock and submit a new request.');
    if (adjustment.status !== 'applied') {
      try { await this.products.adjustStockOnce(user.tenantId, dto.productId, dto.delta, dto.idempotencyKey); }
      catch (error) { if (error instanceof ConflictException) await this.adjustments.updateOne({ _id: adjustment._id }, { $set: { status: 'rejected' } }); throw error; }
      adjustment.status = 'applied'; await adjustment.save();
    }
    return adjustment;
  }
}
@ApiTags('stock') @ApiBearerAuth() @Roles(Role.Owner, Role.Admin) @RequiresFeature('inventory') @Controller('stock')
class StockController {
  constructor(private readonly stock: StockService) {}
  @Get('movements') list(@CurrentUser() user: AuthUser, @Query('page') page?: string) { return this.stock.list(user, page); }
  @Post('adjustments') adjust(@CurrentUser() user: AuthUser, @Body() dto: AdjustStockDto) { return this.stock.adjust(user, dto); }
}
@Module({ imports: [ProductModule, MongooseModule.forFeature([{ name: StockAdjustment.name, schema }])], providers: [StockService], controllers: [StockController] }) export class StockModule {}
