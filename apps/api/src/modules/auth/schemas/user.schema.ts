import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Role } from '../../../common/enums';

@Schema({ timestamps: true })
export class User {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true, index: true }) tenantId: Types.ObjectId;
  @Prop({ required: true, trim: true }) name: string;
  @Prop({ required: true, unique: true, lowercase: true, trim: true }) email: string;
  @Prop({ type: String, default: null, trim: true, index: true }) phone: string | null;
  @Prop({ type: String, default: null, lowercase: true, trim: true }) recoveryEmail: string | null;
  @Prop({ default: false }) emailVerified: boolean;
  @Prop({ default: false }) phoneVerified: boolean;
  @Prop({ required: true, select: false }) passwordHash: string;
  @Prop({ required: true, enum: Role }) role: Role;
  @Prop({ default: true }) isActive: boolean;
}

export type UserDocument = HydratedDocument<User>;
export const UserSchema = SchemaFactory.createForClass(User);
