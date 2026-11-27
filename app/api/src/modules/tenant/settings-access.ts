import type { AuthUser } from '../../common/auth-user';
import { permittedActions } from '../../common/action-permissions';
import { enabledModuleRight } from '../../common/provisioning-rights';
import type { UpdateTenantDto } from './dto/update-tenant.dto';

export function canUpdateSettings(user: AuthUser, flags: object, dto: UpdateTenantDto): boolean {
  const allowed = (key: string) => enabledModuleRight(key, flags)
    && (user.moduleRights === undefined || user.moduleRights.includes(key));
  const aliases: Record<string, string> = { barcodeGenerator: 'barcode-generator', barcodeScanner: 'barcode-scanner' };
  const optInRights: Record<string, string> = { 'stock-replenishment': 'products', 'collections-forecast': 'installments' };
  const canChangeNavigation = (key: string) => {
    if (key === 'help') return true;
    if (key === 'backup') return permittedActions(user).includes('backup.export');
    if (Object.hasOwn(optInRights, key)) return (flags as Record<string, unknown>)[key] === true && allowed(optInRights[key]);
    return allowed(aliases[key] ?? key);
  };
  const navigation = Object.entries(dto.navigationVisibility ?? {}).filter(([, value]) => value !== undefined);
  if (!allowed('settings') || navigation.some(([key]) => !canChangeNavigation(key))) return false;

  const invoiceFields = [dto.taxProfile, dto.invoicePrefix, dto.taxRegNo, dto.invoicePrintSettings];
  if (invoiceFields.some((value) => value !== undefined) && !allowed('orders') && !allowed('pos')) return false;

  return dto.installmentMarkupPercent === undefined
    || (allowed('installments') && permittedActions(user).includes('installments.write'));
}
