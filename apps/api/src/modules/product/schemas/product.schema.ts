import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { TaxClass } from '../../../common/enums';

@Schema({ timestamps: true })
export class Product {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true, index: true }) tenantId: Types.ObjectId;
  @Prop({ required: true, trim: true }) name: string;
  @Prop({ trim: true }) sku?: string;
  @Prop({ trim: true }) category?: string;
  @Prop({ default: 'pcs' }) unit: string;
  @Prop({ required: true, min: 0 }) price: number;
  @Prop({ default: 0, min: 0 }) costPrice: number;
  @Prop({ default: 0, min: 0 }) stockQty: number;
  @Prop({ default: 5, min: 0 }) lowStockThreshold: number;
  /** false for services (salon, repairs) and made-to-order items (restaurant). */
  @Prop({ default: true }) trackStock: boolean;
  @Prop({ required: true, enum: TaxClass, default: TaxClass.Standard }) taxClass: TaxClass;
  /** Domain-specific fields: pharmacy {batchNo, expiry}, restaurant {spiceLevel}, ... */
  @Prop({ type: Object, default: {} }) attributes: Record<string, string | number | boolean>;
  @Prop() imageUrl?: string;
  @Prop({ default: true }) isActive: boolean;
}

export type ProductDocument = HydratedDocument<Product>;
export const ProductSchema = SchemaFactory.createForClass(Product);

// SKU must be unique inside a tenant, but is optional.
ProductSchema.index(
  { tenantId: 1, sku: 1 },
  { unique: true, partialFilterExpression: { sku: { $type: 'string' } } },
);
ProductSchema.index({ tenantId: 1, name: 1 });
