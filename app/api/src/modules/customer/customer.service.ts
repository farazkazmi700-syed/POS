import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { escapeRegex, oid } from '../../common/object-id';
import { CreateCustomerDto, QueryCustomerDto, UpdateCustomerDto } from './dto/customer.dto';
import { Customer, CustomerDocument } from './schemas/customer.schema';

@Injectable()
export class CustomerService {
  constructor(@InjectModel(Customer.name) private readonly model: Model<Customer>) {}

  create(tenantId: string, dto: CreateCustomerDto): Promise<CustomerDocument> {
    return this.model.create({ ...dto, tenantId: oid(tenantId) });
  }

  async findAll(tenantId: string, q: QueryCustomerDto) {
    const filter: Record<string, unknown> = { tenantId: oid(tenantId) };
    if (q.q) {
      const rx = new RegExp(escapeRegex(q.q), 'i');
      filter.$or = [{ name: rx }, { phone: rx }, { cnic: rx }];
    }
    const page = q.page ?? 1;
    const limit = q.limit ?? 30;
    const [data, total] = await Promise.all([
      this.model.find(filter).sort({ name: 1 }).skip((page - 1) * limit).limit(limit),
      this.model.countDocuments(filter),
    ]);
    return { data, total, page, limit };
  }

  async findOne(tenantId: string, id: string): Promise<CustomerDocument> {
    const customer = await this.model.findOne({ _id: id, tenantId: oid(tenantId) });
    if (!customer) throw new NotFoundException('Customer not found');
    return customer;
  }

  async update(tenantId: string, id: string, dto: UpdateCustomerDto): Promise<CustomerDocument> {
    const customer = await this.model.findOneAndUpdate(
      { _id: id, tenantId: oid(tenantId) }, { $set: dto }, { new: true, runValidators: true },
    );
    if (!customer) throw new NotFoundException('Customer not found');
    return customer;
  }
}
