import { waitForBusinessDatabase } from '../../common/business-database';
import { branchContext } from '../../common/branch-scope';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcryptjs';
import { Model, Types } from 'mongoose';
import { AuthUser } from '../../common/auth-user';
import { DOMAIN_ROLE_PACKAGES } from '../../common/domain-packages';
import { provisioningRights } from '../../common/provisioning-rights';
import { FEATURE_KEYS, FEATURE_LABELS, FeatureKey } from '../../common/features';
import { Role } from '../../common/enums';
import { User } from '../auth/schemas/user.schema';
import { Tenant } from '../tenant/schemas/tenant.schema';
import { AdminAudit } from './schemas/admin-audit.schema';
import { PlatformModule } from './schemas/platform-module.schema';
import { MODULE_MANIFESTS } from './module-manifests';
import { ModuleRegistryService } from './module-registry.service';
import { SubscriptionPlan } from './schemas/subscription-plan.schema';
import {
  CreateBusinessDto, CreatePlanDto, CreatePlatformModuleDto, FeatureFlagsDto, ProvisionAccountDto,
  ProvisionTenantAccountsDto, UpdateBusinessDto, UpdatePlanDto,
} from './dto/super-admin.dto';

@Injectable()
export class SuperAdminService {
  constructor(
    @InjectModel(Tenant.name) private readonly tenants: Model<Tenant>,
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectModel(SubscriptionPlan.name) private readonly plans: Model<SubscriptionPlan>,
    @InjectModel(AdminAudit.name) private readonly audits: Model<AdminAudit>,
    @InjectModel(PlatformModule.name) private readonly platformModules: Model<PlatformModule>,
    private readonly registry: ModuleRegistryService,
  ) {}

  async listFeatures() {
    // Keep every supported feature field so editing a plan cannot silently erase a disabled module's grants.
    const executable = await this.registry.executableKeys(FEATURE_KEYS);
    return FEATURE_KEYS.map((key) => ({ key, label: FEATURE_LABELS[key], builtin: true, executable: executable.includes(key) }));
  }

  /** Synchronous variant including module descriptions from the database. */
  async listFeaturesDetailed() {
    return this.registry.catalog();
  }

  async createPlatformModule(dto: CreatePlatformModuleDto, actor: AuthUser) {
    const key = dto.key.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    if (MODULE_MANIFESTS.some((m) => m.key === key)) throw new ConflictException('Key conflicts with an installed module');
    if (await this.platformModules.exists({ key })) throw new ConflictException('A module with this key already exists');
    const created = await this.platformModules.create({ ...dto, key, description: dto.description ?? '' });
    await this.record(actor, 'module.created', 'module', created.id, { key, label: created.label });
    return created;
  }

  async updatePlatformModule(id: string, dto: { label?: string; description?: string; isActive?: boolean }, actor: AuthUser) {
    const mod = await this.platformModules.findById(id);
    if (!mod) throw new NotFoundException('Module not found');
    if (mod.universal && dto.isActive === false) throw new BadRequestException('Help and Backup are included for every account');
    if (dto.label !== undefined) mod.label = dto.label.trim();
    if (dto.description !== undefined) mod.description = dto.description.trim();
    if (dto.isActive !== undefined) mod.isActive = dto.isActive;
    await mod.save();
    await this.record(actor, 'module.updated', 'module', mod.id, { key: mod.key, ...dto });
    return mod;
  }

  async deletePlatformModule(id: string, actor: AuthUser) {
    const mod = await this.platformModules.findById(id);
    if (!mod) throw new NotFoundException('Module not found');
    if (mod.managed || MODULE_MANIFESTS.some((m) => m.key === mod.key)) throw new ConflictException('Installed modules must be disabled, not deleted');
    mod.isActive = false;
    mod.releaseState = 'retired';
    await mod.save();
    await this.record(actor, 'module.deleted', 'module', id, { key: mod.key, label: mod.label });
    return { deleted: true, key: mod.key };
  }

  async overview() {
    const [businesses, activeBusinesses, suspendedBusinesses, plans, auditEvents] = await Promise.all([
      this.tenants.countDocuments(),
      this.tenants.countDocuments({ status: { $ne: 'suspended' } }),
      this.tenants.countDocuments({ status: 'suspended' }),
      this.plans.countDocuments(),
      this.audits.countDocuments(),
    ]);
    return { businesses, activeBusinesses, suspendedBusinesses, plans, auditEvents };
  }

