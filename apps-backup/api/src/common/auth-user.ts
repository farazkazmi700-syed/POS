import { Role } from './enums';

/** The identity attached to every authenticated request (req.user). */
export interface AuthUser {
  userId: string;
  tenantId: string;
  role: Role;
  email: string;
  name: string;
}
