# KazmiOn POS — Current State Audit (STEP 1)

**Date:** 2026-11-17  
**Auditor:** Principal Software Architect  
**Repository:** `d:\pos\pos-system`  
**Branch:** main (commit 75ceae2e)

## 1. Executive Summary

The KazmiOn POS is a multi-tenant, modular POS application built as a modular monolith.

**Stack:** NestJS 12 + Mongoose (MongoDB) + BullMQ (Redis) + Passport JWT (API); React 19 + Vite + Tailwind (Web); Node.js + Puppeteer + Handlebars (PDF Worker); TypeScript interfaces (`packages/shared-types`); PostgreSQL client (`packages/invoice-store`) for hybrid invoice state.

**Current data store:** MongoDB (primary), PostgreSQL (optional hybrid invoice state only)  
**Target data store:** PostgreSQL (primary, per project objective)

## 2. Port and Service Inventory

| Service | Port | Purpose | Technology |
|---------|------|---------|------------|
| Web (dev) | 5173 | Vite dev server with HMR | Vite + React |
| Web (Docker) | 8080 (host) → 80 (container) | Nginx serving React build, proxying `/api` | Nginx |
| API | 3000 | NestJS REST API + Swagger docs | NestJS |
| MongoDB | 27017 | Primary document database | MongoDB 7 |
| Redis | 6379 | BullMQ job queue + caching | Redis 7 |
| PostgreSQL (staging) | 55432 | Optional hybrid invoice state | PostgreSQL 18 |

**Problem:** `npm run dev:web` serves on 5173 with Vite proxying `/api` to `localhost:3000`. Docker serves on 8080 via Nginx. CORS defaults differ between environments.

## 3. Module Inventory (API)

All modules under `apps/api/src/modules/`:

| Module | Responsibility | Key Entities | Guards |
|--------|---------------|--------------|--------|
| `auth` | Registration, login, PIN, refresh, password recovery | User, Tenant | JwtAuthGuard, RolesGuard, Public |
| `tenant` | Tenant CRUD, tax profile, print settings, feature flags | Tenant | JwtAuthGuard, RolesGuard |
| `product` | Product catalog, stock, barcode lookup | Product | JwtAuthGuard, ModuleRightsGuard |
| `order` | POS checkout, orders, void, refund, sales summary | Order, InvoiceCounter, CheckoutRequest | JwtAuthGuard, RolesGuard, FeatureGuard |
| `invoice` | Invoice PDF generation queue, state | Order (invoice fields) | JwtAuthGuard |
| `customer` | Customer CRM | Customer | JwtAuthGuard, ModuleRightsGuard |
| `installment` | Installment plans, sales, payments, schedules | InstallmentPlan, InstallmentProduct, InstallmentSale | JwtAuthGuard, ModuleRightsGuard, FeatureGuard |
| `report` | Sales reports | Order (aggregation) | JwtAuthGuard, RolesGuard |
| `stock` | Stock adjustments, movements | StockAdjustment | JwtAuthGuard, ModuleRightsGuard |
| `barcode` | Barcode generation/lookup | — | JwtAuthGuard, ModuleRightsGuard |
| `branch` | Multi-branch support | Branch | BranchGuard |
| `audit` | Audit event logging | AuditEvent | JwtAuthGuard |
| `health` | Health check endpoint | — | Public |
| `super-admin` | Business CRUD, feature toggles, plans, audit | Tenant, SubscriptionPlan, PlatformModule, AdminAudit | SuperAdminGuard |
| `developer` | Developer console: businesses, accounts, backup, modules | Tenant, User, SubscriptionPlan | DeveloperGuard, AllowDeveloperScope |
| `support` | Help/backup entitlements | — | JwtAuthGuard |

## 4. Module Inventory (Web)

All pages under `apps/web/src/pages/`:

| Page | Route | Auth Required | Roles |
|------|-------|---------------|-------|
| Login | `/login` | No | — |
| Register | `/register` | No | — |
| Recovery | `/recover` | No | — |
| Home Redirect | `/` | Yes | All |
| POS | `/pos` | Yes | owner/admin/cashier |
| Orders | `/orders` | Yes | owner/admin/cashier |

## 5. Data Model (MongoDB → PostgreSQL Mapping)

### 5.1 Collections/Entities

