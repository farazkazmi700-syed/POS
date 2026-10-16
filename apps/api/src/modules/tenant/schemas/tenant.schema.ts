import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { ChargeType, DomainType } from '../../../common/enums';

@Schema({ _id: false })
export class ChargeRule {
  @Prop({ required: true }) label: string;
  @Prop({ required: true, enum: ChargeType }) type: ChargeType;
  @Prop({ required: true, min: 0 }) value: number;
}
const ChargeRuleSchema = SchemaFactory.createForClass(ChargeRule);

/**
 * Per-tenant tax configuration. Rates are DATA, not code, because government
 * rules differ by country / industry and change over time. Defaults below are
 * only a starting point: owners must set the rates that apply to their business.
 */
@Schema({ _id: false })
export class TaxProfile {
  @Prop({ default: 18, min: 0, max: 100 }) gstPercent: number;
  @Prop({ default: 5, min: 0, max: 100 }) reducedGstPercent: number;
  @Prop({ default: 0, min: 0, max: 100 }) serviceChargePercent: number;
  @Prop({ type: [ChargeRuleSchema], default: [] }) otherCharges: ChargeRule[];
}
const TaxProfileSchema = SchemaFactory.createForClass(TaxProfile);

@Schema({ _id: false })
export class NavigationVisibility {
  @Prop({ default: true }) dashboard: boolean;
  @Prop({ default: true }) pos: boolean;
  @Prop({ default: true }) products: boolean;
  @Prop({ default: true }) customers: boolean;
  @Prop({ default: true }) installments: boolean;
  @Prop({ default: true }) orders: boolean;
  @Prop({ default: true }) settings: boolean;
}
const NavigationVisibilitySchema = SchemaFactory.createForClass(NavigationVisibility);

@Schema({ _id: false })
export class TenantFeatureFlags {
  @Prop({ default: true }) pos: boolean;
  @Prop({ default: true }) inventory: boolean;
  @Prop({ default: true }) reports: boolean;
  @Prop({ default: true }) customers: boolean;
  @Prop({ default: true }) installments: boolean;
}
const TenantFeatureFlagsSchema = SchemaFactory.createForClass(TenantFeatureFlags);

@Schema({ timestamps: true })
export class Tenant {
  @Prop({ required: true, trim: true }) name: string;
  @Prop({ required: true, enum: DomainType, default: DomainType.Retail }) domainType: DomainType;
  @Prop() logoUrl?: string;
  @Prop() address?: string;
  @Prop() taxRegNo?: string;
  @Prop({ default: 'PKR' }) currency: string;
  @Prop({ default: 'INV' }) invoicePrefix: string;
  @Prop({ type: TaxProfileSchema, default: () => ({}) }) taxProfile: TaxProfile;
  /** Pre-filled markup % on the installment screen (the cashier can change it per sale). */
  @Prop({ default: 0, min: 0, max: 100 }) installmentMarkupPercent: number;
  @Prop({ type: NavigationVisibilitySchema, default: () => ({}) }) navigationVisibility: NavigationVisibility;
  @Prop({ type: String, enum: ['active', 'suspended'], default: 'active', index: true }) status: 'active' | 'suspended';
  @Prop({ type: TenantFeatureFlagsSchema, default: () => ({}) }) featureFlags: TenantFeatureFlags;
  @Prop({ type: Types.ObjectId, ref: 'SubscriptionPlan', default: null }) subscriptionPlanId: Types.ObjectId | null;
}

export type TenantDocument = HydratedDocument<Tenant>;
export const TenantSchema = SchemaFactory.createForClass(Tenant);
