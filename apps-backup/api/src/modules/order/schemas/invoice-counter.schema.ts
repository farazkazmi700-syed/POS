import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';

/** One sequential counter per tenant per year: tax authorities expect gap-free, unique invoice numbers. */
@Schema()
export class InvoiceCounter {
  @Prop({ type: Types.ObjectId, required: true }) tenantId: Types.ObjectId;
  @Prop({ required: true }) year: number;
  @Prop({ default: 0 }) lastNumber: number;
}

export const InvoiceCounterSchema = SchemaFactory.createForClass(InvoiceCounter);
InvoiceCounterSchema.index({ tenantId: 1, year: 1 }, { unique: true });
