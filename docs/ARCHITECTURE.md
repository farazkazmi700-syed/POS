# KazmiOn POS — Architecture Overview

> For the detailed current-state audit see [`docs/architecture/CURRENT_STATE_AUDIT.md`](./architecture/CURRENT_STATE_AUDIT.md).  
> For the target state see [`docs/architecture/TARGET_STATE.md`](./architecture/TARGET_STATE.md).

## Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| API Framework | NestJS | 12 |
| Primary Database | MongoDB | 7 |
| Queue / Jobs | Redis + BullMQ | 7 / 6 |
| ORM | Mongoose | 9 |
| Frontend | React + Vite | 19 / 8 |
| Styling | Tailwind CSS | 4 |
| PDF Generation | Puppeteer + Handlebars | 25 / 4 |
| Runtime | Node.js | 24 |
| Language | TypeScript | 6 |
| Container | Docker + Docker Compose | — |
| Web Server (prod) | Nginx | alpine |
| Auth | JWT (Passport) + Argon2id | — |

## Dev vs Docker — Why They Look Different

| Feature | Dev (`npm run dev:web`, port 5173) | Docker (port 8080) |
|---------|------|------|
| Web server | Vite dev server (hot reload) | Nginx (production build) |
| Source | `apps/web/src` live | Pre-built `dist/` in image |
| API | `localhost:3000` (Vite proxy `/api`) | Nginx upstream `api:3000` |
| Hot reload | ✓ | ✗ |
| Auth / DB | Identical | Identical |

**Root cause of discrepancy:** Docker image is stale — not rebuilt after source changes.  
**Fix:** `npm run docker:rebuild` after any code change before testing Docker.

## Runtime Architecture

```
┌────────────────────────────────────────────────────────┐
│                   Docker Compose Stack                  │
│                                                         │
│  ┌──────────┐    ┌──────────────┐   ┌───────────────┐  │
│  │  Nginx   │    │  NestJS API  │   │  PDF Worker   │  │
│  │  :8080   │◄──►│  :3000       │◄──►│  (BullMQ)    │  │
│  │  (SPA)   │    │  REST + WS   │   │  Puppeteer    │  │
│  └──────────┘    └──────┬───────┘   └───────────────┘  │
│                         │                               │
│               ┌─────────┴──────────┐                   │
│               ▼                    ▼                    │
│         ┌──────────┐         ┌──────────┐              │
│         │ MongoDB  │         │  Redis   │              │
│         │  :27017  │         │  :6379   │              │
│         └──────────┘         └──────────┘              │
│                                                         │
│  Ports exposed: 8080 (web), 3000 (api dev), 27017, 6379│
└────────────────────────────────────────────────────────┘
```

## Project Structure

```
pos-system/
  apps/
    api/           NestJS application (port 3000)
    web/           React SPA — Vite dev :5173 / Nginx prod :8080
    pdf-worker/    BullMQ worker — Puppeteer PDF generation

  packages/
    shared-types/  Shared TypeScript types + module manifests
    invoice-store/ PostgreSQL invoice state (optional hybrid layer)
    api-contracts/ API contract types
    config/        Shared config loader/schema

  database/
    postgresql/
      migrations/  SQL migration files (001_initial_schema.sql)

  scripts/
    migrate/       MongoDB → PostgreSQL ETL scripts
    backup/        PowerShell backup scripts

  docs/            Architecture, API, operations documentation

  docker-compose.yml              Full stack (prod)
  docker-compose.postgres.yml     PostgreSQL-only (migration)
```

## Module Architecture (NestJS)

Each module in `apps/api/src/modules/` follows the pattern:
- `*.module.ts` — NestJS module definition
- `*.controller.ts` — HTTP endpoints, guard decorators
- `*.service.ts` — Business logic, DB queries
- `*.schema.ts` — Mongoose schema
- `*.dto.ts` — Request/response DTOs (class-validator)
- `*.spec.ts` — Unit tests (Jest)

**Registered modules:**

| Module ID | Name |
|-----------|------|
| MOD-AUTH | Authentication |
| MOD-PRODUCTS | Products & Inventory |
| MOD-CUSTOMERS | Customer Management |
| MOD-ORDERS | POS / Orders |
| MOD-INVOICES | Invoice Generation |
| MOD-INSTALLMENTS | Installment Sales |
| MOD-REPORTS | Business Reports |
| MOD-SETTINGS | Settings |
| MOD-BACKUP | Backup Management |
| MOD-USERS | User Management |

## Guard Execution Order

Every protected request traverses guards in this exact order:

```
JwtAuthGuard
  → AppThrottlerGuard
    → DeveloperScopeGuard
      → TenantStatusGuard
        → BranchGuard
          → RolesGuard
            → ActionPermissionsGuard
              → ModuleRightsGuard
                → FeatureGuard
                  → Controller handler
```

## Related Documents

- [DOCKER_DEPLOYMENT.md](./DOCKER_DEPLOYMENT.md)
- [AUTHENTICATION_SECURITY.md](./AUTHENTICATION_SECURITY.md)
- [MODULE_MANAGEMENT.md](./MODULE_MANAGEMENT.md)
- [TENANT_ISOLATION.md](./TENANT_ISOLATION.md)
- [BACKUP_RESTORE.md](./BACKUP_RESTORE.md)
- [API_DOCUMENTATION.md](./API_DOCUMENTATION.md)
- [TEST_REPORT.md](./TEST_REPORT.md)
- [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md)
- [docs/migration/POSTGRESQL_MIGRATION_PLAN.md](./migration/POSTGRESQL_MIGRATION_PLAN.md)
