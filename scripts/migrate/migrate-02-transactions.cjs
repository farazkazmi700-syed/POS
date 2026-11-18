#!/usr/bin/env node
/**
 * KazmiOn Migration Phase 2 — Transactions (Orders + Installments)
 * 
 * Migrates:
 *   MongoDB: orders → PostgreSQL: orders + order_items
 *   MongoDB: installmentProducts → PostgreSQL: installment_products
 *   MongoDB: installmentPlans   → PostgreSQL: installment_plans
 *   MongoDB: installmentSales   → PostgreSQL: installment_sales
 *
 * Usage:
 *   node scripts/migrate/migrate-02-transactions.cjs [--dry-run]
 *
 * Requires env vars:
 *   MONGO_URI        (e.g. mongodb://localhost:27017/pos)
 *   POSTGRES_URL     (e.g. postgresql://kazmion:pass@localhost:5432/kazmion)
 */

'use strict';

const { MongoClient, ObjectId } = require('mongodb');
const { Client: PgClient }      = require('pg');
const { mongoIdToUuid } = require('./legacy-id.cjs');

const DRY_RUN = process.argv.includes('--dry-run');

const MONGO_URI    = process.env.MONGO_URI    || 'mongodb://localhost:27017/pos';
const POSTGRES_URL = process.env.POSTGRES_URL || 'postgresql://kazmion:kazmion@localhost:5432/kazmion';

function safeNum(val) {
  const n = parseFloat(val);
  return isNaN(n) ? 0 : n;
}

