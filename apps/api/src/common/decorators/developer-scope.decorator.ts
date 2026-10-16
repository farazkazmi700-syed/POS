import { SetMetadata } from '@nestjs/common';

export const DEVELOPER_SCOPE_KEY = 'developer-scope';
export const AllowDeveloperScope = () => SetMetadata(DEVELOPER_SCOPE_KEY, true);