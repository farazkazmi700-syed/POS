import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcryptjs';
import { Model, Types } from 'mongoose';
import { AuthUser } from '../../common/auth-user';
import { FEATURE_KEYS, FEATURE_LABELS, FeatureKey } from '../../common/features';
import { Role } from '../../common/enums';
import { User } from '../auth/schemas/user.schema';
import { Tenant } from '../tenant/schemas/tenant.schema';
import { AdminAudit } from './schemas/admin-audit.schema';
import { SubscriptionPlan } from './schemas/subscription-plan.schema';
import {
  CreateBusinessDto, CreatePlanDto, FeatureFlagsDto, UpdateBusinessDto, UpdatePlanDto,
} from './dto/super-admin.dto';

@Injectable()
export class SuperAdminService {
  constructor(
    @InjectModel(Tenant.name) private readonly tenants: Model<Tenant>,
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectModel(SubscriptionPlan.name) private readonly plans: Model<SubscriptionPlan>,
    @InjectModel(AdminAudit.name) private readonly audits: Model<AdminAudit>,
  ) {}

  listFeatures() {
    return FEATURE_KEYS.map((key) => ({ key, label: FEATURE_LABELS[key] }));
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
      subscriptionPlan: business.subscriptionPlanId
        ? planById.get(String(business.subscriptionPlanId)) ?? null
        : null,
    }));
  }

  async listBusinessesForPlans() {
    const [businesses, plans] = await Promise.all([
      this.tenants.find().select('name domainType status currency featureFlags subscriptionPlanId createdAt').sort({ createdAt: -1 }).lean(),
      this.plans.find().select('name').lean(),
    ]);
    const planById = new Map(plans.map((plan) => [String(plan._id), plan.name]));
    return businesses.map((business) => ({
      businessId: String(business._id),
      name: business.name,
      domainType: business.domainType,
      status: business.status ?? 'active',
      currency: business.currency ?? 'PKR',
      featureFlags: this.completeFeatures(business.featureFlags),
      subscriptionPlanId: business.subscriptionPlanId?.toString() ?? null,
      subscriptionPlanName: business.subscriptionPlanId
        ? planById.get(String(business.subscriptionPlanId)) ?? null
        : null,
      createdAt: (business as { createdAt?: Date }).createdAt?.toISOString?.() ?? String((business as { createdAt?: unknown }).createdAt ?? ''),
    }));
  }

  async createBusiness(dto: CreateBusinessDto, actor: AuthUser) {
    const ownerEmail = dto.ownerEmail.toLowerCase();
    if (await this.users.exists({ email: ownerEmail })) throw new ConflictException('Email already registered');

    const tenant = await this.tenants.create({
      name: dto.name.trim(), domainType: dto.domainType,
      address: dto.address, currency: dto.currency?.toUpperCase(),
    });
    try {
      await this.users.create({
        tenantId: tenant._id,
        name: dto.ownerName.trim(),
        email: ownerEmail,
        passwordHash: await bcrypt.hash(dto.ownerPassword, 12),
        pinHash: await bcrypt.hash('0000', 12),
        pinRequiresChange: true,
        role: Role.Owner,
      });
    } catch (error) {
      await this.tenants.deleteOne({ _id: tenant._id });
      if ((error as { code?: number }).code === 11000) throw new ConflictException('Email already registered');
      throw error;
    }

    await this.record(actor, 'business.created', 'business', tenant.id, {
      businessId: tenant.id, name: tenant.name, ownerEmail,
    });
    return this.businessSummary(tenant);
  }

  async updateBusiness(id: string, dto: UpdateBusinessDto, actor: AuthUser) {
    const tenant = await this.tenants.findById(id);
    if (!tenant) throw new NotFoundException('Business not found');
    const before = { name: tenant.name, status: tenant.status ?? 'active' };
    if (dto.name !== undefined) tenant.name = dto.name.trim();
    if (dto.status !== undefined) tenant.status = dto.status;
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
    const after = { ...before, ...updates };
    tenant.featureFlags = after;
    await tenant.save();
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

  private completeFeatures(features?: Partial<Record<FeatureKey, boolean>> | null) {
    return Object.fromEntries(FEATURE_KEYS.map((key) => [key, features?.[key] ?? true])) as Record<FeatureKey, boolean>;
  }

  private businessSummary(tenant: Tenant & { _id: Types.ObjectId }) {
    const businessId = tenant._id.toString();
    return {
      businessId,
      _id: businessId,
      name: tenant.name,
      domainType: tenant.domainType,
      status: tenant.status ?? 'active',
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