  async listBusinesses() {
    const businesses = await this.tenants.find().sort({ createdAt: -1 }).lean();
    const plans = await this.plans.find().select('name price billingInterval').lean();
    const planById = new Map(plans.map((plan) => [String(plan._id), plan]));
    return businesses.map((business) => ({
      ...business,
      businessId: String(business._id),
      status: business.status ?? 'active',
      featureFlags: this.completeFeatures(business.featureFlags),
      customModules: business.customModules ?? [],
      subscriptionPlan: business.subscriptionPlanId
        ? planById.get(String(business.subscriptionPlanId)) ?? null
        : null,
    }));
  }

  async listBusinessesForPlans() {
    const [businesses, plans] = await Promise.all([
      this.tenants.find().select('name domainType status currency logoUrl featureFlags subscriptionPlanId createdAt deploymentMode licenseExpiresAt branchLimit').sort({ createdAt: -1 }).lean(),
      this.plans.find().select('name').lean(),
    ]);
    const planById = new Map(plans.map((plan) => [String(plan._id), plan.name]));
    return businesses.map((business) => ({
      businessId: String(business._id),
      name: business.name,
      domainType: business.domainType,
      status: business.status ?? 'active',
      currency: business.currency ?? 'PKR',
      logoUrl: business.logoUrl ?? '',
      deploymentMode: business.deploymentMode, licenseExpiresAt: business.licenseExpiresAt, branchLimit: business.branchLimit,
      featureFlags: this.completeFeatures(business.featureFlags),
      subscriptionPlanId: business.subscriptionPlanId?.toString() ?? null,
      subscriptionPlanName: business.subscriptionPlanId
        ? planById.get(String(business.subscriptionPlanId)) ?? null
        : null,
      createdAt: (business as { createdAt?: Date }).createdAt?.toISOString?.() ?? String((business as { createdAt?: unknown }).createdAt ?? ''),
    }));
  }

  async createBusiness(dto: CreateBusinessDto, actor: AuthUser) {
    const ownerEmail = dto.ownerEmail.trim().toLowerCase();
    const initialPlan = dto.initialPlanId ? await this.plans.findOne({ _id: dto.initialPlanId, isActive: true }) : null;
    if (dto.initialPlanId && !initialPlan) throw new NotFoundException('Active subscription plan not found');
    if (initialPlan?.domainType && initialPlan.domainType !== dto.domainType) throw new BadRequestException('Package is for a different business type');
    if (await this.users.exists({ email: ownerEmail })) throw new ConflictException('Email already registered');

    const tenant = await this.tenants.create({
      name: dto.name.trim(), domainType: dto.domainType,
      address: dto.address, currency: dto.currency?.toUpperCase(),
      ...(initialPlan ? { subscriptionPlanId: initialPlan._id, featureFlags: this.completeFeatures(initialPlan.features) } : {}),
    });
    let ownerCreated: { id: string; email: string } | null = null;
    try {
      await waitForBusinessDatabase(tenant.id);
      const owner = await this.users.create({
        tenantId: tenant._id,
        name: dto.ownerName.trim(),
        email: ownerEmail,
        phone: dto.ownerPhone.trim(),
        passwordHash: await bcrypt.hash(dto.ownerPassword, 12),
        pinHash: await bcrypt.hash('0000', 12),
        pinRequiresChange: true,
        role: Role.Owner,
      });
      ownerCreated = { id: owner.id, email: ownerEmail };
    } catch (error) {
      await this.tenants.deleteOne({ _id: tenant._id });
      if ((error as { code?: number }).code === 11000) throw new ConflictException('Email already registered');
      throw error;
    }

    // Seed the role accounts chosen from the business-type package (admin/staff/cashier).
    const seededAccounts: { email: string; role: string }[] = [];
    if (dto.accounts?.length) {
      try {
        for (const account of dto.accounts) {
          await this.provisionOneAccount(tenant.id, account);
          seededAccounts.push({ email: account.email.trim().toLowerCase(), role: account.role });
        }
      } catch (error) {
        // Roll the whole tenant back if any seeded account conflicts.
        await this.tenants.deleteOne({ _id: tenant._id });
        await this.users.deleteMany({ tenantId: tenant._id, role: { $ne: Role.Owner } });
        if ((error as { code?: number }).code === 11000) throw new ConflictException('One of the account emails is already registered');
        throw error;
      }
    }

    await this.record(actor, 'business.created', 'business', tenant.id, {
      businessId: tenant.id, name: tenant.name, ownerEmail, ownerPhone: dto.ownerPhone,
      seededAccounts,
    });
    return { ...this.businessSummary(tenant), ownerAccountId: ownerCreated?.id ?? null, seededAccounts };
  }

