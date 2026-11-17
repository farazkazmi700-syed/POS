# KazmiOn — PostgreSQL Migration Guide

> [!NOTE]
> KazmiOn currently uses **MongoDB 7** as its primary database. This document describes the migration path to PostgreSQL. The migration is **opt-in** and must be explicitly activated. All MongoDB data is preserved until you approve cutover.

## Migration Architecture

```
Phase CP-0: Preparation       — Schema created, scripts ready, MongoDB unchanged
Phase CP-1: Dry-run validation — Run ETL scripts against live data, validate counts
Phase CP-2: Parallel writes    — New records written to both MongoDB and PostgreSQL  
Phase CP-3: Cutover            — PostgreSQL becomes primary, MongoDB becomes read-only
Phase CP-4: Decommission       — MongoDB archived (requires explicit approval)
```

> [!CAUTION]
> **Never delete MongoDB data without explicit approval and successful restore test.**

---

## Prerequisites

1. PostgreSQL 16 running (via `docker-compose.postgres.yml`)
2. `pg` and migration CLI available: `npm install pg`
3. Environment variable set: `POSTGRES_URL=postgresql://kazmion:pass@localhost:5432/kazmion`
4. MongoDB backup taken: `.\scripts\backup\mongo-backup.ps1`

---

## Phase CP-0 — Start PostgreSQL

```powershell
# Set password in .env first
# POSTGRES_PASSWORD=your_secure_password

# Start PostgreSQL container
docker compose -f docker-compose.postgres.yml up -d

# Verify it's healthy
docker compose -f docker-compose.postgres.yml ps
```

---

## Phase CP-1 — Apply Schema

```powershell
$env:POSTGRES_URL = "postgresql://kazmion:your_password@localhost:5432/kazmion"
node scripts/migrate/run-migrations.cjs
```

This applies `database/postgresql/migrations/001_initial_schema.sql` and records the migration in `schema_migrations`.

**Expected output:**
```
[✓] Connected to PostgreSQL
  [run ] 001_initial_schema.sql
  [done] 001_initial_schema.sql
[✓] All migrations applied
```

---

## Phase CP-2 — Dry-Run ETL (Safe — No Data Written)

Run all ETL scripts with `--dry-run` to validate counts and check for errors:

```powershell
$env:MONGO_URI    = "mongodb://localhost:27017/pos"
$env:POSTGRES_URL = "postgresql://kazmion:your_password@localhost:5432/kazmion"

# Phase 1: Reference data (tenants, users, products, customers)
node scripts/migrate/migrate-01-reference.cjs --dry-run

# Phase 2: Transactions (orders, installments)
node scripts/migrate/migrate-02-transactions.cjs --dry-run

# Phase 3: Supporting data (stock, audit, counters)
node scripts/migrate/migrate-03-supporting.cjs --dry-run
```

Each script outputs a summary:
```
✓ tenants:  12/12 migrated, 0 errors
✓ users:    47/47 migrated, 0 errors
✓ products: 834/834 migrated, 0 errors
```

> Fix any errors in the dry-run before proceeding to live migration.

---

## Phase CP-3 — Live ETL Migration

> [!WARNING]
> **Back up MongoDB before this step:** `.\scripts\backup\mongo-backup.ps1`

```powershell
# Remove --dry-run flag for live migration
node scripts/migrate/migrate-01-reference.cjs
node scripts/migrate/migrate-02-transactions.cjs
node scripts/migrate/migrate-03-supporting.cjs
```

All scripts are **idempotent** — safe to re-run if interrupted. Uses `ON CONFLICT DO UPDATE`.

---

## Phase CP-4 — Validation

```powershell
node scripts/migrate/validate-migration.cjs
```

Checks:
1. **Record counts** — MongoDB collection vs PostgreSQL table (all must match)
2. **Financial totals** — `SUM(grand_total)` orders must match within \$0.01
3. **Foreign key orphans** — no orphaned order_items, installment_sales, etc.
4. **Sample spot-check** — 10 random orders compared field-by-field

**Expected output:**
```
✓ tenants: MongoDB=12 → PG=12
✓ orders:  MongoDB=1247 → PG=1247
✓ Grand totals match: 2847350.00
✓ orders → tenants: no orphans
✓ All 10 sample orders match
VALIDATION SUMMARY: 12 passed, 0 failed, 0 warnings
```

> [!IMPORTANT]
> Do NOT proceed to cutover if validation fails.

---

## Migration Scripts Reference

| Script | Purpose | Safe to re-run |
|--------|---------|----------------|
| `run-migrations.cjs` | Apply SQL schema files | ✓ Idempotent |
| `migrate-01-reference.cjs` | Tenants, users, products, customers | ✓ ON CONFLICT DO UPDATE |
| `migrate-02-transactions.cjs` | Orders, installments | ✓ ON CONFLICT DO UPDATE |
| `migrate-03-supporting.cjs` | Stock, audit, counters | ✓ ON CONFLICT DO NOTHING |
| `validate-migration.cjs` | Reconciliation report | ✓ Read-only |

---

## Rollback Procedure

The MongoDB database is **never touched** by the ETL scripts. Rolling back is simply stopping use of PostgreSQL.

```powershell
# Stop PostgreSQL (doesn't delete data)
docker compose -f docker-compose.postgres.yml down

# Restore MongoDB from backup if needed
Expand-Archive ".\backups\mongo\<timestamp>.zip" -DestinationPath ".\restore-tmp"
mongorestore --uri="mongodb://localhost:27017/pos" --drop --gzip ".\restore-tmp\<timestamp>\pos\"
```

---

## MongoDB → PostgreSQL ObjectId Mapping

Each ETL script uses a deterministic UUID v5 derivation from the MongoDB ObjectId:

```javascript
// Same ObjectId always produces the same UUID
function mongoIdToUuid(oid) {
  // SHA-1 hash of (namespace_uuid + oid_string), formatted as UUID v5
  // Ensures cross-script references are consistent
}
```

This means:
- `orders.tenant_id` in PostgreSQL correctly references `tenants.id`
- Re-running migration produces identical UUIDs — no duplicates
- Original MongoDB IDs preserved in `mongo_id TEXT` column for audit

---

## Connection String Reference

| Environment | POSTGRES_URL |
|-------------|-------------|
| Local dev | `postgresql://kazmion:password@localhost:5432/kazmion` |
| Docker compose | `postgresql://kazmion:password@postgres:5432/kazmion` |
| Staging | `postgresql://kazmion:password@localhost:55432/kazmion` |
