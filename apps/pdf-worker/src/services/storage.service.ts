import fs from 'fs/promises';
import path from 'path';

const ROOT = path.resolve(process.env.STORAGE_DIR || './storage/record of business');

/**
 * Writes a PDF under STORAGE_DIR/<tenantId>/<invoiceNo>.pdf and returns the RELATIVE path
 * (this is what is saved on the order). Swap this file for an S3 / Cloudflare R2 uploader
 * later; nothing else in the worker needs to change.
 */
export async function savePdf(tenantId: string, invoiceNo: string, pdf: Buffer): Promise<string> {
  const safeNo = invoiceNo.replace(/[^A-Za-z0-9_-]/g, '_');
  const rel = path.join(tenantId, `${safeNo}.pdf`);
  const abs = path.join(ROOT, rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  const tmp = `${abs}.${process.pid}.tmp`;
  await fs.writeFile(tmp, pdf);
  await fs.rename(tmp, abs); // atomic: the API never serves a half-written file
  return rel.split(path.sep).join('/');
}
