import { provisioningRights } from './provisioning-rights';
describe('business account provisioning', () => {
  it('always grants the settings module to provisioned accounts', () => {
    expect(provisioningRights('electronics', 'staff', { pos: true, inventory: true, installments: false })).toEqual(['pos', 'products', 'settings']);
  });
  it('retains deliberate empty grants and restricts administrators', () => {
    expect(provisioningRights('retail', 'admin', { pos: true }, [])).toEqual(['settings']);
    expect(provisioningRights('retail', 'admin', { pos: false }, ['pos'])).toEqual(['settings']);
  });
  it('rejects invented permission names', () => expect(() => provisioningRights('retail', 'staff', {}, ['root'])).toThrow('Unknown module right'));
});
