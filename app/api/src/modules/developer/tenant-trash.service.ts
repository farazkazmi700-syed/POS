import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import { AuthUser } from '../../common/auth-user';
import { InvoiceService } from '../invoice/invoice.service';
import { Tenant } from '../tenant/schemas/tenant.schema';

const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const SWEEP_MS = 60_000;
const LEASE_MS = 30 * SWEEP_MS;
const TENANT_COLLECTIONS = [
  'branches', 'products', 'customers', 'orders', 'invoicecounters', 'installmentplans',
  'installmentproducts', 'installmentsales', 'stockadjustments', 'checkoutrequests', 'auditevents',
];
const USER_COLLECTIONS = ['recoverychallenges', 'password_reset_tokens', 'recovery_codes'];

@Injectable()
export class TenantTrashService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(TenantTrashService.name);
  private timer?: ReturnType<typeof setInterval>;
  private sweeping = false;

  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly config: ConfigService,
    private readonly invoices: InvoiceService,
  ) {}

  private get db() { return this.connection.db!; }
  private get tenants() { return this.db.collection<Tenant>('tenants'); }

  onApplicationBootstrap() {
    this.timer = setInterval(() => void this.sweep(), SWEEP_MS);
    this.timer.unref();
    void this.sweep();
  }

  onModuleDestroy() { clearInterval(this.timer); }

  async list() {
    const rows = await this.tenants.find({ trashedAt: { $ne: null } }, {
      projection: { name: 1, trashedAt: 1, purgeAt: 1, purgeStartedAt: 1, purgeError: 1 },
      sort: { purgeAt: 1 },
    }).toArray();
    return rows.map((row) => ({
      businessId: row._id.toHexString(), name: row.name, trashedAt: row.trashedAt,
      purgeAt: row.purgeAt, purgeStartedAt: row.purgeStartedAt, purgeError: row.purgeError,
    }));
  }

  async trash(id: string, name: string, confirmed: boolean, actor: AuthUser, now = new Date()) {
    if (!confirmed) throw new BadRequestException('Confirm that the business will lose access.');
    const _id = new Types.ObjectId(id);
    const tenant = await this.tenants.findOne({ _id, trashedAt: null });
    if (!tenant) throw new NotFoundException('Business is unavailable or already in Trash.');
    if (tenant.name !== name) throw new BadRequestException('Enter the exact business name to confirm.');
    const developerEmail = this.config.get<string>('PLATFORM_DEVELOPER_EMAIL')?.trim().toLowerCase();
    const accounts = this.db.collection('users');
    if (actor.tenantId === _id.toHexString() || await accounts.findOne({
      tenantId: _id,
      $or: [{ superAdmin: true }, ...(developerEmail ? [{ email: developerEmail, role: 'owner' }] : [])],
    }, { projection: { _id: 1 } })) {
      throw new ForbiddenException('Platform accounts and your own business cannot be moved to Trash.');
    }

    const purgeAt = new Date(now.getTime() + RETENTION_MS);
    const statusBeforeTrash = tenant.status === 'suspended' ? 'suspended' : 'active';
    const updated = await this.tenants.updateOne({ _id, name, trashedAt: null, status: tenant.status ?? { $exists: false } }, {
      $set: { status: 'suspended', statusBeforeTrash, trashedAt: now, purgeAt, updatedAt: now },
    });
    if (!updated.modifiedCount) throw new ConflictException('Business changed. Refresh before moving it to Trash.');
    await this.audit(actor, 'business.trashed', id, { purgeAt });
    return { businessId: id, purgeAt };
  }

  async restore(id: string, actor: AuthUser, now = new Date()) {
    const _id = new Types.ObjectId(id);
    const filter = { _id, trashedAt: { $ne: null }, purgeAt: { $gt: now }, purgeStartedAt: null };
    const tenant = await this.tenants.findOne(filter);
    if (!tenant) throw new ConflictException('This business can no longer be restored.');
    const status = tenant.statusBeforeTrash ?? 'suspended';
    const updated = await this.tenants.updateOne(filter, {
      $set: { status, updatedAt: now },
      $unset: { trashedAt: '', purgeAt: '', purgeStartedAt: '', purgeLeaseUntil: '', purgeError: '', statusBeforeTrash: '' },
    });
    if (!updated.modifiedCount) throw new ConflictException('This business can no longer be restored.');
    await this.audit(actor, 'business.restored', id, { status });
    return { businessId: id, status };
  }

  async sweep(at?: Date) {
    if (this.sweeping) return;
    this.sweeping = true;
    try {
      for (let index = 0; index < 5; index++) {
        const now = at ?? new Date();
        const purgeLeaseUntil = new Date(now.getTime() + LEASE_MS);
        const tenant = await this.tenants.findOneAndUpdate({
          trashedAt: { $ne: null }, purgeAt: { $ne: null, $lte: now },
          $or: [{ purgeLeaseUntil: null }, { purgeLeaseUntil: { $lte: now } }],
        }, { $set: { purgeStartedAt: now, purgeLeaseUntil } }, { sort: { purgeAt: 1 }, returnDocument: 'after' });
        if (!tenant) break;
        try {
          await this.purge(tenant._id, purgeLeaseUntil);
          await this.tenants.deleteOne({ _id: tenant._id, purgeLeaseUntil });
        } catch {
          await this.tenants.updateOne({ _id: tenant._id, purgeLeaseUntil }, {
            $set: { purgeError: 'Cleanup could not finish. The system will retry automatically.' },
          });
          this.logger.warn('An expired tenant could not be purged. Cleanup will retry.');
        }
      }
    } catch {
      this.logger.warn('Tenant Trash sweep unavailable. Cleanup will retry.');
    } finally {
      this.sweeping = false;
    }
  }

  private async purge(tenantId: Types.ObjectId, purgeLeaseUntil: Date) {
    await this.invoices.purgeTenantInvoices(tenantId.toHexString(), async () => {
      const result = await this.tenants.updateOne({ _id: tenantId, purgeLeaseUntil }, {
        $set: { invoicePurgeRequestedAt: new Date() },
      });
      if (!result.matchedCount) throw new Error('Tenant cleanup lease lost');
    });
    for (const collection of TENANT_COLLECTIONS) await this.db.collection(collection).deleteMany({ tenantId });

    const users = this.db.collection('users');
    for await (const { _id } of users.find({ tenantId }, { projection: { _id: 1 } })) {
      for (const collection of USER_COLLECTIONS) await this.db.collection(collection).deleteMany({ userId: _id });
      await this.db.collection('adminaudits').deleteMany({ actorId: _id });
      await users.deleteOne({ _id, tenantId });
    }

    await this.db.collection('adminaudits').deleteMany({
      entityType: 'business', entityId: tenantId.toHexString(),
      action: { $nin: ['business.trashed', 'business.restored'] },
    });
  }

  private async audit(actor: AuthUser, action: string, id: string, details: Record<string, unknown>) {
    const now = new Date();
    await this.db.collection('adminaudits').insertOne({
      actorId: new Types.ObjectId(actor.userId), actorEmail: actor.email,
      action, entityType: 'business', entityId: id, details, createdAt: now, updatedAt: now,
    });
  }
}
