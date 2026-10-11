import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { PaymentMode, PlanStatus } from '../../../common/enums';
import { Guarantor, GuarantorSchema } from '../../customer/schemas/customer.schema';

@Schema({ _id: false })
export class PlanItem {
  @Prop({ required: true }) name: string;
  @Prop({ required: true }) qty: number;
  @Prop() serialNo?: string;
}
const PlanItemSchema = SchemaFactory.createForClass(PlanItem);

@Schema({ _id: false })
export class ScheduleEntry {
  @Prop({ required: true }) no: number;
  /** YYYY-MM-DD (date only, so time zones can never shift a due date) */
  @Prop({ required: true }) dueDate: string;
  @Prop({ required: true }) amount: number;
  @Prop({ default: 0 }) paidAmount: number;
  @Prop({ default: 'pending', enum: ['pending', 'partial', 'paid'] }) status: 'pending' | 'partial' | 'paid';
}
const ScheduleEntrySchema = SchemaFactory.createForClass(ScheduleEntry);

@Schema({ _id: false })
export class PlanPayment {
  @Prop({ required: true }) receiptNo: string;
  @Prop() idempotencyKey?: string;
  @Prop({ required: true }) amount: number;
  @Prop({ required: true }) paidAt: Date;
  @Prop({ required: true, enum: [PaymentMode.Cash, PaymentMode.Card, PaymentMode.Wallet] }) mode: PaymentMode;
  @Prop({ required: true }) receivedBy: string;
  @Prop() note?: string;
}
const PlanPaymentSchema = SchemaFactory.createForClass(PlanPayment);

@Schema({ timestamps: true })
export class InstallmentPlan {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true, index: true }) tenantId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'Order', required: true }) orderId: Types.ObjectId;
  @Prop({ required: true }) invoiceNo: string;

  // Snapshot of the customer at the time of sale, so the agreement never changes retroactively.
  @Prop({ type: Types.ObjectId, ref: 'Customer', required: true, index: true }) customerId: Types.ObjectId;
  @Prop({ required: true }) customerName: string;
  @Prop({ required: true }) customerPhone: string;
  @Prop() customerCnic?: string;
  @Prop() customerAddress?: string;
  @Prop({ type: GuarantorSchema }) guarantor?: Guarantor;

  @Prop({ type: [PlanItemSchema], default: [] }) items: PlanItem[];

  @Prop({ required: true }) cashTotal: number;
  @Prop({ required: true }) downPayment: number;
  @Prop({ required: true }) markupPercent: number;
  @Prop({ required: true }) markupAmount: number;
  @Prop({ required: true }) totalPayable: number;
  @Prop({ required: true }) financedAmount: number;
  @Prop({ required: true }) months: number;
  @Prop({ required: true }) monthlyAmount: number;
  @Prop({ required: true }) firstDueDate: string;

  @Prop({ type: [ScheduleEntrySchema], default: [] }) schedule: ScheduleEntry[];
  @Prop({ type: [PlanPaymentSchema], default: [] }) payments: PlanPayment[];
  @Prop({ default: 0 }) paidTotal: number;
  @Prop({ required: true }) balance: number;
  @Prop({ enum: PlanStatus, default: PlanStatus.Active }) status: PlanStatus;
  @Prop({ required: true }) createdByName: string;
}

export type InstallmentPlanDocument = HydratedDocument<InstallmentPlan>;
export const InstallmentPlanSchema = SchemaFactory.createForClass(InstallmentPlan);
InstallmentPlanSchema.index({ tenantId: 1, status: 1, createdAt: -1 });
InstallmentPlanSchema.index({ tenantId: 1, orderId: 1 }, { unique: true });
