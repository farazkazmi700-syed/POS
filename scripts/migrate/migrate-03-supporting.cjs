#!/usr/bin/env node
/**
 * KazmiOn Migration Phase 3 — Supporting Data
 * 
 * Migrates:
 *   MongoDB: stockAdjustments → PostgreSQL: stock_adjustments
 *   MongoDB: auditEvents      → PostgreSQL: audit_events
 *   MongoDB: adminAudit       → PostgreSQL: admin_audit
 *   MongoDB: invoiceCounters  → PostgreSQL: invoice_counters
 *
 * Usage:
 *   node scripts/migrate/migrate-03-supporting.cjs [--dry-run]
 */

'use strict';

const { MongoClient } = require('mongodb');
const { Client: PgClient } = require('pg');
const crypto = require('crypto');

const DRY_RUN = process.argv.includes('--dry-run');

const MONGO_URI    = process.env.MONGO_URI    || 'mongodb://localhost:27017/pos';
const POSTGRES_URL = process.env.POSTGRES_URL || 'postgresql://kazmion:kazmion@localhost:5432/kazmion';

function mongoIdToUuid(oid) {
  const NS = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
  const nsBytes = NS.replace(/-/g, '').match(/.{2}/g).map(b => parseInt(b, 16));
  const hash = crypto.createHash('sha1')
    .update(Buffer.from(nsBytes))
    .update(oid.toString())
    .digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const h = hash.slice(0, 16).toString('hex');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20,32)}`;
}

function safeDate(val) {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

async function migrateStockAdjustments(mongo, pg) {
  const col = mongo.collection('stockAdjustments');
  const total = await col.countDocuments();
  console.log(`\n[stockAdjustments] found ${total} documents`);

  let done = 0, errors = 0;
  const cursor = col.find({});

  while (await cursor.hasNext()) {
    const doc = await cursor.next();
    const uuid = mongoIdToUuid(doc._id.toString());
    const tenantUuid = doc.tenantId ? mongoIdToUuid(doc.tenantId.toString()) : null;
    const productUuid = doc.productId ? mongoIdToUuid(doc.productId.toString()) : null;
    const userUuid = doc.userId ? mongoIdToUuid(doc.userId.toString()) : null;

    try {
      if (!DRY_RUN) {
        await pg.query(
          `INSERT INTO stock_adjustments (
            id, mongo_id, tenant_id, product_id, user_id,
            adjustment_type, quantity, reason, reference_id,
            created_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
          ON CONFLICT (mongo_id) DO NOTHING`,
          [
            uuid,
            doc._id.toString(),
            tenantUuid,
            productUuid,
            userUuid,
            doc.adjustmentType || doc.adjustment_type || doc.type || 'manual',
            parseInt(doc.quantity || doc.qty || 0),
            doc.reason || doc.notes || null,
            doc.referenceId || doc.reference_id || null,
            safeDate(doc.createdAt || doc._id.getTimestamp?.()),
          ]
        );
      }
      done++;
    } catch (err) {
      errors++;
      console.error(`  [stockAdjustments] ERROR on ${doc._id}:`, err.message);
    }
  }

  console.log(`[stockAdjustments] done=${done} errors=${errors}`);
  return { total, done, errors };
}

async function migrateAuditEvents(mongo, pg) {
  const collections = ['auditEvents', 'audit_events', 'audits'];
  let col;
  
  for (const name of collections) {
    const c = mongo.collection(name);
    if (await c.countDocuments() > 0) { col = c; break; }
  }

  if (!col) {
    console.log('\n[auditEvents] no data found in any variant — skipping');
    return { total: 0, done: 0, errors: 0 };
  }

  const total = await col.countDocuments();
  console.log(`\n[auditEvents] found ${total} documents`);

  let done = 0, errors = 0;
  const cursor = col.find({});

  while (await cursor.hasNext()) {
    const doc = await cursor.next();
    const uuid = mongoIdToUuid(doc._id.toString());
    const tenantUuid = doc.tenantId ? mongoIdToUuid(doc.tenantId.toString()) : null;
    const userUuid = doc.userId ? mongoIdToUuid(doc.userId.toString()) : null;

    try {
      if (!DRY_RUN) {
        await pg.query(
          `INSERT INTO audit_events (
            id, mongo_id, tenant_id, user_id,
            action, resource_type, resource_id,
            ip_address, user_agent, metadata,
            created_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
          ON CONFLICT (mongo_id) DO NOTHING`,
          [
            uuid,
            doc._id.toString(),
            tenantUuid,
            userUuid,
            doc.action || 'unknown',
            doc.resourceType || doc.resource_type || doc.entity || null,
            doc.resourceId?.toString() || doc.resource_id?.toString() || null,
            doc.ipAddress || doc.ip_address || doc.ip || null,
            doc.userAgent || doc.user_agent || null,
            JSON.stringify(doc.metadata || doc.details || doc.changes || {}),
            safeDate(doc.createdAt || doc._id.getTimestamp?.()),
          ]
        );
      }
      done++;
    } catch (err) {
      errors++;
      console.error(`  [auditEvents] ERROR on ${doc._id}:`, err.message);
    }
  }

  console.log(`[auditEvents] done=${done} errors=${errors}`);
  return { total, done, errors };
}

async function migrateAdminAudit(mongo, pg) {
  const col = mongo.collection('adminAudit');
  const total = await col.countDocuments();
  console.log(`\n[adminAudit] found ${total} documents`);
  if (total === 0) return { total: 0, done: 0, errors: 0 };

  let done = 0, errors = 0;
  const cursor = col.find({});

  while (await cursor.hasNext()) {
    const doc = await cursor.next();
    const uuid = mongoIdToUuid(doc._id.toString());
    const adminUuid = doc.adminId ? mongoIdToUuid(doc.adminId.toString()) : null;

    try {
      if (!DRY_RUN) {
        await pg.query(
          `INSERT INTO admin_audit (
            id, mongo_id, admin_id,
            action, target_type, target_id,
            ip_address, metadata, created_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
          ON CONFLICT (mongo_id) DO NOTHING`,
          [
            uuid,
            doc._id.toString(),
            adminUuid,
            doc.action || 'unknown',
            doc.targetType || doc.target_type || null,
            doc.targetId?.toString() || doc.target_id?.toString() || null,
            doc.ipAddress || doc.ip_address || null,
            JSON.stringify(doc.metadata || doc.details || {}),
            safeDate(doc.createdAt || doc._id.getTimestamp?.()),
          ]
        );
      }
      done++;
    } catch (err) {
      errors++;
      console.error(`  [adminAudit] ERROR on ${doc._id}:`, err.message);
    }
  }

  console.log(`[adminAudit] done=${done} errors=${errors}`);
  return { total, done, errors };
}

async function migrateInvoiceCounters(mongo, pg) {
  const col = mongo.collection('invoiceCounters');
  const total = await col.countDocuments();
  console.log(`\n[invoiceCounters] found ${total} documents`);
  if (total === 0) return { total: 0, done: 0, errors: 0 };

  let done = 0, errors = 0;
  const cursor = col.find({});

  while (await cursor.hasNext()) {
    const doc = await cursor.next();
    const tenantUuid = doc.tenantId ? mongoIdToUuid(doc.tenantId.toString()) : null;

    try {
      if (!DRY_RUN) {
        await pg.query(
          `INSERT INTO invoice_counters (tenant_id, year, last_seq)
           VALUES ($1, $2, $3)
           ON CONFLICT (tenant_id, year) DO UPDATE SET
             last_seq = GREATEST(invoice_counters.last_seq, EXCLUDED.last_seq)`,
          [
            tenantUuid,
            doc.year || new Date().getFullYear(),
            doc.seq || doc.lastSeq || doc.last_seq || 0,
          ]
        );
      }
      done++;
    } catch (err) {
      errors++;
      console.error(`  [invoiceCounters] ERROR on ${doc._id}:`, err.message);
    }
  }

  console.log(`[invoiceCounters] done=${done} errors=${errors}`);
  return { total, done, errors };
}

async function main() {
  console.log('='.repeat(60));
  console.log('KazmiOn Migration Phase 3 — Supporting Data');
  console.log(DRY_RUN ? '*** DRY RUN — no data written ***' : '*** LIVE RUN ***');
  console.log('='.repeat(60));

  const mongo = new MongoClient(MONGO_URI);
  const pg    = new PgClient({ connectionString: POSTGRES_URL });

  try {
    await mongo.connect();
    console.log('[✓] MongoDB connected');
    const db = mongo.db();

    if (!DRY_RUN) {
      await pg.connect();
      console.log('[✓] PostgreSQL connected');
    }

    const results = {};
    results.stockAdjustments = await migrateStockAdjustments(db, pg);
    results.auditEvents      = await migrateAuditEvents(db, pg);
    results.adminAudit       = await migrateAdminAudit(db, pg);
    results.invoiceCounters  = await migrateInvoiceCounters(db, pg);

    console.log('\n' + '='.repeat(60));
    console.log('PHASE 3 SUMMARY');
    console.log('='.repeat(60));
    for (const [name, r] of Object.entries(results)) {
      const status = r.errors === 0 ? '✓' : '✗';
      console.log(`  ${status} ${name}: ${r.done}/${r.total} migrated, ${r.errors} errors`);
    }

  } finally {
    await mongo.close();
    if (!DRY_RUN) await pg.end();
  }
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
