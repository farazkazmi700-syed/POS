import type { AuthUser } from '../../common/auth-user';
import { permittedActions } from '../../common/action-permissions';
import { enabledModuleRight } from '../../common/provisioning-rights';
import type { UpdateTenantDto } from './dto/update-tenant.dto';

export function canUpdateSettings(user: AuthUser, flags: object, dto: UpdateTenantDto): boolean {
  const allowed = (key: string) => enabledModuleRight(key, flags)
    && (user.moduleRights === undefined || user.moduleRights.includes(key));
  const aliases: Record<string, string> = { barcodeGenerator: 'barcode-generator', barcodeScanner: 'barcode-scanner' };
  const navigation = Object.entries(dto.navigationVisibility ?? {}).filter(([, value]) => value !== undefined);
  if (!allowed('settings') || navigation.some(([key]) => !allowed(aliases[key] ?? key))) return false;

  const invoiceFields = [dto.taxProfile, dto.invoicePrefix, dto.taxRegNo, dto.invoicePrintSettings];
  if (invoiceFields.some((value) => value !== undefined) && !allowed('orders') && !allowed('pos')) return false;

  return dto.installmentMarkupPercent === undefined
    || (allowed('installments') && permittedActions(user).includes('installments.write'));
}
