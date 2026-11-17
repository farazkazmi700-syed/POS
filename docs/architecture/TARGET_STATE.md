# KazmiOn POS — Target State Architecture (STEP 2)

**Date:** 2026-11-17  
**Architect:** Principal Software Architect  
**Objective:** Refactor from MongoDB to PostgreSQL as primary operational database, preserving all existing modules, routes, permissions, UIs, and customer data.

## 1. Architecture Overview

KazmiOn POS is a **modular monolith** with clear domain boundaries. Layered design:

```
Presentation Layer: React SPA → Nginx reverse proxy → Developer Console
Application Layer: NestJS API (Auth, Tenant, Product, Order, Invoice, Customer, Installment, Report, Stock, Barcode, Branch, Audit, SuperAdmin, Developer, Support)
Domain Layer: Business rules, calculations, validation, RBAC, entitlements
Infrastructure Layer: PostgreSQL (primary) → Redis (queue/cache) → File storage
```

## 2. Tenancy Design

### 2.1 Database-per-Tenant Pattern

Each client installation owns an **independent PostgreSQL database** on the client's computer or authorized server.


## 3. Directory Structure (Target)

```
kazmion/
  apps/
    web/                    # React 19 + Vite frontend
    api/                    # NestJS 12 API (modular monolith)
    developer-console/      # Developer/super-admin console
  packages/
    ui/                     # Shared UI components
    api-contracts/          # Versioned OpenAPI/TypeScript contracts
    shared-types/           # Shared TypeScript interfaces
    config/                 # Configuration schema and validation
  services/                 # Logical service boundaries (within API monolith)
    identity/ tenants/ subscriptions/ entitlements/ sales/ inventory/ invoicing/
    installments/ reporting/ backups/
  infrastructure/
    docker/ postgres/ reverse-proxy/ deployment/ monitoring/
  scripts/

## 5. PostgreSQL Schema Design

### 5.1 Tenants and Users

```sql
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  domain_type TEXT NOT NULL,
  tax_reg_no TEXT,
  address TEXT,
  currency TEXT NOT NULL DEFAULT 'PKR',
  invoice_prefix TEXT NOT NULL DEFAULT 'INV',
  tax_profile JSONB NOT NULL DEFAULT '{}',
  feature_flags JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner','admin','cashier')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_super_admin BOOLEAN NOT NULL DEFAULT false,
  is_developer BOOLEAN NOT NULL DEFAULT false,

### 5.3 Installments and Supporting Tables

```sql
CREATE TABLE installment_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id),
  total_payable NUMERIC(12,2) NOT NULL,
  balance NUMERIC(12,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  schedule JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

## 7. Deployment Profiles

| Profile | Command | Database | Notes |
|---------|---------|----------|-------|
| Local Development | `npm run dev:api` + `npm run dev:web` | Local PostgreSQL | HMR on port 5173 |
| Docker Production-like | `docker compose up --build` | PostgreSQL volume | Port 8080 |
| Windows Client | Installer + shortcut | Local PostgreSQL | Offline-capable |
| Hosted Production | `docker compose -f prod.yml up -d` | Managed PostgreSQL | Behind TLS |

Port numbers may differ; functionality must not.

## 8. Migration Strategy (MongoDB → PostgreSQL)

Phase 1: Add PostgreSQL alongside MongoDB (dual-write).  
Phase 2: Migrate reference data (tenants, users, products, customers).  
Phase 3: Migrate transactional data (orders, installments, stock).  
Phase 4: Cutover — API reads from PostgreSQL only, MongoDB read-only.  
Phase 5: Decommission MongoDB after verification.

**Never delete MongoDB data automatically.** Backups required before each step.

## 9. Security Design

- Password hashing: Argon2id (upgrade from bcryptjs)
- JWT: Access (15m) + Refresh (7d), separate secrets
- RBAC: Server-side guards (owner, admin, cashier + module rights)
- RLS: PostgreSQL row-level security for tenant isolation
- Secrets: Environment variables only, never in code
- Audit logging: All privileged actions logged

## 10. Testing Strategy

- Unit: Jest (business rules, calculations) — 80%+ coverage
- Integration: Jest + Supertest (PostgreSQL, API) — all modules
- E2E: Playwright (all roles, critical workflows) — port 5173 + 8080
- Security: Auth, RBAC, injection, RLS tests
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_email TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  price NUMERIC(12,2) NOT NULL,
  features JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

## 6. Configuration Contract (Versioned)

Single source of truth in `packages/config/`. Required env vars validated at startup:
`DATABASE_URL`, `REDIS_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `CORS_ORIGIN`, `PASSWORD_RESET_BASE_URL`.

All monetary values use `NUMERIC(12,2)` (never FLOAT). All timestamps use `TIMESTAMPTZ` (UTC).
  module_rights TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_tenant_id ON users(tenant_id);
```

### 5.2 Products and Orders

```sql
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price NUMERIC(12,2) NOT NULL,
  stock_qty INTEGER NOT NULL DEFAULT 0,
  tax_class TEXT NOT NULL CHECK (tax_class IN ('standard','reduced','exempt')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  invoice_no TEXT NOT NULL,
  grand_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  invoice_status TEXT NOT NULL DEFAULT 'pending',
  idempotency_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_orders_idempotency ON orders(tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
```
    install/ migrate/ seed/ backup/ restore/
  tests/
    unit/ integration/ e2e/ security/ deployment/
  docs/
    architecture/ api/ database/ operations/
  .env.example README.md CHANGELOG.md
```

## 4. Technology Stack (Target)

| Layer | Technology | Version |
|-------|-----------|---------|
| API Runtime | Node.js | 24 LTS |
| API Framework | NestJS | 12 |
| Database | PostgreSQL | 16 (pinned) |
| Cache/Queue | Redis | 7 |
| Frontend | React | 19 |
| Frontend Build | Vite | 8 |
| Styling | Tailwind CSS | 4 |
| State | Zustand | 5 |
| API Client | TanStack Query | 5 |
| PDF Rendering | Puppeteer + Handlebars | — |
| Auth | JWT (access + refresh) | — |
| Password Hashing | Argon2id | — |
| Container | Docker | — |
| Reverse Proxy | Nginx | 1.27 |
| Testing | Jest + Playwright | — |
**Control Plane vs Data Plane:**
- **Control Plane** (Developer Console): Tenant provisioning, subscriptions, plans, module catalogs, entitlements. Central database. Optional for local POS.
- **Data Plane** (Client POS): Inventory, invoices, customers, payments, staff. Per-tenant database. Must work offline.

### 2.3 Multi-Business Isolation

**Decision: Separate databases per business** for maximum isolation and backup independence. Alternative: shared database with tenant_id partitioning + RLS.