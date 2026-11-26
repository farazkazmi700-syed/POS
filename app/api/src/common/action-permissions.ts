export const ACTIONS = ['workspace.read', 'account.self', 'catalog.read', 'inventory.write', 'sales.create', 'sales.read', 'sales.void', 'sales.refund.approve', 'receipts.read', 'receipts.regenerate', 'customers.read', 'customers.write', 'installments.read', 'installments.write', 'reports.read', 'reports.export', 'users.read', 'users.invite', 'users.roles.assign', 'users.disable', 'tax.configure', 'branches.read', 'branches.write', 'audit.read', 'backup.export'] as const;
export type Action = typeof ACTIONS[number];
const cashierActions: readonly Action[] = ['workspace.read', 'account.self', 'branches.read', 'catalog.read', 'sales.create', 'sales.read', 'receipts.read', 'customers.read', 'customers.write', 'installments.read', 'installments.write'];

export function permittedActions(user: { role: string; permissions?: string[] }): readonly string[] {
  // A business export is a tenant-level data operation. Keep it on the owner
  // account unless an explicit, reviewed delegation model is introduced.
  const defaults = user.role === 'owner'
    ? ACTIONS
    : user.role === 'admin'
      ? ACTIONS.filter((action) => action !== 'backup.export')
      : user.role === 'cashier'
        ? cashierActions
        : [];
  return user.permissions === undefined || user.role === 'owner' ? defaults : defaults.filter((action) => action === 'account.self' || action === 'workspace.read' || user.permissions!.includes(action));
}

/** Unknown routes deny by default; personal-account endpoints stay self scoped. */
export function actionForRoute(controller: string, handler: string, method: string): Action | undefined {
  if (controller === 'support' && method === 'POST' && handler === 'backup/sync') return 'backup.export';
  if (controller === 'support') return method === 'GET' ? handler === 'backup' ? 'backup.export' : 'workspace.read' : undefined;
  if (controller === 'auth') {
    if (handler === 'change-password' && method === 'POST') return 'account.self';
    if (handler === 'logout' || handler === 'me' || handler.startsWith('me/')) return 'account.self';
    if (handler === 'staff') return method === 'GET' ? 'users.read' : 'users.invite';
    if (handler === 'staff/:id/rights') return 'users.roles.assign';
    if (handler === 'staff/:id/status') return 'users.disable';
  }
  if (controller === 'tenant') return method === 'GET' ? 'workspace.read' : 'tax.configure';
  if (controller === 'branches') return method === 'GET' ? 'branches.read' : 'branches.write';
  if (controller === 'products') return method === 'GET' ? 'catalog.read' : 'inventory.write';
  if (controller === 'barcodes') return 'catalog.read';
  if (controller === 'stock') return 'inventory.write';
  if (controller === 'customers') return method === 'GET' ? 'customers.read' : 'customers.write';
  if (controller === 'reports') return 'reports.read';
  if (controller === 'audit') return 'audit.read';
  if (controller === 'installments') return method === 'GET' || handler === 'quote' ? 'installments.read' : 'installments.write';
  if (controller === 'orders/:id/invoice') return method === 'GET' ? 'receipts.read' : 'receipts.regenerate';
  if (controller === 'orders') {
    if (handler === 'stats/summary') return 'reports.read';
    if (handler === ':id/void') return 'sales.void';
    if (handler === ':id/refund') return 'sales.refund.approve';
    return method === 'GET' ? 'sales.read' : handler === '/' || handler === 'preview' ? 'sales.create' : undefined;
  }
  return undefined;
}
