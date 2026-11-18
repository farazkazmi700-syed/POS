# KazmiOn POS — Architecture Audit (Phase 1)

Date: 2026-11-18 · Branch: `feature/single-container-production` · Working tree inspected BEFORE modifications.

## 1. Repository map

```
d:\pos
├── KazmiOn-Start.ps1 / KazmiOn.iss      # Root launcher + Inno Setup script (points to compose.production.yaml — stale path)
└── pos-system/                          # Main monorepo (git repo, branch main)
    ├── apps/
    │   ├── api/          # NestJS 12 API (port 3000), JWT auth, Swagger at /api/docs
    │   ├── web/          # React 19 + Vite 8 SPA (dev:5173), Tailwind 4
    │   ├── pdf-worker/   # BullMQ worker, Puppeteer/Chromium PDF invoices
    │   ├── analytics-service/  # (check references — likely unused)
    │   └── chatbot-service/    # (check references — likely unused)
    ├── packages/ api-contracts, config, invoice-store, shared-types
    ├── infra/    nginx/{default,single-container}.conf, postgres/{init-pos.sh,start-app.sh}
    ├── scripts/  build.cjs, migrate/*, migration/*, backup/*, update-docker.ps1, verify-deployment.ps1, prepare-compose-env.ps1, seed.ts
    ├── database/postgresql/migrations/ 001_initial_schema.sql, 002_installments.sql, 003_rls_policies.sql, 0001-source-staging.sql
    ├── qa/       api-integration.cjs, delivery-phase-checks.cjs, recovery-provider-hook.cjs
    ├── docs/     30+ docs incl. migration dossier + ADR 0001–0003
    ├── Dockerfile.single, supervisord.pos-system.conf, single-container-entrypoint.sh
    ├── docker-compose.yml (single service "pos-system"), .single/.prod/.postgres*/.legacy-mongo variants
    ├── KazmiOn-Launch.bat, KazmiOn-Start.ps1, KazmiOn-Launcher/, backups/, storage/
```

## 2. Runtime architecture (as found)

Single-container design **already implemented and documented** (ADR 0003):

| Process | Supervisord program | User | Bind |
|---|---|---|---|
| PostgreSQL 17 (+DocumentDB extension) | `postgres` | root→postgres | 127.0.0.1:5432 |
| FerretDB gateway (Mongo wire→Postgres) | `gateway` | ferret | 127.0.0.1:27017 |
| Redis (AOF queue) | `redis` | redis | 127.0.0.1:6379 |
| NestJS API | `api` | node | :3000 |
| PDF worker | `pdf-worker` | node | — |
| nginx (web + /api + /health proxy) | `nginx` | root | :80 |

Startup: entrypoint generates per-install DB credentials into `PGDATA/secrets`, writes `.pgpass`, gateway URI, app URI; Postgres cluster persists on named volume `pos_system_postgres17_live`. Init script creates least-privilege role `pos_app`. Data never recreated when cluster exists (guarded by `PG_VERSION` check).

Health: container HEALTHCHECK → `curl /health` → nginx → `/api/health`.

## 3. Modules inventory (apps/api/src/modules)

audit, auth, barcode, branch, customer, developer, health, installment, invoice, order, product, report, stock, super-admin, support, tenant.
Web pages: Login, Register, Dashboard, POS, Products, Orders, Customers, Barcodes, Reports, Installments(+Detail, ModulePage), Recovery, Backup, Settings, Help, Spare, Support, SuperAdmin, Developer(+Setup).

RBAC: JWT access/refresh, roles developer/owner/employee enforced in API guards; tenant isolation per business/branch documented in docs/TENANT_ISOLATION.md.

## 4. Configuration & hardcoded settings

- `.env.example` is the single env source; secrets validated at boot (main.ts rejects `change-me`/`REPLACE_ME`).
- Ports: API PORT=3000 (env), nginx :80, compose maps 8080:80 — spec requires loopback-only mapping `127.0.0.1:8080:8080` → **needs change**.
- Volumes: `pos_system_postgres17_live`, `kazmion_redis_data`, `kazmion_invoice_data` — spec names `kazmion_pgdata/uploads/backups` → **needs alignment**.
- Postgres listens on loopback only ✔; not host-exposed ✔ (compose exposes only 8080 and 3000 — 3000 should be removed per spec).

## 5. Gaps vs. KazmiOn Single-Container Production spec

1. No top-level `compose.yaml`; container/image names differ (`pos-system`/`pos-system:postgres` vs `kazmion-pos`/`kazmion/pos:latest`).
2. Port map `8080:80` not loopback-restricted; API port 3000 host-exposed.
3. Missing `docker/entrypoint.sh`, `docker/supervisord.conf`, `docker/healthcheck.sh` layout (equivalents exist at repo root).
4. Missing Windows scripts `scripts/{install,start,stop,update,backup,restore}.ps1` (partial: KazmiOn-Start.ps1 at repo root references stale `compose.production.yaml`).
5. Obsolete compose variants (`legacy-mongo`, `postgres-invoices`, `postgres-staging`) and root `KazmiOn-Start.ps1` stale path — cleanup candidates.
6. `apps/analytics-service`, `apps/chatbot-service` — must verify references before classification (uncertain).
7. Database-per-business tenant strategy: current design is shared PostgreSQL via DocumentDB extension with application-level tenant scoping (ADR 0003 explicitly documents why per-business physical DBs were not adopted). Changing this would violate "preserve existing functionality"; keep current isolation, document deviation.

## 6. Test status at audit time

- `npm run test:api` (jest), `test:pdf`, `test:web:typecheck` available; qa/ scripts for integration checks; `scripts/verify-deployment.ps1` smoke test. Not yet executed on this branch — Phase 7 will run them and record actual results.
