import { Role } from '../../common/enums';
import { INSTALLMENT_ALLOWED_ROLES } from './installment.roles';

describe('installment access roles', () => {
  it('allows the existing owner, admin, and cashier workflows only', () => {
    expect(INSTALLMENT_ALLOWED_ROLES).toEqual([Role.Owner, Role.Admin, Role.Cashier]);
    expect(INSTALLMENT_ALLOWED_ROLES).not.toContain('support');
  });
});