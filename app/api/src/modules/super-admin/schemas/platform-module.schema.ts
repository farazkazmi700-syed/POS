import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/** Developer-defined module entitlement beyond the six built-in feature keys. */
@Schema({ timestamps: true })
export class PlatformModule {
  @Prop({ default: false }) installed: boolean;
  @Prop({ default: false }) managed: boolean;
  @Prop({ default: false }) universal: boolean;
  @Prop({ default: '0.0.0' }) version: string;
  @Prop({ enum: ['active', 'coming-soon', 'retired'], default: 'coming-soon' }) releaseState: string;
  @Prop({ type: [{ _id: false, key: String, label: String }], default: [] }) submodules: { key: string; label: string }[];
  /** Slug key used in feature flags, e.g. 'kitchen-display'. Immutable after creation. */
  @Prop({ required: true, unique: true, trim: true, lowercase: true })
  key: string;
  /** Stable human-readable module id (MOD-…) assigned by the developer engine. */
  @Prop({ trim: true, uppercase: true }) moduleId: string;

  @Prop({ required: true, trim: true }) label: string;
  @Prop({ type: String, default: '' }) description: string;
  @Prop({ default: true, index: true }) isActive: boolean;
}

export type PlatformModuleDocument = HydratedDocument<PlatformModule>;
export const PlatformModuleSchema = SchemaFactory.createForClass(PlatformModule);
