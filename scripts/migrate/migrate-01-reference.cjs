#!/usr/bin/env node
// =============================================================================
// scripts/migrate/migrate-01-reference.cjs
// KazmiOn POS — ETL Phase 1: Reference data (tenants, users, products, customers)
// =============================================================================
// Usage:
//   node scripts/migrate/migrate-01-reference.cjs [--dry-run]
// Prerequisites:
//   MONGO_URI=mongodb://localhost:27017/pos
//   DATABASE_URL=postgresql://user:pass@localhost:5432/kazmion
// =============================================================================
'use strict';

const { MongoClient, ObjectId } = require('mongodb');
const { Client } = require('pg');
const crypto = require('node:crypto');

const DRY_RUN = process.argv.includes('--dry-run');
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/pos';
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is required');
  process.exit(1);
}

// UUID v4 deterministic from MongoDB ObjectId (preserves identity across runs)
function mongoIdToUuid(mongoId) {
  const hex = typeof mongoId === 'string' ? mongoId : mongoId.toHexString();
  // Pad to 32 hex chars and format as UUID
  const padded = hex.padStart(32, '0');
  return `${padded.slice(0,8)}-${padded.slice(8,12)}-4${padded.slice(13,16)}-${padded.slice(16,20)}-${padded.slice(20,32)}`;
}

function safeStr(v) { return v != null ? String(v) : null; }
function safeNum(v, def = 0) { return typeof v === 'number' && isFinite(v) ? v : def; }
function safeBool(v, def = false) { return typeof v === 'boolean' ? v : def; }
function safeDate(v) { return v instanceof Date ? v.toISOString() : (typeof v === 'string' ? v : null); }
function safeJson(v, def = '{}') { try { return JSON.stringify(v ?? JSON.parse(def)); } catch { return def; } }

let migratedTenants = 0, migratedUsers = 0, migratedProducts = 0, migratedCustomers = 0;
let skipped = 0, errors = 0;

async function migrateTenants(mongo, pg, tenantIdMap) {
  console.log('\n--- Migrating tenants ---');
  const tenants = await mongo.collection('tenants').find({}).toArray();
  console.log(`  Found ${tenants.length} tenant(s) in MongoDB`);

  for (const t of tenants) {
    const mongoId = t._id.toHexString();
    const uuid = mongoIdToUuid(mongoId);
    tenantIdMap.set(mongoId, uuid);
    try {
      if (!DRY_RUN) {
        await pg.query(`
          INSERT INTO tenants (
            id, mongo_id, name, domain_type, tax_reg_no, address, currency,
            invoice_prefix, logo_url, time_zone, tax_profile,
            installment_markup_percent, invoice_print_settings,
            feature_flags, navigation_visibility, status, deployment_mode,
            branch_limit, license_expires_at, created_at, updated_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
          ON CONFLICT (mongo_id) DO UPDATE SET
            name = EXCLUDED.name,
            status = EXCLUDED.status,
            updated_at = EXCLUDED.updated_at
        `, [
          uuid, mongoId,
          safeStr(t.name) ?? 'Unnamed Business',
          safeStr(t.domainType) ?? 'retail',
          safeStr(t.taxRegNo),
          safeStr(t.address),
          safeStr(t.currency) ?? 'PKR',
          safeStr(t.invoicePrefix) ?? 'INV',
          safeStr(t.logoUrl),
          safeStr(t.timeZone) ?? 'Asia/Karachi',
          safeJson(t.taxProfile),
          safeNum(t.installmentMarkupPercent),
          safeJson(t.invoicePrintSettings),
          safeJson(t.featureFlags, '{"pos":true,"inventory":true,"reports":true,"customers":true,"installments":false,"barcodes":false}'),
          safeJson(t.navigationVisibility),
          safeStr(t.status) ?? 'active',
          safeStr(t.deploymentMode) ?? 'offline',
          safeNum(t.branchLimit, 1),
          safeDate(t.licenseExpiresAt),
          safeDate(t.createdAt) ?? new Date().toISOString(),
          safeDate(t.updatedAt) ?? new Date().toISOString(),
        ]);
      }
      migratedTenants++;
      console.log(`  ✓ Tenant: ${t.name} (${mongoId} → ${uuid})`);
    } catch (err) {
      errors++;
      console.error(`  ✗ Tenant ${mongoId}: ${err.message}`);
    }
  }
}

