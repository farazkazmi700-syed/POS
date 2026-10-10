import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { DomainType } from '../../common/enums';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { Tenant, TenantDocument } from './schemas/tenant.schema';

@Injectable()
export class TenantService {
  constructor(@InjectModel(Tenant.name) private readonly model: Model<Tenant>) {}

  create(data: {
    name: string; domainType?: DomainType; taxRegNo?: string; address?: string; currency?: string;
  }): Promise<TenantDocument> {
    return this.model.create(data);
  }

  async findById(id: string): Promise<TenantDocument> {
    const tenant = await this.model.findById(id);
    if (!tenant) throw new NotFoundException('Tenant not found');
    return tenant;
  }

  async update(id: string, dto: UpdateTenantDto): Promise<TenantDocument> {
    const tenant = await this.model.findByIdAndUpdate(id, { $set: dto }, { new: true, runValidators: true });
    if (!tenant) throw new NotFoundException('Tenant not found');
    return tenant;
  }

  delete(id: string) {
    return this.model.findByIdAndDelete(id);
  }
}
