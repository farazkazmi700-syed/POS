# PostgreSQL Migration Plan (STEP 4)

**Date:** 2026-11-17  
**Objective:** Migrate primary data store from MongoDB to PostgreSQL while preserving all existing customer data, modules, routes, permissions, and UIs.

## 1. Migration Principles

1. **Never delete MongoDB data automatically** — backups required before every step
2. **Idempotent ETL scripts** — safe to retry
3. **Controlled cutover** — feature flags, dual-write period, verification gates
4. **Documented rollback** — at every checkpoint
5. **Zero-downtime target** — dual-write allows read from MongoDB while writing to both

## 2. Migration Phases

### Phase 0: Preparation (Checkpoint CP-0)

**Goal:** Establish PostgreSQL infrastructure, backup strategy, and migration tooling.

**Tasks:**
- [ ] Provision PostgreSQL 16 instance (local dev + Docker + staging)
- [ ] Create `packages/config/` configuration schema with validation
- [ ] Write `scripts/migrate/` ETL skeleton (idempotent, field-by-field mapping)

### Phase 1: Schema and Dual-Write (Checkpoint CP-1)

**Goal:** PostgreSQL schema deployed, API writes to both MongoDB and PostgreSQL, reads from MongoDB.

**Tasks:**
- [ ] Deploy PostgreSQL schema (all tables from TARGET_STATE.md section 5)
- [ ] Enable Row-Level Security on tenant-scoped tables
- [ ] Create database migration tooling (Drizzle Kit or `pg-migrate`)
- [ ] Modify API services to write to both MongoDB (existing) and PostgreSQL (new)
- [ ] Reads continue from MongoDB (no change to API behavior)
- [ ] Add health check for PostgreSQL connectivity
- [ ] Run migration ETL for reference data (tenants, users, products, customers)

**Exit Criteria:** Dual-write verified, data counts match between MongoDB and PostgreSQL for reference tables.

**Rollback:** Stop writing to PostgreSQL, revert to MongoDB-only. PostgreSQL can be dropped or kept as standby.

### Phase 2: Transactional Data Migration (Checkpoint CP-2)


### Phase 3: Cutover (Checkpoint CP-3)

**Goal:** API reads from PostgreSQL, MongoDB becomes read-only.

**Tasks:**
- [ ] Feature flag: `READ_FROM_POSTGRESQL=true`
- [ ] Modify API services to read from PostgreSQL (fallback to MongoDB on error during transition)
- [ ] Disable writes to MongoDB (MongoDB becomes read-only)
- [ ] Run full regression test suite against PostgreSQL reads
- [ ] Verify all modules functional: POS checkout, invoices, installments, reports, RBAC
- [ ] Run E2E tests on both port 5173 (dev) and port 8080 (Docker)

**Exit Criteria:** All regression tests pass against PostgreSQL, all modules functional.

**Rollback:** Set `READ_FROM_POSTGRESQL=false`, re-enable MongoDB writes.

### Phase 4: Decommission (Checkpoint CP-4)

**Goal:** MongoDB no longer used by the application.


## 3. Field-by-Field Migration Mapping

| MongoDB Field | PostgreSQL Column | Type | Notes |
|--------------|------------------|------|-------|
| `_id` | `id` | UUID | `gen_random_uuid()` |
| `tenantId` (ObjectId) | `tenant_id` | UUID | Foreign key to tenants |
| `name` | `name` | TEXT | — |
| `email` | `email` | TEXT | Unique constraint |
| `passwordHash` | `password_hash` | TEXT | Argon2id hash |
| `price` | `price` | NUMERIC(12,2) | Never FLOAT |
| `stockQty` | `stock_qty` | INTEGER | — |
| `createdAt` (Date) | `created_at` | TIMESTAMPTZ | UTC |
| `taxProfile` (object) | `tax_profile` | JSONB | Flexible schema |
| `featureFlags` (object) | `feature_flags` | JSONB | Flexible schema |
| `schedule` (array) | `schedule` | JSONB | Array of schedule entries |
| `payments` (array) | `payments` | JSONB | Array of payment records |
| `items` (array, embedded) | `order_items` table | — | Normalized to child table |
| `guarantor` (object) | `guarantor` | JSONB | Embedded document |

## 5. Verification Checks