| MongoDB Collection | PostgreSQL Table | Notes |
|-------------------|-----------------|-------|
| `users` | `users` | Authentication accounts, Argon2id hashes |
| `tenants` | `tenants` | Business tenants, feature flags, subscription |
| `products` | `products` | Product catalog, stock, tax class |
| `orders` | `orders` | POS orders, invoice numbers |
| `customers` | `customers` | CRM customers |
| `installmentplans` | `installment_plans` | Installment agreements |
| `installmentsales` | `installment_sales` | Installment sales records |
| `installmentproducts` | `installment_products` | Installment product catalog |
| `stockadjustments` | `stock_adjustments` | Inventory movements |
| `branches` | `branches` | Multi-branch locations |
| `platformmodules` | `platform_modules` | Developer module catalog |
| `subscriptionplans` | `subscription_plans` | Billing plans |
| `adminaudit` | `audit_events` | Administrative audit log |
| `checkoutrequests` | `checkout_requests` | Idempotency keys |
| `invoiceresets` | `invoice_counters` | Per-tenant yearly invoice numbering |

### 5.2 Key Relationships

- `users.tenant_id` → `tenants.id` (many-to-one)
- `products.tenant_id` → `tenants.id` (many-to-one)
- `orders.tenant_id` → `tenants.id` (many-to-one)

## 6. Configuration Inventory

### 6.1 Environment Variables

| Variable | Purpose | Required | Default |
|----------|---------|----------|---------|
| `PORT` | API listen port | No | 3000 |
| `MONGO_URI` | MongoDB connection string | Yes | — |
| `REDIS_URL` | Redis connection string | Yes | — |
| `JWT_ACCESS_SECRET` | Access token signing secret | Yes | — |
| `JWT_REFRESH_SECRET` | Refresh token signing secret | Yes | — |
| `JWT_ACCESS_TTL` | Access token TTL | No | 15m |
| `JWT_REFRESH_TTL` | Refresh token TTL | No | 7d |
| `CORS_ORIGIN` | Allowed CORS origins (comma-separated) | Yes | — |
| `PASSWORD_RESET_BASE_URL` | Password reset link base URL | Yes | — |
| `DEV_ACCOUNT_EMAIL` | Authorized developer email | No | — |
| `DEV_ACCOUNT_PASSWORD_HASH` | Developer bcrypt hash | No | — |
| `PLATFORM_DEVELOPER_EMAIL` | Platform developer email | No | — |
| `PLATFORM_DEVELOPER_SETUP_TOKEN` | Developer setup token | No | — |
| `SMTP_*` | Email delivery settings | No | — |
| `TWILIO_*` | WhatsApp delivery settings | No | — |
| `STORAGE_DIR` | Invoice PDF storage path | No | `./storage/record of business` |
| `REPORT_TZ` | Report timezone | No | Asia/Karachi |
| `WORKER_CONCURRENCY` | PDF worker concurrency | No | 2 |
| `BACKUP_*` | Backup delivery settings | No | — |
| `INVOICE_STORE` | Invoice store: `mongo` or `postgres` | No | `mongo` |
| `INVOICE_DATABASES_FILE` | Per-tenant PostgreSQL invoice DB registry | No | — |
| `THROTTLE_TTL` | Rate limit window | No | 60000ms |
| `THROTTLE_LIMIT` | Rate limit max requests | No | 2000 |
| `BULL_PREFIX` | BullMQ queue prefix | No | `bull` |

### 6.2 Configuration Problems Found (and fixed)

1. **Hardcoded `PLATFORM_DEVELOPER_SETUP_TOKEN`** in `.env` → Removed, now `REPLACE_ME`
2. **Empty `DEV_ACCOUNT_PASSWORD_HASH`** → Documented as required bcrypt hash
3. **Inconsistent CORS defaults** → Single source of truth via `CORS_ORIGIN` env var, validated at startup
4. **Hardcoded `http://localhost:8080/reset-password`** → Replaced with `PASSWORD_RESET_BASE_URL` env var
5. **Missing required env validation** → Added `validateRequiredEnv()` in `main.ts`

## 7. Security Findings

| Issue | Severity | Status |
|-------|----------|--------|
| Hardcoded developer setup token in `.env` | Critical | Fixed |
| Plaintext PostgreSQL credentials in `invoice-databases.json` | Critical | Fixed |
| No required env var validation at startup | High | Fixed |
| No health check on web container | Medium | Fixed |
| No restart policy on web/pdf-worker containers | Medium | Fixed |
| `bcryptjs` instead of Argon2id for password hashing | Medium | Pending |
| No CSRF protection | Medium | Pending |
| No secure cookie flags documented | Low | Pending |

