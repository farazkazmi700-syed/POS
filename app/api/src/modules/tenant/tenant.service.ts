import { waitForBusinessDatabase } from '../../common/business-database';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { DomainType } from '../../common/enums';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { NavigationVisibility, Tenant, TenantDocument, TenantFeatureFlags } from './schemas/tenant.schema';

@Injectable()
export class TenantService {
  constructor(@InjectModel(Tenant.name) private readonly model: Model<Tenant>) {}

  async create(data: {
    name: string; domainType?: DomainType; taxRegNo?: string; address?: string; currency?: string;
    featureFlags?: Partial<TenantFeatureFlags>; navigationVisibility?: Partial<NavigationVisibility>;
  }): Promise<TenantDocument> {
    const tenant = await this.model.create(data);
    try {
      await waitForBusinessDatabase(tenant.id);
      return tenant;
    } catch (error) {
      await this.model.deleteOne({ _id: tenant._id });
      throw error;
    }
  }

  async findById(id: string): Promise<TenantDocument> {
    const tenant = await this.model.findById(id);
    if (!tenant) throw new NotFoundException('Tenant not found');
    // Settings navigation is mandatory; coerce any stale disabled state.
    if (tenant.navigationVisibility?.settings === false) {
      tenant.navigationVisibility.settings = true;
      await tenant.save();
    }
    return tenant;
  }

  findByName(name: string): Promise<TenantDocument | null> {
    return this.model.findOne({ name }).exec();
  }

  async update(id: string, dto: UpdateTenantDto): Promise<TenantDocument> {
    const { navigationVisibility, invoicePrintSettings, ...fields } = dto;

    // Prevent disabling the Settings module navigation - it's mandatory for all accounts
    if (navigationVisibility?.settings === false) {
      throw new BadRequestException('Settings navigation cannot be disabled; it is mandatory for all accounts');
    }

    const nested: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(navigationVisibility ?? {})) nested[`navigationVisibility.${key}`] = value;
    for (const [key, value] of Object.entries(invoicePrintSettings ?? {})) nested[`invoicePrintSettings.${key}`] = value;
    const tenant = await this.model.findByIdAndUpdate(id, { $set: { ...fields, ...nested } }, { new: true, runValidators: true });
    if (!tenant) throw new NotFoundException('Tenant not found');
    return tenant;
  }

  delete(id: string) {
    return this.model.findByIdAndDelete(id);
  }
}
