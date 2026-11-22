import { SetMetadata } from '@nestjs/common';
import { FeatureRequirement } from '../features';

export const FEATURE_KEY = 'required-feature';
export const RequiresFeature = (feature: FeatureRequirement) => SetMetadata(FEATURE_KEY, feature);