function safeDate(val) {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

async function migrateOrders(mongo, pg) {
  const col = mongo.collection('orders');
  const total = await col.countDocuments();
  console.log(`\n[orders] found ${total} documents`);

  let done = 0, errors = 0;
  const cursor = col.find({});

  while (await cursor.hasNext()) {
    const doc = await cursor.next();
    const uuid = mongoIdToUuid(doc._id.toString());
    const tenantUuid = doc.tenantId ? mongoIdToUuid(doc.tenantId.toString()) : null;
    const customerUuid = doc.customerId ? mongoIdToUuid(doc.customerId.toString()) : null;

    try {
      if (!DRY_RUN) {
        await pg.query(
          `INSERT INTO orders (
            id, mongo_id, tenant_id, customer_id,
            invoice_no, invoice_type, payment_method, payment_status,
            subtotal, discount_amount, tax_amount, grand_total, amount_paid, change_due,
            notes, idempotency_key,
            created_at, updated_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
          ON CONFLICT (mongo_id) DO UPDATE SET
            invoice_no     = EXCLUDED.invoice_no,
            grand_total    = EXCLUDED.grand_total,
            updated_at     = EXCLUDED.updated_at`,
          [
            uuid,
            doc._id.toString(),
            tenantUuid,
            customerUuid,
            doc.invoiceNo || doc.invoice_no || null,
            doc.invoiceType || doc.invoice_type || 'sale',
            doc.paymentMethod || doc.payment_method || 'cash',
            doc.paymentStatus || doc.payment_status || 'paid',
            safeNum(doc.subtotal),
            safeNum(doc.discountAmount || doc.discount_amount),
            safeNum(doc.taxAmount || doc.tax_amount),
            safeNum(doc.grandTotal || doc.grand_total),
            safeNum(doc.amountPaid || doc.amount_paid),
            safeNum(doc.changeDue || doc.change_due),
            doc.notes || null,
            doc.idempotencyKey || doc.idempotency_key || uuid,
            safeDate(doc.createdAt || doc.created_at || doc._id.getTimestamp?.()),
            safeDate(doc.updatedAt || doc.updated_at),
          ]
        );

        // Migrate order items
        const items = doc.items || doc.orderItems || [];
        for (const item of items) {
          const itemUuid = mongoIdToUuid(item._id?.toString() || `${doc._id}-${Math.random()}`);
          const productUuid = item.productId ? mongoIdToUuid(item.productId.toString()) : null;
          await pg.query(
            `INSERT INTO order_items (
              id, order_id, product_id, mongo_id,
              name, sku, quantity, unit_price, discount_amount, line_total
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
            ON CONFLICT (mongo_id) DO NOTHING`,
            [
              itemUuid,
              uuid,
              productUuid,
              item._id?.toString() || itemUuid,
              item.name || '',
              item.sku || null,
              safeNum(item.quantity || item.qty),
              safeNum(item.unitPrice || item.unit_price || item.price),
              safeNum(item.discountAmount || item.discount_amount),
              safeNum(item.lineTotal || item.line_total || item.total),
            ]
          );
        }
      }
      done++;
      if (done % 100 === 0) console.log(`  [orders] ${done}/${total}`);
    } catch (err) {
      errors++;
      console.error(`  [orders] ERROR on ${doc._id}:`, err.message);
    }
  }

  console.log(`[orders] done=${done} errors=${errors}`);
  return { total, done, errors };
}

async function migrateInstallmentProducts(mongo, pg) {
  const col = mongo.collection('installmentproducts');
  const total = await col.countDocuments();
  console.log(`\n[installmentProducts] found ${total} documents`);

  let done = 0, errors = 0;
  const cursor = col.find({});

  while (await cursor.hasNext()) {
    const doc = await cursor.next();
    const uuid = mongoIdToUuid(doc._id.toString());
    const tenantUuid = doc.tenantId ? mongoIdToUuid(doc.tenantId.toString()) : null;

    try {
      if (!DRY_RUN) {
        await pg.query(
          `INSERT INTO installment_products (
            id, mongo_id, tenant_id,
            name, description, cash_price, installment_price, is_active,
            created_at, updated_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
          ON CONFLICT (mongo_id) DO UPDATE SET
            name              = EXCLUDED.name,
            installment_price = EXCLUDED.installment_price,
            updated_at        = EXCLUDED.updated_at`,
          [
            uuid,
            doc._id.toString(),
            tenantUuid,
            doc.name || '',
            doc.description || null,
            safeNum(doc.cashPrice || doc.cash_price),
            safeNum(doc.installmentPrice || doc.installment_price),
            doc.isActive ?? doc.is_active ?? true,
            safeDate(doc.createdAt || doc._id.getTimestamp?.()),
            safeDate(doc.updatedAt),
          ]
        );
      }
      done++;
    } catch (err) {
      errors++;
      console.error(`  [installmentProducts] ERROR on ${doc._id}:`, err.message);
    }
  }

  console.log(`[installmentProducts] done=${done} errors=${errors}`);
  return { total, done, errors };
}

async function migrateInstallmentPlans(mongo, pg) {
  const col = mongo.collection('installmentplans');
  const total = await col.countDocuments();
  console.log(`\n[installmentPlans] found ${total} documents`);

  let done = 0, errors = 0;
  const cursor = col.find({});

  while (await cursor.hasNext()) {
    const doc = await cursor.next();
    const uuid = mongoIdToUuid(doc._id.toString());
    const tenantUuid = doc.tenantId ? mongoIdToUuid(doc.tenantId.toString()) : null;
    const productUuid = doc.productId ? mongoIdToUuid(doc.productId.toString()) : null;

    try {
      if (!DRY_RUN) {
        await pg.query(
          `INSERT INTO installment_plans (
            id, mongo_id, tenant_id, product_id,
            name, duration_months, down_payment, monthly_payment, total_amount,
            is_active, created_at, updated_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
          ON CONFLICT (mongo_id) DO UPDATE SET
            name            = EXCLUDED.name,
            monthly_payment = EXCLUDED.monthly_payment,
            updated_at      = EXCLUDED.updated_at`,
          [
            uuid,
            doc._id.toString(),
            tenantUuid,
            productUuid,
            doc.name || '',
            safeNum(doc.durationMonths || doc.duration_months || doc.months),
            safeNum(doc.downPayment || doc.down_payment),
            safeNum(doc.monthlyPayment || doc.monthly_payment),
            safeNum(doc.totalAmount || doc.total_amount),
            doc.isActive ?? doc.is_active ?? true,
            safeDate(doc.createdAt || doc._id.getTimestamp?.()),
            safeDate(doc.updatedAt),
          ]
        );
      }
      done++;
    } catch (err) {
      errors++;
      console.error(`  [installmentPlans] ERROR on ${doc._id}:`, err.message);
    }
  }

  console.log(`[installmentPlans] done=${done} errors=${errors}`);
  return { total, done, errors };
}

async function migrateInstallmentSales(mongo, pg) {
  const col = mongo.collection('installmentsales');
  const total = await col.countDocuments();
  console.log(`\n[installmentSales] found ${total} documents`);

  let done = 0, errors = 0;
  const cursor = col.find({});

  while (await cursor.hasNext()) {
    const doc = await cursor.next();
    const uuid = mongoIdToUuid(doc._id.toString());
    const tenantUuid = doc.tenantId ? mongoIdToUuid(doc.tenantId.toString()) : null;
    const customerUuid = doc.customerId ? mongoIdToUuid(doc.customerId.toString()) : null;
    const planUuid = doc.planId ? mongoIdToUuid(doc.planId.toString()) : null;
    const productUuid = doc.productId ? mongoIdToUuid(doc.productId.toString()) : null;

    // Serialize complex arrays as JSONB
    const schedule = JSON.stringify(doc.schedule || doc.paymentSchedule || []);
    const payments = JSON.stringify(doc.payments || doc.paymentHistory || []);

    try {
      if (!DRY_RUN) {
        await pg.query(
          `INSERT INTO installment_sales (
            id, mongo_id, tenant_id, customer_id, plan_id, product_id,
            invoice_no, status,
            down_payment_paid, total_amount, amount_paid, amount_remaining,
            start_date, next_due_date,
            schedule, payments,
            notes, created_at, updated_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
          ON CONFLICT (mongo_id) DO UPDATE SET
            status         = EXCLUDED.status,
            amount_paid    = EXCLUDED.amount_paid,
            payments       = EXCLUDED.payments,
            updated_at     = EXCLUDED.updated_at`,
          [
            uuid,
            doc._id.toString(),
            tenantUuid,
            customerUuid,
            planUuid,
            productUuid,
            doc.invoiceNo || doc.invoice_no || null,
            doc.status || 'active',
            safeNum(doc.downPaymentPaid || doc.down_payment_paid),
            safeNum(doc.totalAmount || doc.total_amount),
            safeNum(doc.amountPaid || doc.amount_paid),
            safeNum(doc.amountRemaining || doc.amount_remaining),
            safeDate(doc.startDate || doc.start_date),
            safeDate(doc.nextDueDate || doc.next_due_date),
            schedule,
            payments,
            doc.notes || null,
            safeDate(doc.createdAt || doc._id.getTimestamp?.()),
            safeDate(doc.updatedAt),
          ]
        );
      }
      done++;
    } catch (err) {
      errors++;
      console.error(`  [installmentSales] ERROR on ${doc._id}:`, err.message);
    }
  }

  console.log(`[installmentSales] done=${done} errors=${errors}`);
  return { total, done, errors };
}

async function main() {
  console.log('='.repeat(60));
  console.log('KazmiOn Migration Phase 2 — Transactions');
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
    results.orders               = await migrateOrders(db, pg);
    results.installmentProducts  = await migrateInstallmentProducts(db, pg);
    results.installmentPlans     = await migrateInstallmentPlans(db, pg);
    results.installmentSales     = await migrateInstallmentSales(db, pg);

    console.log('\n' + '='.repeat(60));
    console.log('PHASE 2 SUMMARY');
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