  /** Creates admin/staff/cashier accounts for an existing tenant (developer-side provisioning). */
  async provisionAccounts(tenantId: string, dto: ProvisionTenantAccountsDto, actor: AuthUser) {
    const tenant = await this.tenants.findById(tenantId);
    if (!tenant) throw new NotFoundException('Business not found');
    const created: { id: string; email: string; role: string }[] = [];
    for (const account of dto.accounts) {
      const user = await this.provisionOneAccount(tenantId, account);
      created.push({ id: user.id, email: account.email.trim().toLowerCase(), role: account.role });
    }
    await this.record(actor, 'business.accounts_provisioned', 'business', tenantId, {
      count: created.length,
      roles: dto.accounts.map((account) => account.role),
    });
    return { businessId: tenantId, created };
  }

  /** The role-package catalogue: which accounts a business type gets by default. */
  listRolePackages() {
    return DOMAIN_ROLE_PACKAGES;
  }
  /** Safe roadmap for the business-side Help page: labels, descriptions and release states only. */
  async listPublicModules() {
    return (await this.registry.catalog()).map((mod) => ({
      key: mod.key, moduleId: mod.moduleId, label: mod.label, description: mod.description ?? '',
      releaseState: mod.releaseState, version: mod.version, installed: mod.installed,
    }));
  }

  private async provisionOneAccount(tenantId: string, account: ProvisionAccountDto) {
    const tenant = await this.tenants.findById(tenantId);
    if (!tenant) throw new NotFoundException('Business not found');
    let moduleRights: string[];
    try { moduleRights = provisioningRights(tenant.domainType, account.role, this.completeFeatures(tenant.featureFlags), account.moduleRights); }
    catch (error) { throw new BadRequestException((error as Error).message); }
    const email = account.email.trim().toLowerCase();
    if (await this.users.exists({ email })) throw new ConflictException(`Email already registered: ${email}`);
    // 'staff' accounts are stored as cashiers with a scoped module-rights set.
    const role = account.role === 'admin' ? Role.Admin : Role.Cashier;
    return this.users.create({
      tenantId: new Types.ObjectId(tenantId),
      name: account.name.trim(),
      email,
      passwordHash: await bcrypt.hash(account.password, 12),
      pinHash: await bcrypt.hash('0000', 12),
      pinRequiresChange: true,
      role,
      moduleRights,
    });
  }

  async updateBusiness(id: string, dto: UpdateBusinessDto, actor: AuthUser) {
    const tenant = await this.tenants.findById(id);
    if (!tenant) throw new NotFoundException('Business not found');
    const before = { name: tenant.name, status: tenant.status ?? 'active' };
    if (dto.name !== undefined) tenant.name = dto.name.trim();
    if (dto.status !== undefined) tenant.status = dto.status;
    if (dto.deploymentMode !== undefined) tenant.deploymentMode = dto.deploymentMode;
    if (dto.licenseExpiresAt !== undefined) tenant.licenseExpiresAt = new Date(dto.licenseExpiresAt);
    if (dto.branchLimit !== undefined) {
      if (dto.branchLimit < tenant.branchCount) throw new ConflictException('Branch limit cannot be less than existing branch count');
      tenant.branchLimit = dto.branchLimit;
    }
    await tenant.save();
    await this.record(actor, 'business.updated', 'business', tenant.id, {
      before, after: { name: tenant.name, status: tenant.status },
    });
    return this.businessSummary(tenant);
  }

  async updateBusinessFeatures(id: string, updates: FeatureFlagsDto, actor: AuthUser) {
    const tenant = await this.tenants.findById(id);
    if (!tenant) throw new NotFoundException('Business not found');
    const before = this.completeFeatures(tenant.featureFlags);
    const changes = Object.fromEntries(FEATURE_KEYS.filter((key) => typeof updates[key] === 'boolean').map((key) => [`featureFlags.${key}`, updates[key]]));
    const updated = await this.tenants.findByIdAndUpdate(id, { $set: changes }, { new: true, runValidators: true });
    if (!updated) throw new NotFoundException('Business not found');
    const after = this.completeFeatures(updated.featureFlags);
    await this.record(actor, 'business.features_updated', 'business', tenant.id, { before, after });
    return { businessId: tenant.id, featureFlags: after };
  }

