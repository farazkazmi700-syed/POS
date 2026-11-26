import { DOMAIN_ROLE_PACKAGES } from './domain-packages';
import { DomainType } from './enums';
import { provisioningRights } from './provisioning-rights';
describe('business account provisioning', () => {
  it('always grants the settings module to provisioned accounts', () => {
    expect(provisioningRights('electronics', 'staff', { pos: true, inventory: true, installments: false })).toEqual(['pos', 'products', 'settings']);
  });
  it('retains deliberate empty grants and restricts administrators', () => {
    expect(provisioningRights('retail', 'admin', { pos: true }, [])).toEqual(['settings']);
    expect(provisioningRights('retail', 'admin', { pos: false }, ['pos'])).toEqual(['settings']);
  });
  it.each([
    'motorcycle-dealer', 'electric-bike-dealer', 'electronics', 'mobile-shop', 'furniture-store',
    'home-appliances', 'solar-equipment', 'car-dealership', 'agricultural-machinery',
  ])('provides installment account defaults for %s and respects plan restrictions', (domain) => {
    expect(Object.values(DomainType)).toContain(domain);
    expect(DOMAIN_ROLE_PACKAGES[domain].accounts.map(({ role }) => role)).toEqual(['admin', 'staff', 'cashier']);
    for (const role of ['admin', 'staff', 'cashier'] as const) {
      expect(provisioningRights(domain, role, { installments: true })).toEqual(['installments', 'settings']);
      expect(provisioningRights(domain, role, { installments: false })).toEqual(['settings']);
    }
  });
  it('rejects invented permission names', () => expect(() => provisioningRights('retail', 'staff', {}, ['root'])).toThrow('Unknown module right'));
});
