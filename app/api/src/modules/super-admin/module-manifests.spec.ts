import { isExecutableModule, MODULE_MANIFESTS } from './module-manifests';
describe('module execution boundary', () => {
  it('has unique module and submodule identifiers', () => {
    const keys = MODULE_MANIFESTS.flatMap((m) => [m.key, ...m.submodules.map((s) => s.key)]);
    expect(new Set(keys).size).toBe(keys.length);
    expect(MODULE_MANIFESTS.find((m) => m.key === 'dashboard')).toMatchObject({
      moduleId: 'MOD-DASHBOARD',
      label: 'Dashboard',
      releaseState: 'active',
    });
  });
  it('requires installed code, active release and operator enablement', () => {
    expect(isExecutableModule('pos', { isActive: true, releaseState: 'active' })).toBe(true);
    expect(isExecutableModule('pos', { isActive: false, releaseState: 'active' })).toBe(false);
    expect(isExecutableModule('pos')).toBe(false);
    expect(isExecutableModule('pos', { isActive: true, releaseState: 'retired' })).toBe(false);
    expect(isExecutableModule('invented', { isActive: true, releaseState: 'active' })).toBe(false);
    expect(isExecutableModule('ai-chatbot', { isActive: true, releaseState: 'active' })).toBe(false);
  });
});
