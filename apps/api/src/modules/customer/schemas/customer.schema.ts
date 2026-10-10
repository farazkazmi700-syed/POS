import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

@Schema({ _id: false })
export class Guarantor {
  @Prop() name?: string;
  @Prop() phone?: string;
  @Prop() cnic?: string;
  @Prop() address?: string;
}
export const GuarantorSchema = SchemaFactory.createForClass(Guarantor);

@Schema({ timestamps: true })
export class Customer {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true, index: true }) tenantId: Types.ObjectId;
  @Prop({ required: true, trim: true }) name: string;
  @Prop({ required: true, trim: true }) phone: string;
  /** National ID number. Sensitive: only staff of the same business can read it. */
  @Prop({ trim: true }) cnic?: string;
  @Prop() address?: string;
  @Prop({ type: GuarantorSchema }) guarantor?: Guarantor;
  @Prop() notes?: string;
}

export type CustomerDocument = HydratedDocument<Customer>;
export const CustomerSchema = SchemaFactory.createForClass(Customer);
CustomerSchema.index({ tenantId: 1, name: 1 });
CustomerSchema.index({ tenantId: 1, phone: 1 });
