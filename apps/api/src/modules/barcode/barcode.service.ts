import { BadRequestException, Injectable } from '@nestjs/common';
import bwipjs from 'bwip-js';
import { ProductService } from '../product/product.service';
import { GenerateBarcodeDto } from './barcode.dto';
import { normalizeBarcode } from './barcode-value';

@Injectable()
export class BarcodeService {
  constructor(private readonly products: ProductService) {}
  async generate(tenantId: string, dto: GenerateBarcodeDto) {
    if (!!dto.productId === (dto.value !== undefined)) throw new BadRequestException('Provide either a productId or a barcode value.');
    const product = dto.productId ? await this.products.findOne(tenantId, dto.productId) : undefined;
    if (product && !product.isActive) throw new BadRequestException('Inactive products cannot be used for new labels.');
    const raw = product ? product.barcode || product.sku : dto.value;
    if (!raw) throw new BadRequestException('This product needs a barcode or SKU before labels can be generated.');
    let value: string;
    try { value = normalizeBarcode(dto.format, raw); }
    catch (error) { throw new BadRequestException(error instanceof Error ? error.message : 'Invalid barcode value.'); }
    if (product && value !== raw) throw new BadRequestException('The saved product code must include its valid check digit. Update the product barcode before printing this format.');
    try {
      let svg = bwipjs.toSVG({ bcid: { CODE128: 'code128', CODE39: 'code39', EAN13: 'ean13', EAN8: 'ean8', UPC: 'upca' }[dto.format], text: value, scale: dto.scale ?? 2, height: dto.height ?? 25, includetext: dto.displayValue ?? true, textxalign: 'center', paddingwidth: 12, paddingheight: 8, backgroundcolor: 'FFFFFF' });
      const size = /viewBox="0 0 (\d+) (\d+)"/.exec(svg);
      if (size) svg = svg.replace('<svg ', `<svg width="${size[1]}" height="${size[2]}" `);
      return { format: dto.format, value, svg, productId: product?.id };
    } catch {
      throw new BadRequestException('This value cannot be encoded in the selected barcode format.');
    }
  }
}
