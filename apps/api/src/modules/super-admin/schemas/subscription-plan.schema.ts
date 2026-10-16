import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ _id: false })
export class PlanFeatures {
  @Prop({ required: true, default: true }) pos: boolean;
  @Prop({ required: true, default: true }) inventory: boolean;
  @Prop({ required: true, default: true }) reports: boolean;
  @Prop({ required: true, default: true }) customers: boolean;
  @Prop({ required: true, default: true }) installments: boolean;
}
const PlanFeaturesSchema = SchemaFactory.createForClass(PlanFeatures);

@Schema({ timestamps: true })
export class SubscriptionPlan {
  @Prop({ required: true, unique: true, trim: true }) name: string;
  @Prop({ type: String, default: '' }) description: string;
  @Prop({ required: true, min: 0 }) price: number;
  @Prop({ required: true, enum: ['monthly', 'yearly'], default: 'monthly' }) billingInterval: 'monthly' | 'yearly';
  @Prop({ type: PlanFeaturesSchema, default: () => ({}) }) features: PlanFeatures;
  @Prop({ default: true, index: true }) isActive: boolean;
}

export type SubscriptionPlanDocument = HydratedDocument<SubscriptionPlan>;
export const SubscriptionPlanSchema = SchemaFactory.createForClass(SubscriptionPlan);