  async assignPlan(id: string, planId: string, actor: AuthUser) {
    const [tenant, plan] = await Promise.all([
      this.tenants.findById(id),
      this.plans.findOne({ _id: planId, isActive: true }),
    ]);
    if (!tenant) throw new NotFoundException('Business not found');
    if (!plan) throw new NotFoundException('Active subscription plan not found');
    if (plan.domainType && plan.domainType !== tenant.domainType) throw new BadRequestException('Package is for a different business type');
    const previousPlanId = tenant.subscriptionPlanId?.toString() ?? null;
    tenant.subscriptionPlanId = plan._id as Types.ObjectId;
    tenant.featureFlags = this.completeFeatures(plan.features);
    await tenant.save();
    await this.record(actor, 'business.plan_assigned', 'business', tenant.id, {
      previousPlanId, planId: plan.id, planName: plan.name, featureFlags: tenant.featureFlags,
    });
    return this.businessSummary(tenant);
  }

  listPlans() {
    return this.plans.find().sort({ price: 1, name: 1 }).lean();
  }

  async createPlan(dto: CreatePlanDto, actor: AuthUser) {
    try {
      const plan = await this.plans.create(dto);
      await this.record(actor, 'plan.created', 'plan', plan.id, {
        name: plan.name, price: plan.price, billingInterval: plan.billingInterval, features: plan.features,
      });
      return plan;
    } catch (error) {
      if ((error as { code?: number }).code === 11000) throw new ConflictException('A plan with this name already exists');
      throw error;
    }
  }

  async updatePlan(id: string, dto: UpdatePlanDto, actor: AuthUser) {
    const plan = await this.plans.findById(id);
    if (!plan) throw new NotFoundException('Subscription plan not found');
    if (dto.domainType && await this.tenants.exists({ subscriptionPlanId: plan._id, domainType: { $ne: dto.domainType } })) throw new ConflictException('Existing subscribers have a different business type');
    if (dto.domainType !== undefined) plan.domainType = dto.domainType;
    const before = {
      name: plan.name, price: plan.price, billingInterval: plan.billingInterval,
      features: this.completeFeatures(plan.features), isActive: plan.isActive,
    };
    if (dto.name !== undefined) plan.name = dto.name.trim();
    if (dto.description !== undefined) plan.description = dto.description.trim();
    if (dto.price !== undefined) plan.price = dto.price;
    if (dto.billingInterval !== undefined) plan.billingInterval = dto.billingInterval;
    if (dto.features !== undefined) plan.features = { ...this.completeFeatures(plan.features), ...dto.features };
    if (dto.isActive !== undefined) plan.isActive = dto.isActive;
    try {
      await plan.save();
    } catch (error) {
      if ((error as { code?: number }).code === 11000) throw new ConflictException('A plan with this name already exists');
      throw error;
    }
    if (dto.features !== undefined) {
      await this.tenants.updateMany({ subscriptionPlanId: plan._id }, { $set: { featureFlags: this.completeFeatures(plan.features) } });
    }
    await this.record(actor, 'plan.updated', 'plan', plan.id, {
      before,
      after: {
        name: plan.name, price: plan.price, billingInterval: plan.billingInterval,
        features: this.completeFeatures(plan.features), isActive: plan.isActive,
      },
    });
    return plan;
  }

  async listAudit(limitValue?: string) {
    const parsed = Number(limitValue);
    const limit = Number.isFinite(parsed) ? Math.min(Math.max(Math.floor(parsed), 1), 200) : 50;
    return this.audits.find().sort({ createdAt: -1 }).limit(limit).lean();
  }

