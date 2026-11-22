import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

@Schema({ timestamps: true })
export class AdminAudit {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true }) actorId: Types.ObjectId;
  @Prop({ required: true, trim: true }) actorEmail: string;
  @Prop({ required: true, trim: true, index: true }) action: string;
  @Prop({ required: true, trim: true, index: true }) entityType: string;
  @Prop({ required: true, trim: true, index: true }) entityId: string;
  @Prop({ type: MongooseSchema.Types.Mixed, default: {} }) details: Record<string, unknown>;
  createdAt: Date;
}

export type AdminAuditDocument = HydratedDocument<AdminAudit>;
export const AdminAuditSchema = SchemaFactory.createForClass(AdminAudit);
AdminAuditSchema.index({ createdAt: -1 });