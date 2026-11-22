import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { branchScoped } from '../../../common/branch-scope';
@Schema({ timestamps: true })
export class CheckoutRequest {
  @Prop({ type: Types.ObjectId, required: true }) tenantId: Types.ObjectId;
  @Prop({ required: true }) key: string;
  @Prop({ required: true }) hash: string;
  @Prop({ type: Object }) result?: Record<string, unknown>;
}
export const CheckoutRequestSchema = SchemaFactory.createForClass(CheckoutRequest);
CheckoutRequestSchema.plugin(branchScoped);
CheckoutRequestSchema.index({ tenantId: 1, key: 1 }, { unique: true });