  /**
   * Client account directory for the developer console. Sensitive credentials
   * (password hashes, PINs, codes) are never returned.
   */
  async listClientAccounts() {
    const [users, tenants] = await Promise.all([
      this.users.find().sort({ createdAt: -1 }).lean(),
      this.tenants.find().select('name domainType status').lean(),
    ]);
    const tenantById = new Map(tenants.map((tenant) => [String(tenant._id), tenant]));
    const roleOrder: Record<string, number> = { owner: 0, admin: 1, staff: 2, cashier: 3 };
    return users
      .filter((user) => !user.superAdmin)
      .map((user) => {
        const tenant = tenantById.get(String(user.tenantId));
        return {
          _id: String(user._id),
          name: user.name,
          email: user.email,
          phone: user.phone ?? null,
          emailVerified: !!user.emailVerified && !!user.emailVerifiedAt,
          phoneVerified: !!user.phoneVerified,
          role: user.role,
          isActive: user.isActive ?? true,
          createdAt: (user as { createdAt?: Date }).createdAt?.toISOString?.() ?? null,
          lastPasswordChangedAt: null as string | null,
          business: tenant
            ? { id: String(tenant._id), name: tenant.name, domainType: tenant.domainType, status: tenant.status ?? 'active' }
            : null,
        };
      })
      .sort((a, b) =>
        (a.business?.name ?? '').localeCompare(b.business?.name ?? '')
        || (roleOrder[a.role] ?? 9) - (roleOrder[b.role] ?? 9)
        || a.name.localeCompare(b.name));
  }

  /**
   * Full platform snapshot for the developer's backup workflow.
   * Secrets (password/PIN hashes, codes) are stripped from every account.
   */
  async createBackup() {
    const [tenants, users, plans, modules, auditTail, businessCount, activeBusinesses, planCount, auditCount] = await Promise.all([
      this.tenants.find().lean(),
      this.users.find().lean(),
      this.plans.find().lean(),
      this.platformModules.find().lean(),
      this.audits.find().sort({ createdAt: -1 }).lean(),
      this.tenants.countDocuments(),
      this.tenants.countDocuments({ status: { $ne: 'suspended' } }),
      this.plans.countDocuments(),
      this.audits.countDocuments(),
    ]);
    const businessData = await branchContext.exit(async () => Object.fromEntries(await Promise.all(
      ['Branch', 'Product', 'Customer', 'Order', 'InvoiceCounter', 'InstallmentPlan', 'InstallmentProduct', 'InstallmentSale', 'StockAdjustment', 'AuditEvent'].map(async (name) => {
        const model = this.tenants.db.model(name);
        return [name, await model.find().lean()];
      }),
    )));
    const stripSecrets = ({ passwordHash, pinHash, developerPinHash, pinChallengeId, pinResetCodeHash, emailVerificationCodeHash, pinLockedUntil, pinFailedAttempts, securityCodeRequestedAt, ...safe }: Record<string, unknown>) => safe;
    return {
      meta: {
        version: 2 as const,
        scope: 'Sanitized logical export; excludes credentials, sessions, external files and Redis jobs. Not a point-in-time database backup.',
        generatedAt: new Date().toISOString(),
        generator: 'KazmiOn POS Developer Engine',
        counts: { businesses: businessCount, activeBusinesses, accounts: users.length, plans: planCount, customModules: modules.length, auditEvents: auditCount },
      },
      tenants,
      accounts: users.map((user) => ({
        ...stripSecrets(user as unknown as Record<string, unknown>),
        businessName: tenants.find((tenant) => String(tenant._id) === String(user.tenantId))?.name ?? null,
      })),
      plans,
      customModules: modules,
      auditTail,
      businessData,
    };
  }

  private completeFeatures(features?: Partial<Record<FeatureKey, boolean>> | null) {
    const base = Object.fromEntries(FEATURE_KEYS.map((key) => [key, features?.[key] ?? false])) as Record<FeatureKey, boolean>;
    // Settings module is mandatory for all accounts - always enabled
    base.settings = true;
    return base;
  }

  private businessSummary(tenant: Tenant & { _id: Types.ObjectId }) {
    const businessId = tenant._id.toString();
    return {
      businessId,
      _id: businessId,
      name: tenant.name,
      domainType: tenant.domainType,
      status: tenant.status ?? 'active',
      deploymentMode: tenant.deploymentMode, licenseExpiresAt: tenant.licenseExpiresAt, branchLimit: tenant.branchLimit,
      currency: tenant.currency,
      featureFlags: this.completeFeatures(tenant.featureFlags),
      subscriptionPlanId: tenant.subscriptionPlanId?.toString() ?? null,
    };
  }

  private record(actor: AuthUser, action: string, entityType: string, entityId: string, details: Record<string, unknown>) {
    return this.audits.create({
      actorId: new Types.ObjectId(actor.userId), actorEmail: actor.email,
      action, entityType, entityId, details,
    });
  }
}