| Check | Method | Pass Criteria |
|-------|--------|---------------|
| Record counts | `SELECT count(*)` vs MongoDB `countDocuments()` | Exact match |
| Financial totals | `SUM(grand_total)` vs MongoDB aggregation | Exact match (2 decimal places) |
| Referential integrity | FK constraint check, orphan scan | Zero orphans |
| Sample records | Field-by-field comparison of 10 random records per table | Exact match |
| Invoice numbering | Counter values match | Exact match |
| Idempotency keys | Unique constraint enforcement | No duplicates |
| API regression | Full test suite against PostgreSQL | 100% pass |

## 6. Rollback Procedures

### Rollback at CP-0 or CP-1
Stop API, revert code to pre-dual-write version. Drop PostgreSQL tables or leave as standby. Restart API (MongoDB only).

### Rollback at CP-2
Set `READ_FROM_POSTGRESQL=false`. Restart API (reads from MongoDB, writes to both during transition). PostgreSQL data preserved for debugging.

### Rollback at CP-3
Set `READ_FROM_POSTGRESQL=false`. Re-enable MongoDB writes. Restart API. PostgreSQL becomes read-only standby.

### Rollback at CP-4
Restore MongoDB from archived backup (manual, last resort). Revert application code to MongoDB-only version.

## 7. Backup Before Migration

**Required before every migration phase:**

```bash
# MongoDB backup
mongodump --uri="mongodb://localhost:27017/pos" --out="backups/mongo/pre-migration-$(date +%Y%m%d-%H%M%S)"

# PostgreSQL backup (if exists)
pg_dump "$DATABASE_URL" > "backups/postgres/pre-migration-$(date +%Y%m%d-%H%M%S).sql"
```

**Backups are never deleted automatically.**

## 8. Timeline Estimate

| Phase | Duration | Dependencies |
|-------|----------|--------------|
| CP-0 Preparation | 1-2 days | PostgreSQL provisioning |
| CP-1 Schema + Dual-Write | 3-5 days | Schema design, ETL skeleton |
| CP-2 Transactional Migration | 2-3 days | CP-1 complete |
| CP-3 Cutover | 1-2 days | CP-2 complete, tests pass |
| CP-4 Decommission | 7-30 days (verification) | CP-3 complete, stable operation |

**Total: 2-6 weeks depending on verification period.**

## 4. ETL Script Structure

```
scripts/migrate/
  migrate-01-reference.ts    # tenants, users, products, customers
  migrate-02-transactions.ts # orders, order_items, installments
  migrate-03-supporting.ts   # stock_adjustments, audit_events, counters
  validate-migration.ts      # count, totals, referential integrity checks
```

Each script:
- Reads from MongoDB (source of truth)
- Writes to PostgreSQL (idempotent: `ON CONFLICT DO NOTHING` / `UPSERT`)
- Logs progress and errors
- Can be re-run safely
**Tasks:**
- [ ] Verification period: 7-30 days of successful PostgreSQL operation
- [ ] Remove MongoDB write code from API services
- [ ] Remove Mongoose dependency
- [ ] Take final MongoDB backup and archive (never delete automatically)
- [ ] Update documentation to remove MongoDB references

**Exit Criteria:** MongoDB no longer connected by API, final backup archived.

**Rollback:** Restore from archived MongoDB backup if needed (manual process).
**Goal:** Migrate all transactional data to PostgreSQL.

**Tasks:**
- [ ] Migrate orders, order_items (with idempotency keys preserved)
- [ ] Migrate installment_plans, installment_products, installment_sales
- [ ] Migrate stock_adjustments
- [ ] Migrate audit_events
- [ ] Migrate invoice_counters, checkout_requests
- [ ] Validate: row counts, financial totals (sum of grand_total), referential integrity
- [ ] Validate: sample records field-by-field against MongoDB originals

**Exit Criteria:** All transactional data in PostgreSQL, counts match, financial totals match, sample records verified.

**Rollback:** Revert to MongoDB reads. PostgreSQL data preserved for debugging.
- [ ] Create backup script: `scripts/backup/pg-backup.sh` and `scripts/backup/mongo-backup.sh`
- [ ] Create restore script: `scripts/restore/pg-restore.sh` and `scripts/restore/mongo-restore.sh`
- [ ] Set up connection pooling (sized for deployment: 10-20 connections)
- [ ] Verify backups are restorable

**Exit Criteria:** PostgreSQL running, backups verified, ETL skeleton compiles.

**Rollback:** Nothing to roll back — no data migrated yet.