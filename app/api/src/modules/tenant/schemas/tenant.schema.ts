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
export class InvoicePrintSettings {
  /** Paper size for generated PDFs. A4 is the default; A5 / Receipt suit smaller rolls. */
  @Prop({ enum: ['A4', 'A5', 'A6', 'Receipt', '80mm', '58mm', 'custom'], default: 'A4' }) paperSize: 'A4' | 'A5' | 'A6' | 'Receipt' | '80mm' | '58mm' | 'custom';
  @Prop({ min: 40, max: 420, default: 80 }) widthMm: number;
  @Prop({ min: 40, max: 1000, default: 200 }) heightMm: number;
  @Prop({ default: '' }) stamp: string;
  @Prop({ default: '' }) watermark: string;
  @Prop({ default: true }) logoWatermark: boolean;
  @Prop({ default: 'Thank you for your business.' }) footerText: string;
  /** Page orientation for wide item tables. */
  @Prop({ enum: ['portrait', 'landscape'], default: 'portrait' }) orientation: 'portrait' | 'landscape';
}
const InvoicePrintSettingsSchema = SchemaFactory.createForClass(InvoicePrintSettings);

@Schema({ _id: false })
export class NavigationVisibility {
  @Prop({ default: true }) dashboard: boolean;
  @Prop({ default: true }) pos: boolean;
  @Prop({ default: true }) products: boolean;
  @Prop({ default: true }) customers: boolean;
  @Prop({ default: true }) installments: boolean;
  @Prop({ default: true }) barcodeGenerator: boolean;
  @Prop({ default: true }) barcodeScanner: boolean;
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
  @Prop({ default: true }) barcodes: boolean;
  @Prop({ default: false }) 'data-sync'?: boolean;
}
const TenantFeatureFlagsSchema = SchemaFactory.createForClass(TenantFeatureFlags);

/** Developer-assigned custom module entitlements (PlatformModule keys) granted to this business. */
@Schema({ _id: false })
export class TenantCustomModules {
  @Prop({ type: [String], default: [] }) keys: string[];
}
const TenantCustomModulesSchema = SchemaFactory.createForClass(TenantCustomModules);

@Schema({ timestamps: true })
export class Tenant {
  @Prop({ type: Types.ObjectId, default: null }) defaultBranchId?: Types.ObjectId | null;
  @Prop({ default: 1, min: 1 }) branchLimit: number;
  @Prop({ default: 0, min: 0 }) branchCount: number;
  @Prop({ enum: ['cloud', 'offline', 'hybrid'], default: 'cloud' }) deploymentMode: 'cloud' | 'offline' | 'hybrid';
  @Prop({ type: Date, default: null }) licenseExpiresAt?: Date | null;
  @Prop({ default: 'Asia/Karachi' }) timeZone: string;
  @Prop({ required: true, trim: true }) name: string;
  @Prop({ required: true, enum: DomainType, default: DomainType.Retail }) domainType: DomainType;
  @Prop() logoUrl?: string;
  @Prop() address?: string;
  @Prop() taxRegNo?: string;
  @Prop({ default: 'PKR' }) currency: string;
  @Prop({ default: 'INV' }) invoicePrefix: string;
  @Prop({ type: TaxProfileSchema, default: () => ({}) }) taxProfile: TaxProfile;
  @Prop({ type: InvoicePrintSettingsSchema, default: () => ({}) }) invoicePrintSettings: InvoicePrintSettings;
  /** Pre-filled markup % on the installment screen (the cashier can change it per sale). */
  @Prop({ default: 0, min: 0, max: 100 }) installmentMarkupPercent: number;
  @Prop({ type: NavigationVisibilitySchema, default: () => ({}) }) navigationVisibility: NavigationVisibility;
  @Prop({ type: String, enum: ['active', 'suspended'], default: 'active', index: true }) status: 'active' | 'suspended';
  @Prop({ type: TenantFeatureFlagsSchema, default: () => ({}) }) featureFlags: TenantFeatureFlags;
  /** Custom module entitlements granted by the developer (keys from the PlatformModule catalog). */
  @Prop({ type: [String], default: [] }) customModules: string[];
  @Prop({ type: Types.ObjectId, ref: 'SubscriptionPlan', default: null }) subscriptionPlanId: Types.ObjectId | null;
}

export type TenantDocument = HydratedDocument<Tenant>;
export const TenantSchema = SchemaFactory.createForClass(Tenant);
