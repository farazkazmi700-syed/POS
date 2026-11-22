import { Role } from '../../common/enums';
import { canUpdateSettings } from './settings-access';

const user = { role: Role.Admin, tenantId: 'tenant', userId: 'actor', name: 'Manager', email: '', isSuperAdmin: false, isDeveloper: false, moduleRights: ['settings'] };
const flags = { pos: true, installments: false };

describe('module-specific settings writes', () => {
  it('requires assigned rights for invoices and navigation switches', () => {
    expect(canUpdateSettings(user, flags, { invoicePrefix: 'INV' })).toBe(false);
    expect(canUpdateSettings(user, flags, { navigationVisibility: { pos: true } })).toBe(false);
  });
  it('requires the tenant entitlement even with assigned account rights', () => {
    expect(canUpdateSettings({ ...user, moduleRights: ['settings', 'installments'] }, flags, { installmentMarkupPercent: 10 })).toBe(false);
  });
  it('allows entitled invoice managers to update printing', () => {
    expect(canUpdateSettings({ ...user, moduleRights: ['settings', 'orders'] }, flags, { invoicePrintSettings: { paperSize: 'A4' } })).toBe(true);
  });
});
