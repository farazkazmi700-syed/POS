import { Controller, Get, Header, Module, PayloadTooLargeException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, mongo, Types } from 'mongoose';
import { createHash } from 'crypto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../../common/auth-user';
import { permittedActions } from '../../common/action-permissions';
import { AuditService } from '../audit/audit.module';

// Explicit collection allowlist: no credentials, recovery challenges, platform records or other tenants.
export const BUSINESS_BACKUP_COLLECTIONS = ['branches', 'products', 'customers', 'orders', 'invoicecounters',
  'installmentplans', 'installmentproducts', 'installmentsales', 'stockadjustments', 'auditevents'] as const;

@Controller('support')
export class SupportController {
  constructor(@InjectConnection() private readonly connection: Connection, private readonly audit: AuditService) {}

  @Get()
  information(@CurrentUser() user: AuthUser) {
    return { help: { email: 'kazmitech142@gmail.com', recoveryUrl: '/recover',
      channels: { email: true, whatsapp: false },
      codeExpiryMinutes: 10, maxAttempts: 5, cooldownSeconds: 60 },
      entitlements: { help: true, backup: true },
      backup: { canExport: permittedActions(user).includes('backup.export'), format: 'kazmion-business-export-v1',
        consistentSnapshot: false, includesCredentials: false, includesFiles: false,
        delivery: { mode: 'offline', emailLimitBytes: 15 * 1024 * 1024, driveLimitBytes: 5 * 1024 * 1024 },
        included: ['tenants', 'branches', 'products', 'customers', 'orders', 'invoicecounters',
          'installmentplans', 'installmentproducts', 'installmentsales', 'stockadjustments', 'auditevents'],
        excluded: ['credentials', 'authentication challenges', 'sessions', 'redis jobs', 'external files'] },
      chatbot: { status: 'coming-soon', label: 'AI Chatbot' } };
  }

  @Get('backup')
  @Header('Cache-Control', 'no-store')
  async backup(@CurrentUser() user: AuthUser) {
    const db = this.connection.db!;
    const tenantId = new Types.ObjectId(user.tenantId);
    const collections: Record<string, unknown[]> = {};
    for (const name of ['tenants', ...BUSINESS_BACKUP_COLLECTIONS]) {
      const filter = name === 'tenants' ? { _id: tenantId } : { tenantId };
      const rows = await db.collection(name).find(filter).limit(10001).toArray();
      if (rows.length > 10000) throw new PayloadTooLargeException('Use a native database backup for this data volume');
      collections[name] = rows;
    }
    const payload = mongo.BSON.EJSON.stringify({ tenantId, exportedAt: new Date(), collections }, { relaxed: false });
    if (Buffer.byteLength(payload) > 20 * 1024 * 1024) throw new PayloadTooLargeException('Use a native database backup for this data volume');
    await this.audit.record(user, 'backup.exported', 'support/backup', { format: 'kazmion-business-export-v1', collections: Object.keys(collections).length });
    return { format: 'kazmion-business-export-v1', consistentSnapshot: false,
      sha256: createHash('sha256').update(payload).digest('hex'), payload };
  }
}

@Module({ controllers: [SupportController] })
export class SupportModule {}
