import { Controller, Get, Header, Module, PayloadTooLargeException, StreamableFile } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import { createHash } from 'crypto';
import { strToU8, zip } from 'fflate';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../../common/auth-user';
import { permittedActions } from '../../common/action-permissions';
import { AuditService } from '../audit/audit.module';

/** All tenant-scoped collections included in a business backup ZIP. */
export const BUSINESS_BACKUP_COLLECTIONS = [
  'branches', 'products', 'customers', 'orders', 'invoicecounters',
  'installmentplans', 'installmentproducts', 'installmentsales',
  'stockadjustments', 'auditevents', 'users', 'checkoutrequests',
] as const;

/** Fields stripped from user documents before export. */
const SECRET_FIELDS = [
  'passwordHash', 'pinHash', 'developerStarterHash', 'developerPinHash', 'pinChallengeId',
  'pinResetCodeHash', 'emailVerificationCodeHash', 'pinLockedUntil',
  'pinFailedAttempts', 'securityCodeRequestedAt',
] as const;

function stripSecrets(doc: Record<string, unknown>): Record<string, unknown> {
  const clean = { ...doc };
  for (const field of SECRET_FIELDS) delete clean[field];
  return clean;
}

@Controller('support')
export class SupportController {
  constructor(@InjectConnection() private readonly connection: Connection, private readonly audit: AuditService) {}

  @Get()
  information(@CurrentUser() user: AuthUser) {
    return { help: { email: 'kazmitech142@gmail.com', recoveryUrl: '/recover',
      channels: { email: true, whatsapp: false },
      codeExpiryMinutes: 10, maxAttempts: 5, cooldownSeconds: 60 },
      entitlements: { help: true, backup: true },
      backup: { canExport: permittedActions(user).includes('backup.export'), format: 'kazmion-business-export-v2',
        consistentSnapshot: false, includesCredentials: false, includesFiles: false,
        delivery: { mode: 'offline', emailLimitBytes: 15 * 1024 * 1024, driveLimitBytes: 5 * 1024 * 1024 },
        included: ['tenants', ...BUSINESS_BACKUP_COLLECTIONS],
        excluded: ['credentials', 'authentication challenges', 'sessions', 'redis jobs', 'external files'] },
      chatbot: { status: 'coming-soon', label: 'AI Chatbot' } };
  }

  /** Download a ZIP backup of all business records (tenant-scoped). */
  @Get('backup')
  @Header('Cache-Control', 'no-store')
  async backup(@CurrentUser() user: AuthUser): Promise<StreamableFile> {
    const db = this.connection.db!;
    const tenantId = new Types.ObjectId(user.tenantId);
    const allCollections = ['tenants', ...BUSINESS_BACKUP_COLLECTIONS] as const;
    const data: Record<string, unknown[]> = {};
    const counts: Record<string, number> = {};

    for (const name of allCollections) {
      const filter = name === 'tenants' ? { _id: tenantId } : { tenantId };
      const rows = await db.collection(name).find(filter).limit(50001).toArray();
      if (rows.length > 50000) throw new PayloadTooLargeException(`Collection "${name}" exceeds 50 000 rows. Use a native database backup.`);
      // Strip secrets from user records
      data[name] = name === 'users' ? rows.map((row) => stripSecrets(row as Record<string, unknown>)) : rows;
      counts[name] = rows.length;
    }

    // Build per-collection JSON files
    const files: Record<string, Uint8Array> = {};
    for (const [name, rows] of Object.entries(data)) {
      files[`${name}.json`] = strToU8(JSON.stringify(rows, null, 2));
    }

    // Build manifest with metadata + checksums
    const manifest = {
      format: 'kazmion-business-export-v2',
      version: 2,
      generator: 'KazmiOn POS',
      exportedAt: new Date().toISOString(),
      tenantId: tenantId.toString(),
      businessName: data['tenants']?.[0] ? (data['tenants'][0] as Record<string, unknown>).name : null,
      consistentSnapshot: false,
      includesCredentials: false,
      counts,
      totalRecords: Object.values(counts).reduce((sum, count) => sum + count, 0),
      files: Object.entries(files).map(([name, bytes]) => ({
        name, bytes: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      })),
    };
    files['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2));
    files['README.txt'] = strToU8(
      'KazmiOn POS — Business Backup\n' +
      '═══════════════════════════════\n\n' +
      'This ZIP contains a complete export of your business records:\n' +
      '  • Branches, products, customers, orders\n' +
      '  • Installment plans, products & sales\n' +
      '  • Stock adjustments, invoice counters\n' +
      '  • User accounts (secrets stripped), checkout requests\n' +
      '  • Audit events\n\n' +
      'Credentials (passwords, PINs, verification codes) are excluded.\n' +
      'Sessions, Redis jobs, and uploaded files are NOT included.\n\n' +
      'This is a logical export, not a point-in-time recovery image.\n' +
      'Keep MongoDB backups separately for disaster recovery.\n' +
      'Store this file securely — it contains personal and business data.\n',
    );

    // Compress into ZIP
    const zipBytes = await new Promise<Uint8Array>((resolve, reject) =>
      zip(files, { level: 6 }, (error, result) => error ? reject(error) : resolve(result)),
    );

    if (zipBytes.length > 50 * 1024 * 1024) throw new PayloadTooLargeException('ZIP exceeds 50 MB. Use a native database backup.');

    await this.audit.record(user, 'backup.exported', 'support/backup', {
      format: 'kazmion-business-export-v2',
      collections: Object.keys(counts).length,
      totalRecords: manifest.totalRecords,
      zipBytes: zipBytes.length,
    });

    const filename = `kazmion-backup-${(data['tenants']?.[0] as Record<string, unknown>)?.name || 'business'}-${new Date().toISOString().slice(0, 10)}.zip`
      .replace(/[^a-zA-Z0-9._-]/g, '_');

    return new StreamableFile(Buffer.from(zipBytes), {
      type: 'application/zip',
      disposition: `attachment; filename="${filename}"`,
    });
  }
}

@Module({ controllers: [SupportController] })
export class SupportModule {}