## 8. Test Inventory

| Test File | Type | Target | Status |
|-----------|------|--------|--------|
| `qa/api-integration.cjs` | Integration | Real API + isolated MongoDB | Exists |
| `qa/barcodes.spec.cjs` | E2E (Playwright) | Barcode generator/scanner | Port 5173 only |
| `qa/design-smoke.spec.cjs` | E2E (Playwright) | UI smoke tests | Port 5173 only |
| `qa/sign-in.spec.cjs` | E2E (Playwright) | Sign-in flow | Port 5173 only |
| `qa/recovery.spec.cjs` | E2E (Playwright) | PIN/password recovery | Port 5173 only |
| `qa/developer-ui.spec.cjs` | E2E (Playwright) | Developer console | Port 5173 only |
| `qa/delivery-ui.spec.cjs` | E2E (Playwright) | Installment delivery UI | Port 5173 only |
| `qa/runtime-smoke.spec.cjs` | E2E (Playwright) | Deployed stack smoke | Port 8080 |
| `qa/invoice-snapshot.test.cjs` | Unit | Invoice service | — |
| `qa/print-sizes.cjs` | Unit | PDF print sizes | — |
| `qa/delivery-phase-checks.cjs` | Integration | Delivery phase validation | — |

**Gap:** No port 8080 E2E parity tests. Playwright config targets only 5173.

## 9. Docker Inventory

| File | Purpose | Issues |
|------|---------|--------|
| `docker-compose.yml` | Dev/single-server stack | No web healthcheck, no restart policies, insecure secret defaults |
| `docker-compose.prod.yml` | Production overlay | Good restart policies, mandatory secrets |
| `docker-compose.postgres-staging.yml` | Staging PostgreSQL | External network dependency |
| `docker-compose.postgres-invoices.yml` | Hybrid invoice overlay | Secret file mounting |
| `apps/api/Dockerfile` | API container image | Multi-stage build, non-root user |
| `apps/web/Dockerfile` | Web container image | Nginx serving static build |
| `apps/pdf-worker/Dockerfile` | PDF worker image | Chromium from Alpine |

## 10. Files Modified in Previous Session (Critical Fixes)

1. `.env` — Removed hardcoded token, added `PASSWORD_RESET_BASE_URL`
2. `.env.example` — All secrets replaced with `REPLACE_ME_*` markers
3. `apps/api/.env.example` — Same as above
4. `apps/web/.env.example` — Documented dev-only Vite proxy
5. `apps/api/src/main.ts` — Added `ConfigService`, `REQUIRED_ENV_VARS`, `validateRequiredEnv()`, CORS from env only
6. `apps/api/src/modules/auth/password-recovery.service.ts` — Removed hardcoded reset URL, requires env var
7. `docker-compose.yml` — Added `restart: unless-stopped`, web healthcheck, required secret syntax
8. `infra/nginx/default.conf` — Added `/health` proxy to API
9. `KazmiOn-Start.ps1` — Fixed compose file reference
10. `storage/postgresql-staging/invoice-databases.json` — Removed hardcoded credentials
6. **Hardcoded credentials in `invoice-databases.json`** → Replaced with placeholder
- `customers.tenant_id` → `tenants.id` (many-to-one)
- `installment_plans.tenant_id` → `tenants.id` (many-to-one)
- `installment_sales.tenant_id` → `tenants.id` (many-to-one)
- `audit_events.actor_id` → `users.id` (many-to-one)
| Customers | `/customers` | Yes | owner/admin/cashier |
| Products | `/products` | Yes | owner/admin |
| Dashboard | `/dashboard` | Yes | owner/admin |
| Reports | `/reports` | Yes | owner/admin |
| Settings | `/settings` | Yes | owner/admin |
| Spare | `/spare` | Yes | owner/admin |
| Barcode Generator | `/barcode-generator` | Yes | owner/admin/cashier |
| Barcode Scanner | `/barcode-scanner` | Yes | owner/admin/cashier |
| Installments | `/installments/*` | Yes | owner/admin/cashier |
| Help | `/help` | Yes | All |
| Backup | `/backup` | Yes | All |
| Developer | `/developer` | Yes | Developer |
| SuperAdmin | `/super-admin` | Yes | SuperAdmin |