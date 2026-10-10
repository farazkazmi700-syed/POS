import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
/** Skip JWT auth for a route (login, register, refresh). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