async function migrateUsers(mongo, pg, tenantIdMap, userIdMap) {
  console.log('\n--- Migrating users ---');
  const users = await mongo.collection('users').find({}).toArray();
  console.log(`  Found ${users.length} user(s) in MongoDB`);

  for (const u of users) {
    const mongoId = u._id.toHexString();
    const tenantMongoId = u.tenantId?.toHexString?.() ?? safeStr(u.tenantId);
    const tenantUuid = tenantIdMap.get(tenantMongoId);
    if (!tenantUuid) {
      console.warn(`  ⚠ User ${mongoId}: tenant ${tenantMongoId} not migrated — skipping`);
      skipped++;
      continue;
    }
    const uuid = mongoIdToUuid(mongoId);
    userIdMap.set(mongoId, uuid);
    try {
      if (!DRY_RUN) {
        await pg.query(`
          INSERT INTO users (
            id, mongo_id, tenant_id, name, email, password_hash,
            pin_hash, developer_pin_hash, pin_requires_change, pin_version,
            session_version, developer_session_version, role, is_active,
            is_super_admin, is_developer, recovery_email, phone,
            phone_verified, email_verified, email_verified_at,
            password_requires_change, pin_enabled,
            module_rights, permissions, enrollment_expires_at,
            created_at, updated_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28)
          ON CONFLICT (mongo_id) DO UPDATE SET
            name = EXCLUDED.name,
            email = EXCLUDED.email,
            is_active = EXCLUDED.is_active,
            updated_at = EXCLUDED.updated_at
        `, [
          uuid, mongoId, tenantUuid,
          safeStr(u.name),
          safeStr(u.email)?.toLowerCase(),
          safeStr(u.passwordHash) ?? '$argon2id$PLACEHOLDER',
          safeStr(u.pinHash),
          safeStr(u.developerPinHash),
          safeBool(u.pinRequiresChange),
          safeNum(u.pinVersion),
          safeNum(u.sessionVersion),
          safeNum(u.developerSessionVersion),
          safeStr(u.role) ?? 'cashier',
          safeBool(u.isActive, true),
          safeBool(u.superAdmin),
          safeBool(u.isDeveloper),
          safeStr(u.recoveryEmail),
          safeStr(u.phone),
          safeBool(u.phoneVerified),
          safeBool(u.emailVerified),
          safeDate(u.emailVerifiedAt),
          safeBool(u.passwordRequiresChange),
          safeBool(u.pinEnabled),
          JSON.stringify(Array.isArray(u.moduleRights) ? u.moduleRights : []),
          JSON.stringify(Array.isArray(u.permissions) ? u.permissions : []),
          safeDate(u.enrollmentExpiresAt),
          safeDate(u.createdAt) ?? new Date().toISOString(),
          safeDate(u.updatedAt) ?? new Date().toISOString(),
        ]);
      }
      migratedUsers++;
      console.log(`  ✓ User: ${u.email} [${u.role}] (${mongoId})`);
    } catch (err) {
      errors++;
      console.error(`  ✗ User ${mongoId} (${u.email}): ${err.message}`);
    }
  }
}

async function migrateProducts(mongo, pg, tenantIdMap, productIdMap) {
  console.log('\n--- Migrating products ---');
  const products = await mongo.collection('products').find({}).toArray();
  console.log(`  Found ${products.length} product(s) in MongoDB`);

  for (const p of products) {
    const mongoId = p._id.toHexString();
    const tenantMongoId = p.tenantId?.toHexString?.() ?? safeStr(p.tenantId);
    const tenantUuid = tenantIdMap.get(tenantMongoId);
    if (!tenantUuid) { skipped++; continue; }
    const uuid = mongoIdToUuid(mongoId);
    productIdMap.set(mongoId, uuid);
    try {
      if (!DRY_RUN) {
        await pg.query(`
          INSERT INTO products (
            id, mongo_id, tenant_id, name, sku, barcode, category, unit,
            price, cost_price, stock_qty, low_stock_threshold, track_stock,
            tax_class, attributes, image_url, is_active, created_at, updated_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
          ON CONFLICT (mongo_id) DO UPDATE SET
            name = EXCLUDED.name, price = EXCLUDED.price,
            stock_qty = EXCLUDED.stock_qty, is_active = EXCLUDED.is_active,
            updated_at = EXCLUDED.updated_at
        `, [
          uuid, mongoId, tenantUuid,
          safeStr(p.name),
          safeStr(p.sku),
          safeStr(p.barcode),
          safeStr(p.category),
          safeStr(p.unit),
          safeNum(p.price),
          p.costPrice != null ? safeNum(p.costPrice) : null,
          safeNum(p.stockQty ?? p.stock, 0),
          safeNum(p.lowStockThreshold, 5),
          safeBool(p.trackStock, true),
          safeStr(p.taxClass) ?? 'standard',
          safeJson(p.attributes),
          safeStr(p.imageUrl),
          safeBool(p.isActive, true),
          safeDate(p.createdAt) ?? new Date().toISOString(),
          safeDate(p.updatedAt) ?? new Date().toISOString(),
        ]);
      }
      migratedProducts++;
    } catch (err) {
      errors++;
      console.error(`  ✗ Product ${mongoId} (${p.name}): ${err.message}`);
    }
  }
  console.log(`  ✓ ${migratedProducts} products migrated`);
}

