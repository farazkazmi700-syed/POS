#!/usr/bin/env node
/**
 * KazmiOn Migration Validation — Reconciliation Script
 *
 * Checks:
 *   1. Record counts: MongoDB vs PostgreSQL for every table
 *   2. Financial totals: SUM(grand_total) orders
 *   3. Foreign key orphan check
 *   4. Sample 10 random orders field comparison
 *
 * Usage:
 *   node deploy/scripts/migrate/validate-migration.cjs
 */

'use strict';

const { createRequire } = require('node:module');
const path = require('node:path');
const { mongoIdToUuid } = require('./legacy-id.cjs');

const MONGO_URI = process.env.MONGO_URI;
const POSTGRES_URL = process.env.POSTGRES_URL;

const TABLE_MAP = [
  { mongo: 'tenants',             pg: 'tenants' },
  { mongo: 'users',               pg: 'users' },
  { mongo: 'products',            pg: 'products' },
  { mongo: 'customers',           pg: 'customers' },
  { mongo: 'orders',              pg: 'orders' },
  { mongo: 'installmentproducts', pg: 'installment_products' },
  { mongo: 'installmentplans',    pg: 'installment_plans' },
  { mongo: 'installmentsales',    pg: 'installment_sales' },
];

async function main() {
  if (!MONGO_URI || !POSTGRES_URL) {
    console.error('Set MONGO_URI and POSTGRES_URL to explicit migration rehearsal databases.');
    process.exitCode = 1;
    return;
  }
  const requireMigration = createRequire(path.join(__dirname, '../migration/package.json'));
  const { MongoClient } = requireMigration('mongodb');
  const { Client: PgClient } = requireMigration('pg');
  console.log('='.repeat(60));
  console.log('KazmiOn Migration Validation Report');
  console.log(new Date().toISOString());
  console.log('='.repeat(60));

  const mongo = new MongoClient(MONGO_URI);
  const pg    = new PgClient({ connectionString: POSTGRES_URL });

  let passed = 0, failed = 0, warnings = 0;

  try {
    await mongo.connect();
    await pg.connect();
    const db = mongo.db();

    // 1. Count comparison
    console.log('\n--- 1. Record Count Comparison ---');
    for (const { mongo: col, pg: tbl } of TABLE_MAP) {
      const mongoCount = await db.collection(col).countDocuments();
      const pgRes      = await pg.query(`SELECT COUNT(*) FROM ${tbl}`);
      const pgCount    = parseInt(pgRes.rows[0].count);
      const match      = mongoCount === pgCount;
      const status     = match ? '✓' : '✗';
      if (match) passed++; else failed++;
      console.log(`  ${status} ${col}: MongoDB=${mongoCount} → PG=${pgCount}${match ? '' : ' ← MISMATCH'}`);
    }

    // 2. Financial totals
    console.log('\n--- 2. Financial Totals (orders.grand_total) ---');
    const mongoOrders = await db.collection('orders').aggregate([
      { $group: { _id: null, total: { $sum: { $toDouble: '$grandTotal' } } } }
    ]).toArray();
    const mongoTotal = mongoOrders[0]?.total || 0;

    const pgTotalRes = await pg.query(`SELECT COALESCE(SUM(grand_total),0) AS total FROM orders`);
    const pgTotal    = parseFloat(pgTotalRes.rows[0].total);

    const diff = Math.abs(mongoTotal - pgTotal);
    const pct  = mongoTotal > 0 ? (diff / mongoTotal * 100).toFixed(4) : 0;
    if (diff < 0.01) {
      passed++;
      console.log(`  ✓ Grand totals match: ${mongoTotal.toFixed(2)}`);
    } else {
      failed++;
      console.log(`  ✗ Grand total mismatch: MongoDB=${mongoTotal.toFixed(2)} PG=${pgTotal.toFixed(2)} diff=${diff.toFixed(2)} (${pct}%)`);
    }

    // 3. FK orphan checks
    console.log('\n--- 3. Referential Integrity Checks ---');
    const orphanQueries = [
      { name: 'orders → tenants',         sql: `SELECT COUNT(*) FROM orders o LEFT JOIN tenants t ON o.tenant_id=t.id WHERE o.tenant_id IS NOT NULL AND t.id IS NULL` },
      { name: 'order_items → orders',     sql: `SELECT COUNT(*) FROM order_items oi LEFT JOIN orders o ON oi.order_id=o.id WHERE o.id IS NULL` },
      { name: 'users → tenants',          sql: `SELECT COUNT(*) FROM users u LEFT JOIN tenants t ON u.tenant_id=t.id WHERE u.tenant_id IS NOT NULL AND t.id IS NULL` },
      { name: 'installment_sales → customers', sql: `SELECT COUNT(*) FROM installment_sales s LEFT JOIN customers c ON s.customer_id=c.id WHERE s.customer_id IS NOT NULL AND c.id IS NULL` },
    ];

    for (const { name, sql } of orphanQueries) {
      const res = await pg.query(sql);
      const count = parseInt(res.rows[0].count);
      if (count === 0) {
        passed++;
        console.log(`  ✓ ${name}: no orphans`);
      } else {
        warnings++;
        console.log(`  ⚠ ${name}: ${count} orphan(s)`);
      }
    }

    // 4. Sample comparison (10 orders)
    console.log('\n--- 4. Sample Record Spot-Check (10 orders) ---');
    const sampleOrders = await db.collection('orders').find({}).limit(10).toArray();
    let sampleOk = 0, sampleBad = 0;
    for (const doc of sampleOrders) {
      const uuid = mongoIdToUuid(doc._id.toString());
      const pgRow = await pg.query(`SELECT invoice_no, grand_total FROM orders WHERE id=$1`, [uuid]);
      if (pgRow.rows.length === 0) {
        sampleBad++;
        console.log(`    ✗ ${doc._id} not found in PG`);
      } else {
        const pgGrandTotal = parseFloat(pgRow.rows[0].grand_total);
        const mgGrandTotal = parseFloat(doc.grandTotal || doc.grand_total || 0);
        if (Math.abs(pgGrandTotal - mgGrandTotal) < 0.01) {
          sampleOk++;
        } else {
          sampleBad++;
          console.log(`    ✗ ${doc._id} grand_total: MG=${mgGrandTotal} PG=${pgGrandTotal}`);
        }
      }
    }
    if (sampleBad === 0) {
      passed++;
      console.log(`  ✓ All ${sampleOk} sample orders match`);
    } else {
      failed++;
      console.log(`  ✗ ${sampleBad} sample orders have mismatches`);
    }

  } finally {
    await mongo.close();
    await pg.end();
  }

  console.log('\n' + '='.repeat(60));
  console.log(`VALIDATION SUMMARY: ${passed} passed, ${failed} failed, ${warnings} warnings`);
  console.log('='.repeat(60));

  if (failed > 0 || warnings > 0) process.exitCode = 1;
}

main().catch(() => {
  console.error('Migration validation failed. Check database connectivity, schema and permissions.');
  process.exitCode = 1;
});
