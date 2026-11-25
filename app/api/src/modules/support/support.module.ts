import { BadGatewayException, ConflictException, Controller, ForbiddenException, Get, Header, Module, NotFoundException, PayloadTooLargeException, Post, ServiceUnavailableException, StreamableFile } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RequiresFeature } from '../../common/decorators/feature.decorator';
import { SuperAdminModule } from '../super-admin/super-admin.module';
import { ModuleRegistryService } from '../super-admin/module-registry.service';
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

const EXPORT_FORMAT = 'kazmion-business-export-v2';
const COLLECTION_ROW_LIMIT = 50_000;
const UNCOMPRESSED_LIMIT = 100 * 1024 * 1024;
const ZIP_LIMIT = 50 * 1024 * 1024;

// Keep authentication fields out even as the account schema evolves.
const USER_EXPORT_FIELDS = {
  _id: 1, tenantId: 1, name: 1, email: 1, phone: 1, role: 1,
  moduleRights: 1, permissions: 1, branchIds: 1, isActive: 1,
  createdAt: 1, updatedAt: 1,
} as const;

@Controller('support')
export class SupportController {
  private syncInProgress = false;

  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
    private readonly registry: ModuleRegistryService,
  ) {}

  private async syncEntitled(user: AuthUser) {
    if (!permittedActions(user).includes('backup.export')) return false;
    const tenant = await this.connection.db!.collection('tenants').findOne(
      { _id: new Types.ObjectId(user.tenantId) },
      { projection: { featureFlags: 1, deploymentMode: 1 } },
    );
    return tenant?.featureFlags?.['data-sync'] === true
      && ['cloud', 'hybrid'].includes(tenant.deploymentMode)
      && (await this.registry.executableKeys(['data-sync'])).includes('data-sync');
  }

  private syncDestination(tenantId: string) {
    const endpoint = this.config.get<string>('DATA_SYNC_URL');
    const token = this.config.get<string>('DATA_SYNC_TOKEN');
    if (!endpoint || !token || !/^[a-f0-9]{64}$/i.test(token)
        || this.config.get<string>('DATA_SYNC_TENANT_ID') !== tenantId) return null;
    try {
      const url = new URL(endpoint);
      if (url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash) {
        return { url, token };
      }
    } catch { return null; }
    return null;
  }

  @Post('backup/sync')
  @RequiresFeature('data-sync')
  @Header('Cache-Control', 'no-store')
  async sync(@CurrentUser() user: AuthUser) {
    if (!(await this.syncEntitled(user))) throw new ForbiddenException('Cloud sync is unavailable for this business.');
    const destination = this.syncDestination(user.tenantId);
    if (!destination) throw new ServiceUnavailableException('Ask your operator to configure this business?s cloud destination.');
    if (this.syncInProgress) throw new ConflictException('A business sync is already in progress.');
    this.syncInProgress = true;
    try {
      const { bytes } = await this.createArchive(user);
      try {
        const response = await fetch(destination.url, {
          method: 'POST', redirect: 'error', signal: AbortSignal.timeout(90_000),
          headers: {
            Authorization: `Bearer ${destination.token}`,
            'Content-Type': 'application/zip',
            'X-Business-Id': user.tenantId,
          },
          body: new Uint8Array(bytes),
        });
        await response.body?.cancel();
        if (response.status !== 201) throw new Error('Upload rejected');
      } catch {
        throw new BadGatewayException('The cloud destination did not confirm the upload. Try again.');
      }
      const syncedAt = new Date().toISOString();
      await this.audit.record(user, 'backup.synced', 'support/backup/sync', { syncedAt, zipBytes: bytes.length });
      return { syncedAt };
    } finally {
      this.syncInProgress = false;
    }
  }

  @Get()
  @Header('Cache-Control', 'no-store')
  async information(@CurrentUser() user: AuthUser) {
    const entitled = await this.syncEntitled(user);
    return { help: { email: 'info.kazmion@gmail.com', recoveryUrl: '/recover',
      channels: { email: true, whatsapp: false },
      codeExpiryMinutes: 10, maxAttempts: 5, cooldownSeconds: 60 },
      entitlements: { help: true, backup: true },
      backup: { canExport: permittedActions(user).includes('backup.export'), format: EXPORT_FORMAT,
        consistentSnapshot: false, includesCredentials: false, includesFiles: false,
        sync: { entitled, configured: entitled && !!this.syncDestination(user.tenantId) },
        delivery: { mode: 'offline', emailLimitBytes: 15 * 1024 * 1024, driveLimitBytes: 5 * 1024 * 1024 },
        included: ['tenants', ...BUSINESS_BACKUP_COLLECTIONS],
        excluded: ['credentials', 'authentication challenges', 'sessions', 'redis jobs', 'external files'] },
      chatbot: { status: 'coming-soon', label: 'AI Chatbot' } };
  }

  /** Download a ZIP backup of all business records (tenant-scoped). */
  @Get('backup')
  @Header('Cache-Control', 'no-store')
  async backup(@CurrentUser() user: AuthUser): Promise<StreamableFile> {
    const { bytes, filename, manifest } = await this.createArchive(user);
    await this.audit.record(user, 'backup.exported', 'support/backup', {
      format: EXPORT_FORMAT, collections: manifest.files.length,
      totalRecords: manifest.totalRecords, zipBytes: bytes.length,
    });
    return new StreamableFile(bytes, {
      type: 'application/zip',
      disposition: `attachment; filename="${filename}"`,
    });
  }

  private async createArchive(user: AuthUser) {
    const db = this.connection.db!;
    const tenantId = new Types.ObjectId(user.tenantId);
    const allCollections = ['tenants', ...BUSINESS_BACKUP_COLLECTIONS] as const;
    const counts: Record<string, number> = {};
    const files: Record<string, Uint8Array> = {};
    let bytesWritten = 0;
    let businessName: string | null = null;

    for (const name of allCollections) {
      const filter = name === 'tenants' ? { _id: tenantId } : { tenantId };
      const projection = name === 'users' ? USER_EXPORT_FIELDS : undefined;
      const cursor = db.collection(name).find(filter, { projection, limit: COLLECTION_ROW_LIMIT + 1 });
      const records: string[] = [];
      bytesWritten += 2; // JSON array delimiters
      try {
        for await (const row of cursor) {
          if (records.length >= COLLECTION_ROW_LIMIT) {
            throw new PayloadTooLargeException(`The ${name} collection exceeds 50,000 records. Contact your backup operator for a native backup.`);
          }
          if (name === 'tenants' && typeof row.name === 'string') businessName = row.name;
          const record = JSON.stringify(row);
          bytesWritten += Buffer.byteLength(record) + Number(records.length > 0);
          if (bytesWritten > UNCOMPRESSED_LIMIT) {
            throw new PayloadTooLargeException('Business records exceed the export size limit. Contact your backup operator for a native backup.');
          }
          records.push(record);
        }
      } finally {
        if (!cursor.closed) await cursor.close();
      }
      if (name === 'tenants' && records.length === 0) throw new NotFoundException('Business not found');
      files[`${name}.json`] = strToU8(`[${records.join(',')}]`);
      counts[name] = records.length;
    }

    const exportedAt = new Date().toISOString();
    // Build manifest with metadata + checksums
    const manifest = {
      format: EXPORT_FORMAT,
      version: 2,
      generator: 'KazmiOn POS',
      exportedAt,
      tenantId: tenantId.toString(),
      businessName,
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
    files['README.txt'] = strToU8([
      'KazmiOn POS business export',
      '',
      'This ZIP contains tenant-scoped business records and a manifest with record counts and SHA-256 checksums.',
      'Account records include business contact and access assignments. Credentials, recovery data and sessions are excluded.',
      'Uploaded files, invoice PDFs and background jobs are maintained separately.',
      'Records are read across collections while the business is operating. Export during a quiet period for fewer concurrent changes.',
      'Keep native database and file backups for full recovery. Store this ZIP on encrypted storage with access restricted to authorized staff.',
      '',
    ].join('\n'));

    // Compress into ZIP
    const zipBytes = await new Promise<Uint8Array>((resolve, reject) =>
      zip(files, { level: 6 }, (error, result) => error ? reject(error) : resolve(result)),
    );

    if (zipBytes.length > ZIP_LIMIT) throw new PayloadTooLargeException('The ZIP exceeds 50 MB. Contact your backup operator for a native backup.');

    const slug = (businessName ?? '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64) || 'business';
    const timestamp = exportedAt.replace(/[:.]/g, '-');
    const filename = `kazmion-backup-${slug}-${timestamp}.zip`;

    return { bytes: Buffer.from(zipBytes.buffer, zipBytes.byteOffset, zipBytes.byteLength), filename, manifest };
  }
}

@Module({ imports: [SuperAdminModule], controllers: [SupportController] })
export class SupportModule {}
