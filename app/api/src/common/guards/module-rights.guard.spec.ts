import { hasModuleRights } from '../module-rights';

class ForbiddenException extends Error {}

describe('module rights enforcement', () => {
  function check(rights: string[] | undefined, controller: string, method = 'GET', handler = '/', role = 'cashier', isPublic = false) {
    if (!isPublic && !hasModuleRights({ role, moduleRights: rights }, controller, handler, method)) throw new ForbiddenException();
    return true;
  }

  it('blocks direct API requests to a denied module, even when logged in', () => {
    expect(() => check(['pos'], 'installments')).toThrow(ForbiddenException);
    expect(() => check([], 'orders')).toThrow(ForbiddenException);
    expect(check(['installments'], 'installments')).toBe(true);
  });
  it('preserves checkout dependencies without granting inventory writes', () => {
    expect(check(['pos'], 'products')).toBe(true);
    expect(check(['pos'], 'customers')).toBe(true);
    expect(check(['pos'], 'orders', 'POST')).toBe(true);
    expect(() => check(['pos'], 'products', 'POST')).toThrow(ForbiddenException);
    expect(() => check(['orders'], 'orders', 'POST')).toThrow(ForbiddenException);
  });
  it('requires settings rights for staff management and tenant changes', () => {
    expect(() => check(['pos'], 'auth', 'PATCH', 'staff/:id/rights', 'admin')).toThrow(ForbiddenException);
    expect(() => check(['pos'], 'tenant', 'PATCH', 'me', 'admin')).toThrow(ForbiddenException);
    expect(check(['settings'], 'auth', 'GET', 'staff', 'admin')).toBe(true);
    expect(check([], 'tenant', 'GET', 'me')).toBe(true);
  });
  it('keeps owner, legacy unrestricted, and public access compatible', () => {
    expect(check([], 'products', 'POST', '/', 'owner')).toBe(true);
    expect(check(undefined, 'products')).toBe(true);
    expect(check([], 'auth', 'POST', 'login', 'cashier', true)).toBe(true);
  });
  it('allows reports only with dashboard rights and barcode catalog reads with barcode rights', () => {
    expect(() => check(['orders'], 'orders', 'GET', 'stats/summary')).toThrow(ForbiddenException);
    expect(check(['dashboard'], 'reports')).toBe(true);
    expect(check(['barcode-generator'], 'products')).toBe(true);
  });
  it('separates barcode generation and lookup rights', () => {
    expect(check(['barcode-generator'], 'barcodes', 'POST', 'generate')).toBe(true);
    expect(check(['barcode-scanner'], 'barcodes', 'GET', 'lookup')).toBe(true);
    expect(() => check(['barcode-scanner'], 'barcodes', 'POST', 'generate')).toThrow();
    expect(() => check(['barcode-generator'], 'barcodes', 'GET', 'lookup')).toThrow();
    expect(() => check([], 'barcodes', 'GET', 'products')).toThrow();
  });
});
