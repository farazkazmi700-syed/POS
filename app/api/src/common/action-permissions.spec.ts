import { actionForRoute, permittedActions } from './action-permissions';
describe('action permissions', () => {
  it('denies unknown roles and unmapped API routes', () => {
    expect(permittedActions({ role: 'unrecognized' })).toEqual([]);
    expect(actionForRoute('unknown', '/', 'POST')).toBeUndefined();
  });
  it('keeps cashiers out of refunds, staff management, and cost edits', () => {
    const allowed = permittedActions({ role: 'cashier' });
    expect(allowed).toContain('sales.create');
    for (const action of ['inventory.write', 'users.invite', 'users.roles.assign', 'sales.refund.approve']) expect(allowed).not.toContain(action);
  });
  it('reserves tenant exports for the business owner', () => {
    expect(permittedActions({ role: 'owner' })).toContain('backup.export');
    expect(permittedActions({ role: 'admin' })).not.toContain('backup.export');
    expect(permittedActions({ role: 'cashier' })).not.toContain('backup.export');
  });
  it('custom grants can restrict but never expand role privileges', () => {
    expect(permittedActions({ role: 'cashier', permissions: ['users.invite', 'sales.create'] })).not.toContain('users.invite');
    expect(permittedActions({ role: 'admin', permissions: ['reports.read'] })).not.toContain('sales.void');
  });
  it('maps sensitive actions independently', () => {
    expect(actionForRoute('orders', ':id/refund', 'POST')).toBe('sales.refund.approve');
    expect(actionForRoute('auth', 'staff/:id/rights', 'PATCH')).toBe('users.roles.assign');
    expect(actionForRoute('products', ':id', 'PATCH')).toBe('inventory.write');
  });
});
