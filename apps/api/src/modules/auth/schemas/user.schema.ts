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
  @Prop({ type: Date, default: null }) phoneVerifiedAt: Date | null;
  @Prop({ type: Date, select: false }) securityCodeRequestedAt?: Date;
  @Prop({ default: false }) pinEnabled: boolean;
  @Prop({ required: true, select: false }) passwordHash: string;
  /** Invalidates developer-only access and refresh tokens when incremented. */
  @Prop({ default: 0, select: false }) developerSessionVersion: number;
  @Prop({ type: String, select: false }) pinHash?: string;
  @Prop({ type: String, select: false }) developerStarterHash?: string;
  @Prop({ type: String, select: false }) developerPinHash?: string;
  @Prop({ default: 0 }) sessionVersion: number;
  @Prop({ default: false }) pinRequiresChange: boolean;
  @Prop({ default: 0 }) pinVersion: number;
  @Prop({ default: 0, select: false }) pinFailedAttempts: number;
  @Prop({ type: Date, default: null, select: false }) pinLockedUntil: Date | null;
  @Prop({ type: String, select: false }) pinChallengeId?: string;
  @Prop({ type: String, select: false }) pinResetCodeHash?: string;
  @Prop({ type: Date, select: false }) pinResetExpiresAt?: Date;
  @Prop({ default: 0, select: false }) pinResetAttempts: number;
  @Prop({ required: true, enum: Role }) role: Role;
  /** An empty array denies module access; legacy absent rights follow role defaults. */
  @Prop({ type: [String], default: undefined }) moduleRights?: string[];
  @Prop({ type: [String], default: undefined }) permissions?: string[];
  @Prop({ type: [Types.ObjectId], default: [] }) branchIds: Types.ObjectId[];
  @Prop({ default: false }) superAdmin: boolean;
  @Prop({ default: true }) isActive: boolean;
  /** Forces a new password at next sign-in after an admin reset. */
  @Prop({ type: Date, default: null, select: false }) enrollmentExpiresAt?: Date | null;
  @Prop({ default: false }) passwordRequiresChange: boolean;
}

export type UserDocument = HydratedDocument<User>;
export const UserSchema = SchemaFactory.createForClass(User);
export const RecoveryCodeSchemaDefinition = {
  userId: { type: Types.ObjectId, required: true, index: true },
  codeHash: { type: String, required: true },
  consumedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
} as const;
export const PasswordResetTokenSchemaDefinition = {
  userId: { type: Types.ObjectId, required: true, index: true },
  tokenHash: { type: String, required: true, index: true },
  expiresAt: { type: Date, required: true },
  consumedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
} as const;
UserSchema.index({ superAdmin: 1 }, {
  unique: true,
  partialFilterExpression: { superAdmin: true },
});
