import type { R2Bucket, R2Object, ReadableStream } from '@cloudflare/workers-types';

/**
 * Cloudflare R2 storage service for PDF invoices
 * Replaces local file storage with R2 bucket storage
 */

export interface R2StorageConfig {
  bucket: R2Bucket;
  publicUrl?: string; // Optional custom domain for public access
}

export class R2StorageService {
  private bucket: R2Bucket;
  private publicUrl?: string;

  constructor(config: R2StorageConfig) {
    this.bucket = config.bucket;
    this.publicUrl = config.publicUrl;
  }

  /**
   * Save PDF to R2 bucket
   * @param tenantId - Tenant/business ID
   * @param invoiceNo - Invoice number
   * @param pdf - PDF buffer
   * @returns Relative path/key in R2
   */
  async savePdf(tenantId: string, invoiceNo: string, pdf: Buffer): Promise<string> {
    const safeNo = invoiceNo.replace(/[^A-Za-z0-9_-]/g, '_');
    const key = `${tenantId}/${safeNo}.pdf`;
    
    // Upload to R2 with metadata
    await this.bucket.put(key, pdf, {
      httpMetadata: {
        contentType: 'application/pdf',
        cacheControl: 'public, max-age=31536000, immutable',
      },
      customMetadata: {
        tenantId,
        invoiceNo,
        uploadedAt: new Date().toISOString(),
      },
    });
    
    return key;
  }

  /**
   * Get PDF from R2 bucket
   * @param key - R2 object key
   * @returns ReadableStream or null if not found
   */
  async getPdf(key: string): Promise<ReadableStream | null> {
    const object = await this.bucket.get(key);
    if (!object) return null;
    return object.body;
  }

  /**
   * Get PDF as ArrayBuffer
   * @param key - R2 object key
   * @returns ArrayBuffer or null if not found
   */
  async getPdfArrayBuffer(key: string): Promise<ArrayBuffer | null> {
    const object = await this.bucket.get(key);
    if (!object) return null;
    return object.arrayBuffer();
  }

  /**
   * Delete PDF from R2 bucket
   * @param key - R2 object key
   */
  async deletePdf(key: string): Promise<void> {
    await this.bucket.delete(key);
  }

  /**
   * Generate public URL for PDF (if custom domain configured)
   * @param key - R2 object key
   * @returns Public URL or null
   */
  getPublicUrl(key: string): string | null {
    if (!this.publicUrl) return null;
    return `${this.publicUrl}/${key}`;
  }

  /**
   * List PDFs for a tenant
   * @param tenantId - Tenant/business ID
   * @param options - List options
   * @returns List of objects
   */
  async listPdfs(tenantId: string, options: { prefix?: string; limit?: number } = {}): Promise<R2Object[]> {
    const prefix = options.prefix ? `${tenantId}/${options.prefix}` : `${tenantId}/`;
    const objects = await this.bucket.list({ prefix, limit: options.limit });
    return objects.objects;
  }

  /**
   * Check if PDF exists
   * @param key - R2 object key
   * @returns True if exists
   */
  async exists(key: string): Promise<boolean> {
    const object = await this.bucket.head(key);
    return object !== null;
  }
}

/**
 * Factory function to create R2StorageService from environment
 * Used in Cloudflare Workers where R2 bucket is bound
 */
export function createR2StorageService(env: { PDF_BUCKET: R2Bucket; R2_PUBLIC_URL?: string }): R2StorageService {
  return new R2StorageService({
    bucket: env.PDF_BUCKET,
    publicUrl: env.R2_PUBLIC_URL,
  });
}