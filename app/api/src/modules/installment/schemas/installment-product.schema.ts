import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { branchScoped } from '../../../common/branch-scope';

export type InstallmentProductStatus = 'active' | 'inactive' | 'archived';

@Schema({ timestamps: true })
export class InstallmentProduct {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true, index: true }) tenantId: Types.ObjectId;
  @Prop({ required: true, unique: true, index: true }) installmentProductId: string;
  @Prop({ required: true, trim: true }) name: string;
  @Prop({ trim: true }) brand?: string;
  @Prop({ trim: true }) model?: string;
  @Prop({ trim: true }) category?: string;
  @Prop({ trim: true }) description?: string;
  @Prop({ trim: true }) imageUrl?: string;
  @Prop({ default: 0, min: 0 }) actualPrice: number;
  @Prop({ default: 0, min: 0, max: 100 }) defaultCommissionRate: number;
  @Prop({ default: 'active', enum: ['active', 'inactive', 'archived'] }) status: InstallmentProductStatus;
  @Prop({ default: true }) isActive: boolean;
  @Prop({ type: Object, default: {} }) metadata: Record<string, string | number | boolean | null>;
}

export type InstallmentProductDocument = HydratedDocument<InstallmentProduct>;
export const InstallmentProductSchema = SchemaFactory.createForClass(InstallmentProduct);
InstallmentProductSchema.plugin(branchScoped);
InstallmentProductSchema.index({ tenantId: 1, name: 1 });
InstallmentProductSchema.index({ tenantId: 1, status: 1 });
