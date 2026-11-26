/** Reads include dependencies needed by checkout, barcode tools, and reporting. */
export function requiredModuleRights(controller: string, handler: string, method: string): string[] {
  if (controller === 'barcodes') return handler === 'lookup' ? ['barcode-scanner', 'pos'] : ['barcode-generator'];
  if (controller === 'stock') return ['products'];
  if (controller === 'products' && handler === 'replenishment') return ['products'];
  if (controller === 'products') return method === 'GET'
    ? ['products', 'pos', 'barcode-generator', 'barcode-scanner'] : ['products'];
  if (controller === 'customers') return method === 'GET' ? ['customers', 'pos', 'installments'] : ['customers', 'installments'];
  if (controller === 'installments') return ['installments'];
  if (controller === 'reports' || (controller === 'orders' && handler === 'stats/summary')) return ['dashboard'];
  if (controller.startsWith('orders')) {
    if (controller === 'orders' && method === 'POST' && (handler === '/' || handler === 'preview')) return ['pos'];
    return ['orders', 'pos'];
  }
  if (controller === 'tenant' && method !== 'GET') return ['settings'];
  if (controller === 'auth' && handler.startsWith('staff')) return ['settings'];
  if (controller === 'developer' && handler === 'public-modules') return [];
  return [];
}

export function hasModuleRights(user: { role: string; moduleRights?: string[]; isSuperAdmin?: boolean; isDeveloper?: boolean }, controller: string, handler: string, method: string): boolean {
  if (user.role === 'owner' || user.isSuperAdmin || user.isDeveloper || user.moduleRights === undefined) return true;
  const required = requiredModuleRights(controller, handler, method);
  return required.length === 0 || required.some((right) => user.moduleRights!.includes(right));
}
