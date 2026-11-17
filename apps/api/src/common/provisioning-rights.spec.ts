import { provisioningRights } from './provisioning-rights';
describe('business account provisioning', () => {
  it('intersects business role defaults with entitlements', () => {
    expect(provisioningRights('electronics', 'staff', { pos: true, inventory: true, installments: false })).toEqual(['pos', 'products']);
  });
  it('retains deliberate empty grants and restricts administrators', () => {
    expect(provisioningRights('retail', 'admin', { pos: true }, [])).toEqual([]);
    expect(provisioningRights('retail', 'admin', { pos: false }, ['pos', 'settings'])).toEqual(['settings']);
  });
  it('rejects invented permission names', () => expect(() => provisioningRights('retail', 'staff', {}, ['root'])).toThrow('Unknown module right'));
});
