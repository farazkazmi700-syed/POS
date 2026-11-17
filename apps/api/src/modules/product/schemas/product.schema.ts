import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { TaxClass } from '../../../common/enums';
import { branchScoped } from '../../../common/branch-scope';

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
  @Prop({ type: [String], default: [], select: false }) restoredSaleEvents: string[];
  @Prop({ type: [String], default: [], select: false }) stockAdjustmentEvents: string[];
  @Prop() barcode?: string;
}

export type ProductDocument = HydratedDocument<Product>;
export const ProductSchema = SchemaFactory.createForClass(Product);
ProductSchema.plugin(branchScoped);

// SKU must be unique inside a tenant, but is optional.
ProductSchema.index(
  { tenantId: 1, sku: 1 },
  { unique: true, partialFilterExpression: { sku: { $type: 'string' } } },
);
ProductSchema.index({ tenantId: 1, name: 1 });
ProductSchema.index({ tenantId: 1, branchId: 1, barcode: 1 }, { unique: true, partialFilterExpression: { barcode: { $type: 'string' } } });
