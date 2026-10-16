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
  @Prop({ type: Date, default: null }) emailVerifiedAt: Date | null;
  @Prop({ type: String, select: false }) emailVerificationCodeHash?: string;
  @Prop({ type: Date, select: false }) emailVerificationExpiresAt?: Date;
  @Prop({ default: 0, select: false }) emailVerificationAttempts: number;
  @Prop({ default: false }) phoneVerified: boolean;
  @Prop({ required: true, select: false }) passwordHash: string;
  @Prop({ type: String, select: false }) developerPinHash?: string;
  @Prop({ default: 0, select: false }) developerPinVersion: number;
  @Prop({ type: String, select: false }) pinHash?: string;
  @Prop({ default: false }) pinRequiresChange: boolean;
  @Prop({ default: 0 }) pinVersion: number;
  @Prop({ default: 0, select: false }) pinFailedAttempts: number;
  @Prop({ type: Date, default: null, select: false }) pinLockedUntil: Date | null;
  @Prop({ type: String, select: false }) pinChallengeId?: string;
  @Prop({ type: String, select: false }) pinResetCodeHash?: string;
  @Prop({ type: Date, select: false }) pinResetExpiresAt?: Date;
  @Prop({ default: 0, select: false }) pinResetAttempts: number;
  @Prop({ required: true, enum: Role }) role: Role;
  @Prop({ default: false }) superAdmin: boolean;
  @Prop({ default: true }) isActive: boolean;
}

export type UserDocument = HydratedDocument<User>;
export const UserSchema = SchemaFactory.createForClass(User);
UserSchema.index({ superAdmin: 1 }, {
  unique: true,
  partialFilterExpression: { superAdmin: true },
});
