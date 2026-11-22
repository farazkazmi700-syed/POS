import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { branchScoped } from '../../../common/branch-scope';

export type InstallmentSaleStatus = 'pending' | 'active' | 'completed' | 'overdue' | 'cancelled';
export type InstallmentPaymentFrequency = 'monthly' | 'weekly' | 'biweekly';

@Schema({ _id: false })
export class InstallmentScheduleEntry {
  @Prop({ required: true }) installmentId: string;
  @Prop({ required: true }) dueDate: string;
  @Prop({ required: true, min: 0 }) expectedAmount: number;
  @Prop({ default: 0, min: 0 }) amountPaid: number;
  @Prop({ default: 0, min: 0 }) remainingAmount: number;
  @Prop({ default: 'pending', enum: ['pending', 'partial', 'paid', 'overdue', 'cancelled'] }) status: 'pending' | 'partial' | 'paid' | 'overdue' | 'cancelled';
}

@Schema({ _id: false })
export class InstallmentPaymentEntry {
  @Prop({ required: true }) paymentId: string;
  @Prop() installmentId?: string;
  @Prop() requestedInstallmentId?: string;
  @Prop() idempotencyKey?: string;
  @Prop() receivedBy?: string;
  @Prop({ required: true, min: 0 }) amount: number;
  @Prop({ required: true }) paidAt: Date;
  @Prop({ required: true, enum: ['cash', 'card', 'wallet'] }) mode: 'cash' | 'card' | 'wallet';
  @Prop() note?: string;
  @Prop() receiptNo?: string;
}

const InstallmentScheduleEntrySchema = SchemaFactory.createForClass(InstallmentScheduleEntry);
const InstallmentPaymentEntrySchema = SchemaFactory.createForClass(InstallmentPaymentEntry);

@Schema({ timestamps: true })
export class InstallmentSale {
  /** Monotonic compare-and-swap revision for one-document financial transactions. */
  @Prop({ default: 0 }) paymentRevision: number;
  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true, index: true }) tenantId: Types.ObjectId;
  @Prop({ required: true, unique: true, index: true }) installmentSaleId: string;
  @Prop({ required: true }) agreementId: string;
  @Prop({ type: Types.ObjectId, ref: 'Customer', required: true, index: true }) customerId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'InstallmentProduct', required: true, index: true }) installmentProductId: Types.ObjectId;
  @Prop({ required: true }) saleDate: string;
  @Prop({ required: true, min: 0 }) actualPrice: number;
  @Prop({ required: true, min: 0 }) advancePayment: number;
  @Prop({ required: true, min: 0, max: 100 }) commissionRate: number;
  @Prop({ required: true, min: 0 }) commissionAmount: number;
  @Prop({ required: true, min: 0 }) totalInstallmentPrice: number;
  @Prop({ required: true, min: 1, max: 120 }) installmentDuration: number;
  @Prop({ required: true, enum: ['monthly', 'weekly', 'biweekly'], default: 'monthly' }) paymentFrequency: InstallmentPaymentFrequency;
  @Prop({ required: true, min: 0 }) outstandingBalance: number;
  @Prop({ default: 0, min: 0 }) totalPaid: number;
  @Prop({ default: 'pending', enum: ['pending', 'active', 'completed', 'overdue', 'cancelled'] }) saleStatus: InstallmentSaleStatus;
  @Prop({ type: [InstallmentScheduleEntrySchema], default: [] }) schedule: InstallmentScheduleEntry[];
  @Prop({ type: [InstallmentPaymentEntrySchema], default: [] }) payments: InstallmentPaymentEntry[];
  @Prop({ default: true }) isActive: boolean;
  @Prop({ type: Object, default: {} }) metadata: Record<string, string | number | boolean | null>;
}

export type InstallmentSaleDocument = HydratedDocument<InstallmentSale>;
export const InstallmentSaleSchema = SchemaFactory.createForClass(InstallmentSale);
InstallmentSaleSchema.plugin(branchScoped);
InstallmentSaleSchema.index({ tenantId: 1, customerId: 1, saleStatus: 1 });
InstallmentSaleSchema.index({ tenantId: 1, installmentProductId: 1 });
