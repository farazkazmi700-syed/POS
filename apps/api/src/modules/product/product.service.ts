import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { escapeRegex, oid } from '../../common/object-id';
import { BulkCreateProductsDto, CreateProductDto, QueryProductDto, UpdateProductDto } from './dto/product.dto';
import { Product, ProductDocument } from './schemas/product.schema';
import { normalizeBarcode } from '../barcode/barcode-value';

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
    if (q.barcode) filter.$or = [{ barcode: q.barcode }, { sku: q.barcode }];
    if (q.q) {
      const rx = new RegExp(escapeRegex(q.q), 'i');
      const search = { $or: [{ name: rx }, { sku: rx }, { barcode: rx }] };
      if (q.barcode) filter.$and = [search];
      else Object.assign(filter, search);
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

  async findByBarcode(tenantId: string, value: string): Promise<ProductDocument> {
    const scope = { tenantId: oid(tenantId), isActive: true };
    let product = await this.model.findOne({ ...scope, barcode: value })
      ?? await this.model.findOne({ ...scope, sku: value });
    // Readers may report UPC-A as EAN-13 with a leading zero. Preserve exact matches first.
    let alternate: string | undefined;
    try {
      if (/^0\d{12}$/.test(value) && normalizeBarcode('EAN13', value) === value) alternate = value.slice(1);
      else if (/^\d{12}$/.test(value) && normalizeBarcode('UPC', value) === value) alternate = `0${value}`;
    } catch { /* Non-retail identifiers still use exact matching. */ }
    if (!product && alternate) product = await this.model.findOne({ ...scope, barcode: alternate });
    if (!product) throw new NotFoundException('No active product matches this barcode or SKU in the selected branch.');
    return product;
  }

  findManyByIds(tenantId: string, ids: string[]): Promise<ProductDocument[]> {
    return this.model.find({ _id: { $in: ids.map(oid) }, tenantId: oid(tenantId) });
  }

  async update(tenantId: string, id: string, dto: UpdateProductDto): Promise<ProductDocument> {
    if (dto.stockQty !== undefined) {
      const current = await this.findOne(tenantId, id);
      if (dto.stockQty !== current.stockQty) throw new BadRequestException('Use an audited stock adjustment to change existing stock');
    }
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

  /** The stock delta and replay marker are one atomic product update. */
  async restoreSaleStockOnce(tenantId: string, productId: string, qty: number, event: string) {
    const result = await this.model.updateOne({ _id: productId, tenantId: oid(tenantId), restoredSaleEvents: { $ne: event } }, { $inc: { stockQty: qty }, $addToSet: { restoredSaleEvents: event } });
    if (!result.matchedCount && !await this.model.exists({ _id: productId, tenantId: oid(tenantId) })) throw new NotFoundException('Product not found while restoring stock');
  }

  async adjustStockOnce(tenantId: string, productId: string, delta: number, key: string) {
    const updated = await this.model.findOneAndUpdate({ _id: productId, tenantId: oid(tenantId), stockAdjustmentEvents: { $ne: key }, ...(delta < 0 ? { stockQty: { $gte: -delta } } : {}) }, { $inc: { stockQty: delta }, $addToSet: { stockAdjustmentEvents: key } }, { new: true });
    if (updated) return;
    const product = await this.model.findOne({ _id: productId, tenantId: oid(tenantId) }).select('+stockAdjustmentEvents');
    if (!product) throw new NotFoundException('Product not found');
    if (!product.stockAdjustmentEvents?.includes(key)) throw new ConflictException('Adjustment would make stock negative');
  }

  private rethrowDuplicate(err: unknown): void {
    if ((err as { code?: number })?.code === 11000) {
      const field = (err as { keyPattern?: Record<string, unknown> }).keyPattern?.barcode ? 'barcode' : 'SKU';
      throw new ConflictException(`A product with this ${field} already exists`);
    }
  }
}
