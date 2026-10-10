import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { escapeRegex, oid } from '../../common/object-id';
import { BulkCreateProductsDto, CreateProductDto, QueryProductDto, UpdateProductDto } from './dto/product.dto';
import { Product, ProductDocument } from './schemas/product.schema';

@Injectable()
export class ProductService {
  constructor(@InjectModel(Product.name) private readonly model: Model<Product>) {}

  async create(tenantId: string, dto: CreateProductDto): Promise<ProductDocument> {
    try {
      return await this.model.create({ ...dto, tenantId: oid(tenantId) });
    } catch (err) {
      this.rethrowDuplicate(err);
      throw err;
    }
  }

  async bulkCreate(tenantId: string, dto: BulkCreateProductsDto) {
    const docs = dto.products.map((p) => ({ ...p, tenantId: oid(tenantId) }));
    try {
      const created = await this.model.insertMany(docs, { ordered: true });
      return { created: created.length };
    } catch (err) {
      this.rethrowDuplicate(err);
      throw err;
    }
  }

  async findAll(tenantId: string, q: QueryProductDto) {
    const filter: Record<string, unknown> = { tenantId: oid(tenantId) };
    if (!q.includeInactive) filter.isActive = true;
    if (q.category) filter.category = q.category;
    if (q.q) {
      const rx = new RegExp(escapeRegex(q.q), 'i');
      filter.$or = [{ name: rx }, { sku: rx }];
    }
    if (q.lowStock) {
      filter.trackStock = true;
      filter.$expr = { $lte: ['$stockQty', '$lowStockThreshold'] };
    }
    const page = q.page ?? 1;
    const limit = q.limit ?? 30;
    const [data, total] = await Promise.all([
      this.model.find(filter).sort({ name: 1 }).skip((page - 1) * limit).limit(limit),
      this.model.countDocuments(filter),
    ]);
    return { data, total, page, limit };
  }

  async findOne(tenantId: string, id: string): Promise<ProductDocument> {
    const product = await this.model.findOne({ _id: id, tenantId: oid(tenantId) });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  findManyByIds(tenantId: string, ids: string[]): Promise<ProductDocument[]> {
    return this.model.find({ _id: { $in: ids.map(oid) }, tenantId: oid(tenantId) });
  }

  async update(tenantId: string, id: string, dto: UpdateProductDto): Promise<ProductDocument> {
    try {
      const product = await this.model.findOneAndUpdate(
        { _id: id, tenantId: oid(tenantId) }, { $set: dto }, { new: true, runValidators: true },
      );
      if (!product) throw new NotFoundException('Product not found');
      return product;
    } catch (err) {
      this.rethrowDuplicate(err);
      throw err;
    }
  }

  /** Soft delete: past orders keep referencing the product. */
  async remove(tenantId: string, id: string) {
    await this.update(tenantId, id, { isActive: false });
    return { deleted: true };
  }

  /**
   * Atomic stock decrement. The `stockQty >= qty` condition lives inside the
   * update filter, so two cashiers can never oversell the last unit.
   */
  async decrementStock(tenantId: string, productId: string, qty: number): Promise<boolean> {
    const res = await this.model.updateOne(
      { _id: productId, tenantId: oid(tenantId), stockQty: { $gte: qty } },
      { $inc: { stockQty: -qty } },
    );
    return res.modifiedCount === 1;
  }

  async incrementStock(tenantId: string, productId: string, qty: number): Promise<void> {
    await this.model.updateOne({ _id: productId, tenantId: oid(tenantId) }, { $inc: { stockQty: qty } });
  }

  private rethrowDuplicate(err: unknown): void {
    if ((err as { code?: number })?.code === 11000) {
      throw new ConflictException('A product with this SKU already exists');
    }
  }
}
