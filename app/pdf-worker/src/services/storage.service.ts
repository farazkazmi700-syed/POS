import type { R2Bucket } from '@cloudflare/workers-types';
import fs from 'fs/promises';
import path from 'path';
import { R2StorageService, createR2StorageService } from './r2-storage.service';

// Storage mode: 'local' or 'r2'
const STORAGE_MODE = process.env.STORAGE_MODE || 'local';

let r2Storage: R2StorageService | null = null;

const ROOT = path.resolve(process.env.STORAGE_DIR || './storage/record of business');

/**
 * Initialize R2 storage if in R2 mode
 * Call this at worker startup
 */
export function initR2Storage(env: { PDF_BUCKET: R2Bucket; R2_PUBLIC_URL?: string }) {
  if (STORAGE_MODE === 'r2') {
    r2Storage = createR2StorageService(env);
  }
}

/**
 * Writes a PDF under STORAGE_DIR/<tenantId>/<invoiceNo>.pdf (local) 
 * or to R2 bucket (cloudflare) and returns the RELATIVE path/key
 * Swap this file for an S3 / Cloudflare R2 uploader later; nothing else in the worker needs to change.
 */
export async function savePdf(tenantId: string, invoiceNo: string, pdf: Buffer): Promise<string> {
  if (STORAGE_MODE === 'r2' && r2Storage) {
    return r2Storage.savePdf(tenantId, invoiceNo, pdf);
  }
  
  // Local storage (original implementation)
  const safeNo = invoiceNo.replace(/[^A-Za-z0-9_-]/g, '_');
  const rel = path.join(tenantId, `${safeNo}.pdf`);
  const abs = path.join(ROOT, rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  const tmp = `${abs}.${process.pid}.tmp`;
  await fs.writeFile(tmp, pdf);
  await fs.rename(tmp, abs); // atomic: the API never serves a half-written file
  return rel.split(path.sep).join('/');
}

/**
 * Get PDF stream from storage
 */
export async function getPdfStream(key: string): Promise<NodeJS.ReadableStream | null> {
  if (STORAGE_MODE === 'r2' && r2Storage) {
    const stream = await r2Storage.getPdf(key);
    if (!stream) return null;
    // Convert Web ReadableStream to Node.js Readable
    const { Readable } = await import('stream');
    return Readable.fromWeb(stream as any);
  }
  
  // Local storage
  const abs = path.resolve(ROOT, key);
  try {
    await fs.access(abs);
    const { createReadStream } = await import('fs');
    return createReadStream(abs);
  } catch {
    return null;
  }
}

/**
 * Get PDF as buffer from storage
 */
export async function getPdfBuffer(key: string): Promise<Buffer | null> {
  if (STORAGE_MODE === 'r2' && r2Storage) {
    const arrayBuffer = await r2Storage.getPdfArrayBuffer(key);
    if (!arrayBuffer) return null;
    return Buffer.from(arrayBuffer);
  }
  
  // Local storage
  const abs = path.resolve(ROOT, key);
  try {
    return await fs.readFile(abs);
  } catch {
    return null;
  }
}

/**
 * Delete PDF from storage
 */
export async function deletePdf(key: string): Promise<void> {
  if (STORAGE_MODE === 'r2' && r2Storage) {
    await r2Storage.deletePdf(key);
    return;
  }
  
  // Local storage
  const abs = path.resolve(ROOT, key);
  try {
    await fs.unlink(abs);
  } catch {
    // Ignore if not found
  }
}

/**
 * Check if PDF exists in storage
 */
export async function pdfExists(key: string): Promise<boolean> {
  if (STORAGE_MODE === 'r2' && r2Storage) {
    return r2Storage.exists(key);
  }
  
  // Local storage
  const abs = path.resolve(ROOT, key);
  try {
    await fs.access(abs);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get storage mode
 */
export function getStorageMode(): string {
  return STORAGE_MODE;
}