async function migrateCustomers(mongo, pg, tenantIdMap, customerIdMap) {
  console.log('\n--- Migrating customers ---');
  const customers = await mongo.collection('customers').find({}).toArray();
  console.log(`  Found ${customers.length} customer(s) in MongoDB`);

  for (const c of customers) {
    const mongoId = c._id.toHexString();
    const tenantMongoId = c.tenantId?.toHexString?.() ?? safeStr(c.tenantId);
    const tenantUuid = tenantIdMap.get(tenantMongoId);
    if (!tenantUuid) { skipped++; continue; }
    const uuid = mongoIdToUuid(mongoId);
    customerIdMap.set(mongoId, uuid);
    try {
      if (!DRY_RUN) {
        await pg.query(`
          INSERT INTO customers (
            id, mongo_id, tenant_id, name, phone, cnic, address, notes, guarantor, created_at, updated_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
          ON CONFLICT (mongo_id) DO UPDATE SET
            name = EXCLUDED.name, phone = EXCLUDED.phone, updated_at = EXCLUDED.updated_at
        `, [
          uuid, mongoId, tenantUuid,
          safeStr(c.name),
          safeStr(c.phone),
          safeStr(c.cnic),
          safeStr(c.address),
          safeStr(c.notes),
          safeJson(c.guarantor),
          safeDate(c.createdAt) ?? new Date().toISOString(),
          safeDate(c.updatedAt) ?? new Date().toISOString(),
        ]);
      }
      migratedCustomers++;
    } catch (err) {
      errors++;
      console.error(`  ✗ Customer ${mongoId}: ${err.message}`);
    }
  }
  console.log(`  ✓ ${migratedCustomers} customers migrated`);
}

async function validateCounts(mongo, pg) {
  console.log('\n--- Validation: record counts ---');
  const checks = [
    { collection: 'tenants',   table: 'tenants',   migrated: migratedTenants },
    { collection: 'users',     table: 'users',     migrated: migratedUsers },
    { collection: 'products',  table: 'products',  migrated: migratedProducts },
    { collection: 'customers', table: 'customers', migrated: migratedCustomers },
  ];
  let allPass = true;
  for (const { collection, table, migrated } of checks) {
    const mongoCount = await mongo.collection(collection).countDocuments();
    const { rows } = await pg.query(`SELECT count(*) FROM ${table}`);
    const pgCount = Number(rows[0].count);
    const pass = pgCount >= migrated;
    const icon = pass ? '✓' : '✗';
    console.log(`  ${icon} ${table}: MongoDB=${mongoCount}  migrated=${migrated}  PostgreSQL=${pgCount}`);
    if (!pass) allPass = false;
  }
  return allPass;
}

async function main() {
  console.log('='.repeat(60));
  console.log('KazmiOn POS — ETL Phase 1: Reference Data Migration');
  console.log(DRY_RUN ? '*** DRY RUN — no data written ***' : '*** LIVE RUN — writing to PostgreSQL ***');
  console.log('='.repeat(60));

  const mongoClient = new MongoClient(MONGO_URI);
  const pgClient = new Client({ connectionString: DATABASE_URL });

  try {
    await mongoClient.connect();
    console.log('✓ MongoDB connected');
    await pgClient.connect();
    console.log('✓ PostgreSQL connected');

    const mongo = mongoClient.db();
    const pg = pgClient;

    const tenantIdMap = new Map();   // mongoId → uuid
    const userIdMap = new Map();
    const productIdMap = new Map();
    const customerIdMap = new Map();

    await migrateTenants(mongo, pg, tenantIdMap);
    await migrateUsers(mongo, pg, tenantIdMap, userIdMap);
    await migrateProducts(mongo, pg, tenantIdMap, productIdMap);
    await migrateCustomers(mongo, pg, tenantIdMap, customerIdMap);

    if (!DRY_RUN) {
      const pass = await validateCounts(mongo, pg);
      console.log('\n' + '='.repeat(60));
      console.log(pass ? '✅ Phase 1 migration PASSED validation' : '❌ Phase 1 migration FAILED validation — check errors above');
    }

    console.log('\n--- Summary ---');
    console.log(`  Tenants:   ${migratedTenants}`);
    console.log(`  Users:     ${migratedUsers}`);
    console.log(`  Products:  ${migratedProducts}`);
    console.log(`  Customers: ${migratedCustomers}`);
    console.log(`  Skipped:   ${skipped}`);
    console.log(`  Errors:    ${errors}`);

    if (errors > 0) process.exit(1);
  } finally {
    await mongoClient.close();
    await pgClient.end();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
