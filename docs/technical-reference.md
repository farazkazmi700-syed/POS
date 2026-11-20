# KazmiOn POS technical reference

This collection preserves implementation notes, migration history and earlier deployment instructions. For the current repository layout and default deployment, start with the [repository guide](../README.md).

TypeScript POS where any business (retail, restaurant, pharmacy, salon, ...) can register, add its own products, sell, and get a **tax-invoice PDF** (itemised lines, per-rate tax breakdown, service/other charges, discount, QR code).

| Part | Tech | Folder |
|---|---|---|
| API | NestJS 12, PostgreSQL 17 (FerretDB and Mongoose), JWT + roles, BullMQ | `apps/api` |
| PDF worker | BullMQ worker, Handlebars template, Puppeteer (Chromium) | `apps/pdf-worker` |
| Web app | React 19, Vite, Tailwind, React Query, Zustand | `apps/web` |
| Shared contract | plain TypeScript interfaces | `packages/shared-types` |
| Phase 2 (stubs) | FastAPI analytics + chatbot | `apps/analytics-service`, `apps/chatbot-service` |

See [Project structure and repository conventions](#ref-36) for directory ownership, generated files and verification commands.

The default Docker deployment runs the API, PDF worker, Redis, nginx and PostgreSQL in one container. All POS document data, including accounts and sign-in state, goes to PostgreSQL through a loopback FerretDB gateway. See [storage and migration instructions](#ref-07) before upgrading an existing installation.

## How a sale flows

```
React POS -> POST /api/orders -> API: calculate totals -> reserve stock atomically -> save order (INV-2026-000001)
                                      -> enqueue job in Redis -> responds immediately
pdf-worker: job -> render invoice.hbs (+QR) -> Chromium -> PDF file -> order.invoiceStatus = "ready"
React: polls GET /api/orders/:id/invoice until "ready" -> opens GET /api/orders/:id/invoice/pdf
```

## Quick start (Docker)

```bash
cp .env.example .env            # then change the JWT secrets
docker compose up --build
```

* App: http://localhost:8080  (register a business, then Settings -> Tax and service charges -> Save tax settings)
* API docs (Swagger): http://localhost:3000/api/docs
* Demo data (optional, with the stack running): `npm run seed`
  -> logins `npm run dev:api` / `restaurant@demo.test`, password `demo12345`

Production: `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build`
(databases not exposed, secrets mandatory, restart policies; add TLS in front of the POS container).

## Frontend development

Start the standard Docker deployment and run npm run dev:web for a Vite server on port 5173. Vite proxies API calls to the same PostgreSQL-backed POS on port 3000. The explicit docker-compose.legacy-mongo.yml file is available for retrieving pre-migration data.

## Tests

```bash
npm run test:api                # money-calculation unit tests (discount -> tax -> charges, rounding, breakdown)
npm run build                   # type-checks and builds api, worker and web
```

## Super Admin

The private control panel is served by the existing web app at `http://localhost:8080/super-admin` with Docker Compose. During local Vite development, use `http://localhost:5173/super-admin`; both use the existing API on port `3000`.

### Initialize the owner once

1. Start the stack with the updated code: `docker compose up -d --build`.
2. Ensure the intended owner already has an active Owner account. If this is a new installation, create the first business through the existing `/register` flow using the developer credentials configured in `.env`; choose a private owner password. The first Owner login uses the existing PIN flow and requires changing the initial `0000` PIN. Public/developer registration closes after Super Admin initialization; create later businesses in the control panel.
3. Promote that account from a shell with access to the running API container and MongoDB:

  ```bash
  docker compose exec -e SUPER_ADMIN_EMAIL=owner@example.com api npm run super-admin:init
  ```

  Replace the example value with the existing Owner account email. The command only promotes an active `owner`, creates a unique database index for the Super Admin marker, and refuses to run if one is already initialized. It does not create credentials or change the account password/PIN. It is safe to rerun only to receive the "already initialized" refusal; promotion is not exposed through the application API.

4. Sign out and back in through `http://localhost:8080/login` (or `http://localhost:5173/login` for Vite), using the Owner account's existing password and PIN. Open **Super Admin** in the navigation or go directly to the dashboard URL above.

For production, run the same command against the running production Compose stack after deploying the updated image. The MongoDB volume is unchanged; no data migration or destructive operation is required. The business ID displayed in the panel is its existing MongoDB tenant `_id`, so no duplicate identifier is introduced.

### Configure the Developer account

`PLATFORM_DEVELOPER_EMAIL` defaults to `developer@pos.local` for local, loopback-only use; set it to the developer's real email before exposing a production deployment. The launcher creates a random setup token in the ignored root `.env` when one is missing. To set or rotate it manually, generate a 64-character token locally in PowerShell; do not send it in chat or commit it:

```powershell
$token = node -p "require('crypto').randomBytes(32).toString('hex')"
$envFile = '.env'
$lines = Get-Content $envFile | Where-Object { $_ -notmatch '^PLATFORM_DEVELOPER_SETUP_TOKEN=' }
$lines += "PLATFORM_DEVELOPER_SETUP_TOKEN=$token"
Set-Content $envFile $lines -Encoding ascii
Remove-Variable token
```

Restart/recreate the API after setting the token, then open `/developer` (`http://localhost:8080/developer` in Docker or `http://localhost:5173/developer` with Vite). Choose **Set up password**, then enter the configured Developer email, setup token, and a password of at least 12 characters. The page creates a dedicated empty tenant when needed and stores only an Argon2id password hash; setting the password also removes any legacy Developer PIN hashes. After setup, rotate the token to a new random value and restart the API to invalidate the setup token used. Main-window sign-in at `/login` remains email/password-based for business users. Developer sign-in at `/developer` uses the configured email plus password. The Developer session is restricted to Developer APIs and cannot access ordinary POS/business routes.

The account receives the **Developer** workspace at `http://localhost:8080/developer` (Vite: `http://localhost:5173/developer`).

The Developer account can create businesses and create/edit/archive subscription plans or assign plans to businesses. Super Admin can activate/suspend businesses and override per-business features, but has no plan mutation or assignment API. Assigning a plan copies its feature entitlements to the business; editing a plan later does not silently change existing businesses. Suspension and feature changes retain business records, sales, payments, installments, receipts, and PDFs. Administrative mutations are recorded in MongoDB audit logs.

## Installment sales (electronics shops)

At the POS pick **Installment**, choose or add the customer (and guarantor), then enter down payment, months and markup %.
Installment price = cash price + markup% (default set in *Settings*); the monthly amount is rounded up to a whole rupee
and the last instalment absorbs the difference. Manage plans under **Installments**: collect payments, see overdue
amounts, print the agreement and payment receipts (browser print / Save as PDF).
To change the pricing rule edit `apps/api/src/modules/installment/calc/calculate-plan.ts`.
Installment sales cannot be voided in the app; handle returns manually.

## Roles

| Role | Can |
|---|---|
| owner | everything, incl. settings and staff |
| admin | products, orders, void, dashboard, settings, staff |
| cashier | POS checkout and order list (own receipts) |

## Design decisions worth knowing

* **Tenant isolation**: every document has `tenantId`; every service query filters on the tenantId from the JWT, never from the request body.
* **Taxes are data, not code**: rates live in each tenant's *Tax profile* (Settings). Products choose a *tax class* (standard / reduced / exempt). Defaults (18% / 5%) are only a starting point; set what your local law requires.
* **Money math** is done in integer minor units and rounded per line (`apps/api/src/modules/order/calc`). The cart screen calls `POST /orders/preview`, so the screen and the receipt can never disagree.
* **No oversell**: stock is decremented with a conditional atomic update (`stockQty >= qty`), with a compensating rollback if a later line fails. (Multi-document transactions would need a MongoDB replica set.)
* **Invoice numbers** are sequential per tenant per year (`INV-2026-000001`) via an atomic counter.
* **Async PDFs**: checkout never waits for Chromium. If the queue is down the sale still succeeds and the invoice can be regenerated.
* **Flexible catalogue**: `Product.attributes` is a free-form object (batch/expiry for pharmacy, spice level for restaurant, ...), editable in the product form.

## Before going live: checklist

- [ ] Replace the JWT secrets; use MongoDB authentication and a managed Redis/Mongo (e.g. Atlas).
- [ ] **Tax compliance**: the QR code currently encodes invoice facts (`qrPayload()` in `apps/pdf-worker/src/services/invoice-renderer.ts`). If your tax authority requires integration (e.g. FBR POS integration in Pakistan), replace it with the authority-issued invoice number/QR, and confirm tax rules (service charges are not taxed here; some jurisdictions tax them).
- [ ] Store PDFs in S3 / Cloudflare R2: only `apps/pdf-worker/src/services/storage.service.ts` and the API's `resolvePdfPath` change.
- [ ] Add HTTPS, backups, log shipping and monitoring (Sentry / Prometheus).
- [ ] Refresh tokens are stateless (7 days); add a revocation list if you need instant logout-everywhere.

## Phase 2 (AI)

`apps/analytics-service` (forecasting, anomaly detection, restock advice) and `apps/chatbot-service` (RAG over each tenant's own data) are stubs with `/health` endpoints. Install their Python packages with `apps/analytics-service/requirements.txt` inside a `venv`. Every query they run must filter by `tenantId`, like the API.

## Consolidated documentation index

- [ARCHITECTURE_AUDIT.md](#ref-01)
- [CHANGELOG.md](#ref-02)
- [CLEANUP_REPORT.md](#ref-03)
- [docs/account-recovery.md](#ref-04)
- [docs/adr/0001-postgresql-invoice-authority.md](#ref-05)
- [docs/adr/0002-postgresql-migration.md](#ref-06)
- [docs/adr/0003-single-container-postgresql.md](#ref-07)
- [docs/adr/0004-business-databases.md](#ref-08)
- [docs/API_DOCUMENTATION.md](#ref-09)
- [docs/ARCHITECTURE.md](#ref-10)
- [docs/architecture/CURRENT_STATE_AUDIT.md](#ref-11)
- [docs/architecture/TARGET_STATE.md](#ref-12)
- [docs/AUTHENTICATION_SECURITY.md](#ref-13)
- [docs/backup-and-production-validation.md](#ref-14)
- [docs/BACKUP_RESTORE.md](#ref-15)
- [docs/barcode-module.md](#ref-16)
- [docs/DATABASE_DESIGN.md](#ref-17)
- [docs/delivery-phases.md](#ref-18)
- [docs/DEPLOYMENT_GUIDE.md](#ref-19)
- [docs/design-system.md](#ref-20)
- [docs/DOCKER_DEPLOYMENT.md](#ref-21)
- [docs/erd.md](#ref-22)
- [docs/installment-pricing.md](#ref-23)
- [docs/migration/01-repository-audit.md](#ref-24)
- [docs/migration/02-mongodb-inventory.md](#ref-25)
- [docs/migration/03-dependency-map.md](#ref-26)
- [docs/migration/04-data-profile.md](#ref-27)
- [docs/migration/05-data-quality-report.md](#ref-28)
- [docs/migration/07-etl-guide.md](#ref-29)
- [docs/migration/08-reconciliation-report.md](#ref-30)
- [docs/migration/09-hybrid-invoices.md](#ref-31)
- [docs/migration/POSTGRESQL_MIGRATION_PLAN.md](#ref-32)
- [docs/module-registration.md](#ref-33)
- [docs/MODULE_MANAGEMENT.md](#ref-34)
- [docs/POSTGRESQL_MIGRATION.md](#ref-35)
- [docs/project-structure.md](#ref-36)
- [docs/README.md](#ref-37)
- [docs/RELEASE_CHECKLIST.md](#ref-38)
- [docs/ROLLBACK_GUIDE.md](#ref-39)
- [docs/specification-implementation.md](#ref-40)
- [docs/TENANT_ISOLATION.md](#ref-41)
- [docs/TEST_REPORT.md](#ref-42)
- [docs/WINDOWS_INSTALLER.md](#ref-43)
- [KazmiOn-Launcher/README.txt](#ref-44)

<a id="ref-01"></a>

## Reference: `ARCHITECTURE_AUDIT.md`

## KazmiOn POS — Architecture Audit (Phase 1)

Date: 2026-11-18 · Branch: `feature/single-container-production` · Working tree inspected BEFORE modifications.

### 1. Repository map

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

### 2. Runtime architecture (as found)

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

### 3. Modules inventory (apps/api/src/modules)

audit, auth, barcode, branch, customer, developer, health, installment, invoice, order, product, report, stock, super-admin, support, tenant.
Web pages: Login, Register, Dashboard, POS, Products, Orders, Customers, Barcodes, Reports, Installments(+Detail, ModulePage), Recovery, Backup, Settings, Help, Spare, Support, SuperAdmin, Developer.

RBAC: JWT access/refresh, roles developer/owner/employee enforced in API guards; tenant isolation per business/branch documented in docs/TENANT_ISOLATION.md.

### 4. Configuration & hardcoded settings

- `.env.example` is the single env source; secrets validated at boot (main.ts rejects `change-me`/`REPLACE_ME`).
- Ports: API PORT=3000 (env), nginx :80, compose maps 8080:80 — spec requires loopback-only mapping `127.0.0.1:8080:8080` → **needs change**.
- Volumes: `pos_system_postgres17_live`, `kazmion_redis_data`, `kazmion_invoice_data` — spec names `kazmion_pgdata/uploads/backups` → **needs alignment**.
- Postgres listens on loopback only ✔; not host-exposed ✔ (compose exposes only 8080 and 3000 — 3000 should be removed per spec).

### 5. Gaps vs. KazmiOn Single-Container Production spec

1. No top-level `compose.yaml`; container/image names differ (`pos-system`/`pos-system:postgres` vs `kazmion-pos`/`kazmion/pos:latest`).
2. Port map `8080:80` not loopback-restricted; API port 3000 host-exposed.
3. Missing `docker/entrypoint.sh`, `docker/supervisord.conf`, `docker/healthcheck.sh` layout (equivalents exist at repo root).
4. Missing Windows scripts `scripts/{install,start,stop,update,backup,restore}.ps1` (partial: KazmiOn-Start.ps1 at repo root references stale `compose.production.yaml`).
5. Obsolete compose variants (`legacy-mongo`, `postgres-invoices`, `postgres-staging`) and root `KazmiOn-Start.ps1` stale path — cleanup candidates.
6. `apps/analytics-service`, `apps/chatbot-service` — must verify references before classification (uncertain).
7. Database-per-business tenant strategy: current design is shared PostgreSQL via DocumentDB extension with application-level tenant scoping (ADR 0003 explicitly documents why per-business physical DBs were not adopted). Changing this would violate "preserve existing functionality"; keep current isolation, document deviation.

### 6. Test status at audit time

- `npm run test:api` (jest), `test:pdf`, `test:web:typecheck` available; qa/ scripts for integration checks; `scripts/verify-deployment.ps1` smoke test. Not yet executed on this branch — Phase 7 will run them and record actual results.

<a id="ref-02"></a>

## Reference: `CHANGELOG.md`

## Changelog

### 1.1.0
- Installment sales: customers with guarantor, down payment, markup %, monthly schedule
- Collect payments (partial / early), overdue tracking, receivables stats
- Printable installment agreement and payment receipts
- IMEI / serial number captured per sale line

### 1.0.0
- Multi-tenant auth (owner / admin / cashier), JWT access + refresh tokens
- Product catalogue with tax classes, stock tracking and free-form attributes
- POS checkout with discounts, per-rate tax, service/other charges, sequential invoice numbers
- Async PDF tax invoice (Handlebars + Chromium + QR) via BullMQ worker
- Dashboard (revenue, top products), order history with void/restore stock
- Docker Compose (dev + prod overlay), GitHub Actions CI

<a id="ref-03"></a>

## Reference: `CLEANUP_REPORT.md`

## KazmiOn POS — Cleanup Report (Phase 5)

Date: 2026-11-18 · Branch: `feature/single-container-production`
Rule applied: delete only proven-obsolete files; no volumes, databases, backups, uploads or Git history touched.

### Classification

#### Removed (proven obsolete)
| Item | Reason |
|---|---|
| `docker-compose.legacy-mongo.yml` | References the retired MongoDB container stack; superseded by the single-container PostgreSQL design (ADR 0003). |
| `docker-compose.postgres-staging.yml` | Staging overlay for the interim Postgres migration phase; migration complete (docs/migration/08-reconciliation-report.md). |
| `docker-compose.postgres-invoices.yml` | Interim invoice-store overlay; invoice store now built into the single image. |
| `KazmiOn-Launcher-Files.zip` | Duplicate packaging artifact of `KazmiOn-Launcher/` (zip of the same files). |
| `KazmiOn-startup.log`, `single-build.log` | Transient logs, regenerated on every run. |

#### Kept — active
- `docker-compose.yml` — original single-service compose; retained for continuity with `update-docker.ps1`/existing installs (name `pos-postgresql`). Candidate for later removal after all client installs migrate to `compose.yaml`.
- `docker-compose.prod.yml` — small port overlay used by existing deployments.
- `docker-compose.single.yml` — documented build path in ADR 0003 (include of docker-compose.yml).
- `KazmiOn-Launcher/`, `KazmiOn-Launch.bat`, `KazmiOn-Start.ps1` — Windows client launcher (start script now points at `compose.yaml`).
- `apps/analytics-service`, `apps/chatbot-service` — documented future-service stubs; referenced in README, module manifests (`ai-chatbot`, coming-soon), support module and QA tests. Removing them would break `qa/delivery-phase-checks.cjs` and the UI.
- `scripts/migration/*` — data migration tooling incl. `copy-single-container.cjs`, required for existing-install cutover (ADR 0003). Its `node_modules/` is a local, non-committed cache.
- `scripts/migrate/*`, `database/postgresql/migrations/*` — versioned migration history (protected).
- `venv/` (repo root) — Python venv for the documented stub services; kept.
- `backups/`, `storage/` — customer data (protected).

#### Uncertain — NOT deleted, needs owner approval
- `docker-compose.single.yml` vs `compose.yaml` duplication — consolidate after all installs use `compose.yaml`.
- `apps/api/.gitignore`, `apps/pdf-worker/.gitignore` deleted in working tree (uncommitted change from prior work); verify intent before committing.
- Root `venv/` size vs. shipping in image — not part of the Docker build either way.

### Actions taken
1. Removed the 5 files above (git rm) — see commit on this branch.
2. Root `KazmiOn-Start.ps1` stale path `compose.production.yaml` fixed → `pos-system\compose.yaml`.
3. No docker volume, container, image or database was removed. No `docker system prune` or `compose down -v` was executed.

### Regression testing after cleanup
Covered in Phase 7 (typecheck, API unit tests, image build, container smoke test). No protected item was in the removed set.

<a id="ref-04"></a>

## Reference: `docs/account-recovery.md`

## Account recovery

`/recover` supports OTP-based password changes/restoration and four-digit account PIN resets. Developer access uses the account password and password recovery; Developer PIN sign-in/reset is no longer available. Recovery is linked from sign-in, Settings, the account menu and Developer sign-in. Password recovery is available for active owner, admin, cashier, superadmin and developer users. Resetting a cashier PIN enables the PIN step for subsequent sign-ins.

### Destinations and delivery

- Email codes go to an account's verified recovery email when one exists, otherwise to its sign-in email. Enter the sign-in email to identify the account. No reset request can supply a different recipient.
- WhatsApp codes go only to a number previously verified by an authenticated user. Account security can enroll a new number by proving possession with an OTP. The UI requires consent and an international number such as `+923001234567`.
- Old `phoneVerified` flags without a verification timestamp are not trusted. The previous instant phone-verification behavior was removed.
- Email uses the existing `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, and optional `SMTP_FROM` settings.
- Optional WhatsApp uses Twilio's Messages API with `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM` (international number including `+`, without a `whatsapp:` prefix), and `TWILIO_WHATSAPP_CONTENT_SID`. Configure an approved WhatsApp authentication content template with OTP variable `1`. Credentials stay in the deployment environment. See [Twilio's authentication-template instructions](https://www.twilio.com/docs/whatsapp/tutorial/send-whatsapp-notification-messages-templates).
- `/api/auth/recovery/options` reports globally configured channels. Missing providers are unavailable in the UI and request APIs report an error. A successful provider acceptance does not guarantee inbox/handset delivery; asynchronous delivery-status callbacks are not implemented.

### Protection and limits

Codes expire after ten minutes, are bcrypt-hashed, and allow at most five validation attempts. One active challenge exists per user; a new request invalidates an earlier challenge. A persisted sixty-second request cooldown applies across purposes/channels, alongside HTTP request limits. Unknown or ineligible accounts receive the same generic response; no account-specific contact details are exposed.

Correct codes are consumed atomically so concurrent confirmations cannot reset credentials twice. Recovery is invalidated by account disablement, session-version changes, or a recovery-contact change. Password recovery and account PINs retain their existing policy; Developer password setup requires 12–128 characters. Successful reset increments normal/developer session versions and PIN version, revoking existing access/refresh tokens and PIN challenges. The old `/auth/pin/reset/request` and `/auth/pin/reset` endpoints delegate to this same recovery engine.

Phone enrollment requires a current authenticated account and binds the OTP to that account and destination. Verifying a number cannot be completed with another account's token. Saving an unchanged phone value preserves verification; changing it removes verification.

This deployment uses standalone MongoDB. Challenge consumption and user update are separate writes with version/contact checks. A failure between them requires a new OTP; it cannot reuse the consumed code. Transactional notification/outbox handling, distributed HTTP rate-limit storage, and delivery-status callbacks remain future work.

### Local deployment status — 12 November 2026

The API and web containers are updated and healthy. The deployed capability endpoint currently reports `email: false` and `whatsapp: false`: provider credentials are missing, so live OTP delivery is not enabled. Populate the SMTP settings and, if desired, Twilio WhatsApp settings in `.env`, then recreate the API container with `docker compose up -d --no-deps api`. Do not share credentials in chat or commit them to Git.

Verification completed: 45 API unit tests, 40 real API integration checks, 79 browser checks in the full run plus the additional staff WhatsApp-enrollment browser check. The delivery checks used local provider fixtures, not real recipients.

### Verification

The API harness uses a disposable `pos_spec_test_*` database, loopback SMTP sink, and a child-process-only Twilio HTTP interceptor. It never sends messages to real recipients. Provider fixtures require the disposable database and loopback sink; they are not loaded by the production app or Docker image. HTTP IP throttling is disabled only in that test process so persisted OTP cooldown and attempt limits can be exercised.

Checks cover all five roles, provider acceptance/failure, phone ownership verification, old unverified flags, expiry, resend invalidation, contact changes, five concurrent incorrect attempts, concurrent successful confirmation, revoked sessions, cashier PIN login, and legacy PIN routes. Browser checks cover mobile/desktop password confirmation, expired-code errors, resend delay, Developer password recovery, and unavailable channels. Real SMTP/WhatsApp delivery must be verified with the configured production providers.

<a id="ref-05"></a>

## Reference: `docs/adr/0001-postgresql-invoice-authority.md`

## ADR 0001: Move invoice state to PostgreSQL before other business domains

Status: implemented in code and local preparation; production activation pending.

The user prefers complete MongoDB replacement, but permits a hybrid installation
with PostgreSQL priority while full replacement is incomplete. Existing sales,
inventory and authentication use Mongoose and cannot safely change by replacing
only a connection string. Invoice status is a separable shared API/worker concern.

Use a dedicated PostgreSQL database per business for invoice state, accessed by a
shared package with explicit trusted routing. API authorization remains in the
existing tenant-scoped order queries. PostgreSQL is the sole authority for this
domain once configured; MongoDB remains authoritative for other business domains.
Do not introduce competing synchronous writes or automatic fallback on SQL errors.

Generation tokens protect regeneration against stale worker callbacks. Migration
initialization may insert missing invoice rows but cannot replace existing SQL
state. Existing PDFs retain their paths; new generation paths are independent.

Consequences: operations temporarily require both database systems; new businesses
require explicit SQL provisioning, and rollback must reconcile post-switch invoice
state. This is an incremental boundary, not completion of the normalized financial
database migration. See ../migration/09-hybrid-invoices.md for activation gates.

<a id="ref-06"></a>

## Reference: `docs/adr/0002-postgresql-migration.md`

## ADR 0002: Migrate Primary Data Store from MongoDB to PostgreSQL

**Status:** Proposed\
**Date:** 2026-11-17\
**Deciders:** Principal Software Architect, Senior Full-Stack Engineer, DevOps Lead, Cybersecurity Engineer, Senior SaaS Product Engineer

### Context

The KazmiOn POS currently uses MongoDB as its primary operational database via Mongoose. The project objective requires PostgreSQL as the target operational database to support:
- Per-client independent databases (tenancy design)
- Referential integrity and foreign key constraints
- ACID transactions for inventory and payments
- NUMERIC/DECIMAL for money (no floating point)
- Row-level security for tenant isolation
- Offline-capable local client databases

### Decision

Migrate the primary data store from MongoDB to PostgreSQL 16 (pinned version). The API will transition from Mongoose to a PostgreSQL client (Drizzle ORM or `pg`) with migration tooling. MongoDB remains available during a dual-write transition period and is never deleted automatically.

### Alternatives Considered

| Option | Pros | Cons |
|--------|------|------|
| **PostgreSQL (chosen)** | ACID, referential integrity, RLS, NUMERIC money, per-tenant databases | Requires schema design, migration ETL, team learning curve |
| MongoDB (status quo) | No migration needed, flexible schema | No referential integrity, no RLS, no per-tenant DB pattern, floating-point risk |
| Hybrid (Mongo + PostgreSQL) | Gradual migration, lower risk | Dual-write complexity, eventual consistency, two operational databases |
| DocumentDB / CosmosDB | MongoDB-compatible, managed | Vendor lock-in, cost, doesn't solve relational requirements |

### Consequences

#### Positive
- Strong data consistency for financial transactions
- Row-level security enforces tenant boundaries at the database level
- Per-client database independence for offline operation
- NUMERIC type eliminates floating-point money errors
- Standard SQL tooling for backups, reporting, analytics

#### Negative
- Migration effort and risk (ETL, validation, rollback)
- Schema rigidity vs MongoDB flexibility (mitigated with JSONB for dynamic attributes)
- Two databases during transition (operational complexity)
- Need to rewrite Mongoose-based repository code

#### Risks (Mitigation)
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Data loss during migration | Medium | Critical | Backups before every step, idempotent ETL, rollback plan |
| Schema mismatch causing app errors | High | High | Parallel run, feature flags, comprehensive tests |
| Performance regression | Medium | Medium | Connection pooling, indexes, query optimization |
| Team unfamiliarity with PostgreSQL | Medium | Medium | Documentation, training, ADRs |

### Related
- ADR 0001: PostgreSQL invoice authority (hybrid, already implemented in code)
- Docs: `docs/migration/09-hybrid-invoices.md`

<a id="ref-07"></a>

## Reference: `docs/adr/0003-single-container-postgresql.md`

## PostgreSQL storage for the single-container POS

The single-container image uses PostgreSQL 17 with the DocumentDB extension. FerretDB translates the existing API and PDF worker's document queries to PostgreSQL. Account provisioning, sign-in, products, orders, counters, and recovery records share that path. This preserves existing public ObjectIds and BSON types. The application continues to enforce business and branch access. Redis handles queues and nginx serves the web app.

This deployment stores business documents in extension-managed PostgreSQL tables. The earlier normalized SQL ETL and per-business invoice databases are separate deployment designs. Native SQL foreign keys and separate physical business databases would require additional application changes. Direct new SQL queries must use an explicitly tenant-scoped repository.

### Existing installations

Keep the current image, database, invoice files and Redis volume available until acceptance. Build the new image with `docker compose -f docker-compose.single.yml build`. Start a candidate with POS_SERVE=false and a separate PostgreSQL volume, Redis volume and invoice directory. This starts the database and gateway before the API can initialize default records. For a source created by the original single-container launcher, run the following against the two *distinct* container names.

```sh
node scripts/migration/copy-single-container.cjs <running-source> <postgres-candidate>
```

The copier reads the source database configured in its container and writes through the candidate's loopback gateway. It preserves ObjectIds and verifies typed field values and collection counts. An existing record must match. It never removes source or destination records. Repeat against a quiescent source for cutover. Stop application writes and drain invoice jobs before the final verification. Review additional historical databases separately before merging overlapping identities.

Persist the complete PostgreSQL data volume, including its generated service credentials, plus invoice files. Capture a consistent stopped-volume backup or a PostgreSQL physical base backup with matching extension versions. Test restoration in an isolated instance. A rollback after new writes requires reconciling those writes before switching clients back.

The database, gateway and Redis bind to loopback. Ports 80 and 3000 are the web and API entry points. POS users are application accounts, distinct from the internal PostgreSQL service role.

<a id="ref-08"></a>

## Reference: `docs/adr/0004-business-databases.md`

## Physical business databases, first deployment stage

Each business has a separate PostgreSQL database in the existing cluster. Invoice status, PDF references and generation tokens are authoritative in that database. Tenant metadata, credentials, sale line items, stock, installments and other operational records still use the shared DocumentDB store. Invoice PDF bytes use the existing tenant-specific file paths.

The supervised provisioner connects locally using the postgres operating-system identity. It polls committed tenant metadata, reserves the tenant ID in kazmion_control.business_databases, creates a dedicated login and database, applies the invoice schema and checks the stored business identity. Database creation is outside a SQL transaction. A persistent reservation allows startup to retry interrupted provisioning. The API waits for an atomically published route before returning from business creation. Failed account provisioning can leave a reserved database for operator review. The provisioner never drops a business database.

Tenant logins have CONNECT on their own database, read access to its identity and read/write invoice state. The host authentication file also restricts these logins to their matching database. The API and worker load routes from a postgres-owned directory. Only the provisioner has administrative access. The POS API remains responsible for authorizing users and selecting their tenant from the authenticated session.

### Operations

Run scripts/backup.ps1 for a management dump, invoice files and a separate invoice-state CSV per business. For a single export use scripts/business-backup.ps1 -BusinessId <id> -Directory <new-directory>. Use the same arguments with -Restore to import into a provisioned business with an empty invoice table. A failed import rolls back. For a coordinated recovery, pause writes and workers while taking the backups, preserve the management metadata and restore the matching PDF files. The business CSV covers invoice metadata only.

Retain the pre-upgrade management backup and previous image. After new invoices are issued, reconcile the per-business invoice status, generation and file paths before reverting to a shared-store image. Drain queued invoice jobs before changing invoice modes. Keep database volumes through rollback.

<a id="ref-09"></a>

## Reference: `docs/API_DOCUMENTATION.md`

## KazmiOn — API Documentation

### Interactive Docs (Swagger)

When running, full interactive API documentation is available at:

| Environment | Swagger URL |
|-------------|------------|
| Development (`npm run dev:api`) | http://localhost:3000/api/docs |
| Docker (port 3000 exposed for dev) | http://localhost:3000/api/docs |

The Swagger UI lets you explore every endpoint, view request/response schemas, and test calls directly from the browser with authentication.

### Base URL

| Environment | Base URL |
|-------------|---------|
| Development | `http://localhost:3000/api` |
| Docker (via Nginx proxy) | `http://localhost:8080/api` |
| Docker (direct to API) | `http://localhost:3000/api` |

### Authentication

All endpoints except public auth endpoints require a Bearer token:

```http
Authorization: Bearer <access_token>
```

Obtain tokens via `POST /api/auth/login`.

---

### Core Endpoints

#### Authentication

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/auth/login` | Public | Login with email + password |
| `POST` | `/auth/refresh` | Public | Refresh access token using refresh token |
| `POST` | `/auth/logout` | ✓ | Invalidate current refresh token |
| `POST` | `/auth/change-password` | ✓ | Change own password |
| `POST` | `/auth/forgot-password` | Public | Send password reset email |
| `POST` | `/auth/reset-password` | Public | Reset password via email token |

#### Products & Inventory

| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| `GET` | `/products` | All | List products (tenant-scoped, paginated) |
| `POST` | `/products` | owner, admin, manager | Create product |
| `GET` | `/products/:id` | All | Get product detail |
| `PUT` | `/products/:id` | owner, admin, manager | Update product |
| `DELETE` | `/products/:id` | owner, admin | Delete product |
| `POST` | `/products/:id/adjust-stock` | owner, admin, manager | Manual stock adjustment |
| `GET` | `/products/low-stock` | All | Products below reorder level |

#### Customers

| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| `GET` | `/customers` | All | List customers (tenant-scoped) |
| `POST` | `/customers` | All | Create customer |
| `GET` | `/customers/:id` | All | Customer detail |
| `PUT` | `/customers/:id` | All | Update customer |
| `GET` | `/customers/:id/orders` | All | Customer order history |
| `GET` | `/customers/:id/installments` | All | Customer installment sales |

#### Orders / POS

| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| `POST` | `/checkout` | All | Create sale / checkout |
| `GET` | `/orders` | All | List orders (paginated, filterable) |
| `GET` | `/orders/:id` | All | Order detail |
| `GET` | `/orders/:id/invoice` | All | Generate/retrieve invoice PDF URL |

#### Installments

| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| `GET` | `/installment-products` | All | List installment products |
| `POST` | `/installment-products` | owner, admin, manager | Create installment product |
| `GET` | `/installment-plans` | All | List installment plans |
| `POST` | `/installment-plans` | owner, admin | Create plan |
| `POST` | `/installment-sales` | All | Create installment sale |
| `GET` | `/installment-sales` | All | List installment sales |
| `GET` | `/installment-sales/:id` | All | Sale detail + schedule |
| `POST` | `/installment-sales/:id/pay` | All | Record installment payment |
| `GET` | `/installment-sales/:id/receipt` | All | Generate installment receipt PDF |

#### Reports

| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| `GET` | `/reports/sales` | owner, admin, manager | Sales summary (date range) |
| `GET` | `/reports/inventory` | owner, admin, manager | Inventory value report |
| `GET` | `/reports/customers` | owner, admin, manager | Customer analytics |
| `GET` | `/reports/installments` | owner, admin, manager | Installment summary |

#### Users & Settings

| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| `GET` | `/users` | owner, admin | List staff users |
| `POST` | `/users` | owner, admin | Create staff user |
| `PUT` | `/users/:id` | owner, admin | Update staff user |
| `DELETE` | `/users/:id` | owner | Delete staff user |
| `GET` | `/settings` | owner, admin | Business settings |
| `PUT` | `/settings` | owner | Update settings |

---

### HTTP Status Codes

| Code | Meaning |
|------|---------|
| `200` | Success |
| `201` | Created |
| `400` | Validation error — check request body against schema |
| `401` | Unauthorized — missing or expired JWT |
| `403` | Forbidden — insufficient role or module access |
| `404` | Resource not found |
| `409` | Conflict — duplicate record (e.g. duplicate SKU) |
| `429` | Rate limit exceeded (100 req / 60s per IP) |
| `500` | Internal server error — check API logs |

---

### Pagination

Paginated endpoints accept query params:

```
GET /products?page=1&limit=20&search=laptop&sortBy=createdAt&order=desc
```

Response envelope:
```json
{
  "data": [...],
  "total": 150,
  "page": 1,
  "limit": 20,
  "totalPages": 8
}
```

---

### OpenAPI Spec

The raw OpenAPI spec is available at:
- `GET http://localhost:3000/api-json` — JSON format
- `docs/api-spec.yaml` — manually maintained YAML spec

<a id="ref-10"></a>

## Reference: `docs/ARCHITECTURE.md`

## KazmiOn POS — Architecture Overview

> For the detailed current-state audit see [`docs/architecture/CURRENT_STATE_AUDIT.md`](#ref-11).\
> For the target state see [`docs/architecture/TARGET_STATE.md`](#ref-12).

### Technology Stack

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

### Dev vs Docker — Why They Look Different

| Feature | Dev (`npm run dev:web`, port 5173) | Docker (port 8080) |
|---------|------|------|
| Web server | Vite dev server (hot reload) | Nginx (production build) |
| Source | `apps/web/src` live | Pre-built `dist/` in image |
| API | `localhost:3000` (Vite proxy `/api`) | Nginx upstream `api:3000` |
| Hot reload | ✓ | ✗ |
| Auth / DB | Identical | Identical |

**Root cause of discrepancy:** Docker image is stale — not rebuilt after source changes.\
**Fix:** `npm run docker:rebuild` after any code change before testing Docker.

### Runtime Architecture

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

### Project Structure

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

### Module Architecture (NestJS)

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

### Guard Execution Order

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

### Related Documents

- [DOCKER_DEPLOYMENT.md](#ref-21)
- [AUTHENTICATION_SECURITY.md](#ref-13)
- [MODULE_MANAGEMENT.md](#ref-34)
- [TENANT_ISOLATION.md](#ref-41)
- [BACKUP_RESTORE.md](#ref-15)
- [API_DOCUMENTATION.md](#ref-09)
- [TEST_REPORT.md](#ref-42)
- [RELEASE_CHECKLIST.md](#ref-38)
- [docs/migration/POSTGRESQL_MIGRATION_PLAN.md](#ref-32)

<a id="ref-11"></a>

## Reference: `docs/architecture/CURRENT_STATE_AUDIT.md`

## KazmiOn POS — Current State Audit (STEP 1)

**Date:** 2026-11-17\
**Auditor:** Principal Software Architect\
**Repository:** `d:\pos\pos-system`\
**Branch:** main (commit 75ceae2e)

### 1. Executive Summary

The KazmiOn POS is a multi-tenant, modular POS application built as a modular monolith.

**Stack:** NestJS 12 + Mongoose (MongoDB) + BullMQ (Redis) + Passport JWT (API); React 19 + Vite + Tailwind (Web); Node.js + Puppeteer + Handlebars (PDF Worker); TypeScript interfaces (`packages/shared-types`); PostgreSQL client (`packages/invoice-store`) for hybrid invoice state.

**Current data store:** MongoDB (primary), PostgreSQL (optional hybrid invoice state only)\
**Target data store:** PostgreSQL (primary, per project objective)

### 2. Port and Service Inventory

| Service | Port | Purpose | Technology |
|---------|------|---------|------------|
| Web (dev) | 5173 | Vite dev server with HMR | Vite + React |
| Web (Docker) | 8080 (host) → 80 (container) | Nginx serving React build, proxying `/api` | Nginx |
| API | 3000 | NestJS REST API + Swagger docs | NestJS |
| MongoDB | 27017 | Primary document database | MongoDB 7 |
| Redis | 6379 | BullMQ job queue + caching | Redis 7 |
| PostgreSQL (staging) | 55432 | Optional hybrid invoice state | PostgreSQL 18 |

**Problem:** `npm run dev:web` serves on 5173 with Vite proxying `/api` to `localhost:3000`. Docker serves on 8080 via Nginx. CORS defaults differ between environments.

### 3. Module Inventory (API)

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

### 4. Module Inventory (Web)

All pages under `apps/web/src/pages/`:

| Page | Route | Auth Required | Roles |
|------|-------|---------------|-------|
| Login | `/login` | No | — |
| Register | `/register` | No | — |
| Recovery | `/recover` | No | — |
| Home Redirect | `/` | Yes | All |
| POS | `/pos` | Yes | owner/admin/cashier |
| Orders | `/orders` | Yes | owner/admin/cashier |

### 5. Data Model (MongoDB → PostgreSQL Mapping)

#### 5.1 Collections/Entities

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

#### 5.2 Key Relationships

- `users.tenant_id` → `tenants.id` (many-to-one)
- `products.tenant_id` → `tenants.id` (many-to-one)
- `orders.tenant_id` → `tenants.id` (many-to-one)

### 6. Configuration Inventory

#### 6.1 Environment Variables

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

#### 6.2 Configuration Problems Found (and fixed)

1. **Hardcoded `PLATFORM_DEVELOPER_SETUP_TOKEN`** in `.env` → Removed, now `REPLACE_ME`
2. **Empty `DEV_ACCOUNT_PASSWORD_HASH`** → Documented as required bcrypt hash
3. **Inconsistent CORS defaults** → Single source of truth via `CORS_ORIGIN` env var, validated at startup
4. **Hardcoded `http://localhost:8080/reset-password`** → Replaced with `PASSWORD_RESET_BASE_URL` env var
5. **Missing required env validation** → Added `validateRequiredEnv()` in `main.ts`

### 7. Security Findings

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

### 8. Test Inventory

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

### 9. Docker Inventory

| File | Purpose | Issues |
|------|---------|--------|
| `docker-compose.yml` | Dev/single-server stack | No web healthcheck, no restart policies, insecure secret defaults |
| `docker-compose.prod.yml` | Production overlay | Good restart policies, mandatory secrets |
| `docker-compose.postgres-staging.yml` | Staging PostgreSQL | External network dependency |
| `docker-compose.postgres-invoices.yml` | Hybrid invoice overlay | Secret file mounting |
| `apps/api/Dockerfile` | API container image | Multi-stage build, non-root user |
| `apps/web/Dockerfile` | Web container image | Nginx serving static build |
| `apps/pdf-worker/Dockerfile` | PDF worker image | Chromium from Alpine |

### 10. Files Modified in Previous Session (Critical Fixes)

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

<a id="ref-12"></a>

## Reference: `docs/architecture/TARGET_STATE.md`

## KazmiOn POS — Target State Architecture (STEP 2)

**Date:** 2026-11-17\
**Architect:** Principal Software Architect\
**Objective:** Refactor from MongoDB to PostgreSQL as primary operational database, preserving all existing modules, routes, permissions, UIs, and customer data.

### 1. Architecture Overview

KazmiOn POS is a **modular monolith** with clear domain boundaries. Layered design:

```
Presentation Layer: React SPA → Nginx reverse proxy → Developer Console
Application Layer: NestJS API (Auth, Tenant, Product, Order, Invoice, Customer, Installment, Report, Stock, Barcode, Branch, Audit, SuperAdmin, Developer, Support)
Domain Layer: Business rules, calculations, validation, RBAC, entitlements
Infrastructure Layer: PostgreSQL (primary) → Redis (queue/cache) → File storage
```

### 2. Tenancy Design

#### 2.1 Database-per-Tenant Pattern

Each client installation owns an **independent PostgreSQL database** on the client's computer or authorized server.


### 3. Directory Structure (Target)

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

#### 5.3 Installments and Supporting Tables

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

### 6. Configuration Contract (Versioned)

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

### 4. Technology Stack (Target)

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

#### 2.3 Multi-Business Isolation

**Decision: Separate databases per business** for maximum isolation and backup independence. Alternative: shared database with tenant_id partitioning + RLS.

<a id="ref-13"></a>

## Reference: `docs/AUTHENTICATION_SECURITY.md`

## KazmiOn — Authentication & Security

### Authentication Flow

```
Client                       API
  │                           │
  ├─ POST /auth/login ────────►│
  │   { email, password }     │  1. Load user by email
  │                           │  2. Verify password hash (Argon2id or bcrypt)
  │                           │  3. If bcrypt → upgrade to Argon2id silently
  │◄─ { access_token,         │  4. Issue JWT pair
  │     refresh_token } ──────┤
  │                           │
  ├─ GET /api/... ────────────►│
  │  Authorization: Bearer    │  5. JwtAuthGuard extracts user from JWT
  │  <access_token>           │  6. Guard stack runs (see below)
  │◄─ response ───────────────┤
  │                           │
  ├─ POST /auth/refresh ──────►│
  │   { refresh_token }       │  7. Validate refresh token
  │◄─ { access_token } ───────┤  8. Issue new access token
```

### Password Hashing

| Algorithm | Usage | Config |
|-----------|-------|--------|
| **Argon2id** | All new passwords and password changes | Default for all new users |
| **bcrypt** | Legacy (transparent upgrade on login) | Detected by hash prefix `$2b$` |

On login: if bcrypt hash detected → verify with bcrypt → re-hash to Argon2id → save new hash. User never notices.

### JWT Tokens

| Token | Default TTL | Env var |
|-------|------------|---------|
| Access token | 15 minutes | `JWT_ACCESS_TTL` |
| Refresh token | 7 days | `JWT_REFRESH_TTL` |

**Secrets:**
- `JWT_ACCESS_SECRET` — signs access tokens
- `JWT_REFRESH_SECRET` — signs refresh tokens (must be **different** from access secret)
- Minimum 32 characters, 64 recommended
- Never commit real values to source control

### Guard Stack (Execution Order)

| Guard | Purpose |
|-------|---------|
| `JwtAuthGuard` | Verify JWT, extract user identity |
| `AppThrottlerGuard` | Rate limiting (100 req/60s per IP) |
| `DeveloperScopeGuard` | Block non-developer access to developer endpoints |
| `TenantStatusGuard` | Verify tenant is `active` (not suspended/deleted) |
| `BranchGuard` | Scope to specific branch if applicable |
| `RolesGuard` | Check user role against endpoint's `@Roles()` decorator |
| `ActionPermissionsGuard` | Fine-grained action permissions (create/read/update/delete) |
| `ModuleRightsGuard` | Check tenant subscription includes the module |
| `FeatureGuard` | Feature flag gating |

### Role Hierarchy

| Role | Scope | Typical Capabilities |
|------|-------|---------------------|
| `developer` | Platform-wide | All tenants, all modules, developer console |
| `owner` | Own tenant | All business operations, all modules |
| `admin` | Own tenant | User management, settings, reports |
| `manager` | Own tenant | Product management, reports, no user management |
| `cashier` | Own tenant | POS sales only |

### Tenant Isolation in Auth

- `tenantId` is embedded in the JWT payload at login
- `TenantStatusGuard` validates the tenant is active on every request
- Services receive `tenantId` from the validated JWT — never from the request body
- Cross-tenant access is architecturally impossible through normal API paths

### Sensitive Environment Variables

> [!CAUTION]
> Never commit these to source control. Always use `.env` (gitignored) or Docker environment injection.

```
JWT_ACCESS_SECRET
JWT_REFRESH_SECRET
PLATFORM_DEVELOPER_SETUP_TOKEN
DEV_ACCOUNT_PASSWORD_HASH
SMTP_PASSWORD
BACKUP_DRIVE_CLIENT_SECRET
BACKUP_DRIVE_REFRESH_TOKEN
TWILIO_AUTH_TOKEN
POSTGRES_PASSWORD
```

### Security Headers (Nginx Production)

The production Nginx config includes:
```nginx
add_header X-Frame-Options DENY;
add_header X-Content-Type-Options nosniff;
add_header X-XSS-Protection "1; mode=block";
```

### Developer Setup Token

The `PLATFORM_DEVELOPER_SETUP_TOKEN` is a one-time token used to provision the developer account via the setup endpoint. After setup is complete:
- Change or invalidate the token
- The endpoint should return 410 Gone if already used

<a id="ref-14"></a>

## Reference: `docs/backup-and-production-validation.md`

## Backup and production validation

The developer Backup tab produces a ZIP with JSON records, README and a SHA-256 manifest. Download fetches fresh data rather than reusing the preview. It includes tenants, sanitized accounts, subscription plans, modules, full platform audit records, branches, products, customers, orders, invoice counters, installment plans/products/sales, stock adjustments and business audit events. Access remains developer-only; responses disable HTTP caching.

Offline mode (default BACKUP_MODE=offline) enables local ZIP download. The local API must remain running; a disconnected cloud client cannot access server records. Cloud mode (BACKUP_MODE=cloud) also enables user-triggered email and Drive delivery after configuration. No scheduled delivery is implemented.

Email uses SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASSWORD, optional SMTP_FROM and BACKUP_EMAIL_TO. Gmail requires suitable SMTP credentials, such as an app password; other SMTP providers also work. TLS is required. Drive uses BACKUP_DRIVE_CLIENT_ID, BACKUP_DRIVE_CLIENT_SECRET, BACKUP_DRIVE_REFRESH_TOKEN and BACKUP_DRIVE_FOLDER_ID. Provision OAuth consent with permission to create files in that folder and keep secrets only in server environment/secret storage. Pass these environment variables into the API container when using Docker. Direct delivery limits are 15 MiB for email and 5 MiB for Drive; larger archives use manual ZIP upload. Provider failures are not retried automatically because acceptance may be ambiguous. Email success means accepted by SMTP, not confirmed inbox delivery. Each API process permits one delivery at a time; multi-replica scheduling/deduplication requires a durable job queue.

Drive multipart protocol: https://developers.google.com/workspace/drive/api/guides/manage-uploads

### Recovery limits

This is a logical export, not a consistent point-in-time snapshot. Credentials, authentication challenges, sessions, Redis jobs and external files are excluded. No automated restore is implemented. Retain native MongoDB backups and file-storage backups, test restores into an isolated environment and arrange account recovery before migration. Export currently materializes records in API/browser memory; high-volume installations need a streaming background export with encrypted storage before relying on this workflow at scale.

### Verification

Run API Jest tests, the root build, PDF renderer tests, qa/api-integration.cjs (isolated MongoDB/Redis), and the Playwright suite. Browser checks independently decode CODE128, CODE39, EAN13, EAN8, UPC-A, QR, Data Matrix, PDF417 and Aztec fixtures. They exercise camera stream cleanup, denied camera permission, keyboard scan entry, POS additions and ZIP integrity. This does not certify every barcode symbology or physical camera/USB scanner. Codes must be registered product identifiers, currently 1-80 printable ASCII characters. Confirm the deployment's actual scanner hardware and HTTPS camera behavior before release.

<a id="ref-15"></a>

## Reference: `docs/BACKUP_RESTORE.md`

## KazmiOn — Backup & Restore

### Tenant Business Export (Application UI)

The **Backup** page is available only to the business Owner. It creates a tenant-scoped logical JSON export and records the download in the audit log. It deliberately excludes credentials, active sessions, external files, and Redis jobs.

This file supports an operator-reviewed recovery workflow; it is not an automatic restore image and does not replace the database backups below. Keep the original file and its SHA-256 checksum together in encrypted storage.

### MongoDB Backup (Primary Database)

All business data lives in MongoDB. Back this up regularly.

#### Manual Backup

```powershell
# Default settings — saves to .\backups\mongo\, retains last 7
.\scripts\backup\mongo-backup.ps1

# Custom location, keep 14 days
.\scripts\backup\mongo-backup.ps1 -BackupRoot "D:\KazmiOn-Backups" -KeepLast 14

# Custom MongoDB URI
.\scripts\backup\mongo-backup.ps1 -MongoUri "mongodb://localhost:27017/pos"
```

**Output:** Timestamped `.zip` file, e.g. `.\backups\mongo\20261117_143000.zip`\
**Requires:** `mongodump` on PATH (included with [MongoDB Database Tools](https://www.mongodb.com/try/download/database-tools))

#### MongoDB Restore

```powershell
# 1. Extract the backup
Expand-Archive ".\backups\mongo\20261117_143000.zip" -DestinationPath ".\restore-tmp"

# 2. Restore (--drop replaces existing data)
mongorestore `
  --uri="mongodb://localhost:27017/pos" `
  --drop `
  --gzip `
  ".\restore-tmp\20261117_143000\pos\"
```

> [!WARNING]
> `--drop` deletes the existing database before restoring. Only use on a clean/test instance unless performing a rollback.

---

### PostgreSQL Backup (Optional — Migration Layer)

Only needed if using the PostgreSQL hybrid invoice store.

#### Manual Backup

```powershell
# Default settings — saves to .\backups\postgres\
$env:POSTGRES_URL = "postgresql://kazmion:password@localhost:5432/kazmion"
.\scripts\backup\pg-backup.ps1

# Custom
.\scripts\backup\pg-backup.ps1 -BackupRoot "D:\KazmiOn-Backups\pg" -KeepLast 14
```

**Output:** `.dump` file in PostgreSQL custom format\
**Requires:** `pg_dump` on PATH (from [PostgreSQL client tools](https://www.postgresql.org/download/windows/))

#### PostgreSQL Restore

```powershell
pg_restore `
  -d "postgresql://kazmion:password@localhost:5432/kazmion" `
  -Fc `
  ".\backups\postgres\kazmion_20261117.dump"
```

---

### Automated Backup (Windows Task Scheduler)

```powershell
# Register daily MongoDB backup at 2:00 AM
$trigger = New-ScheduledTaskTrigger -Daily -At "02:00"
$action  = New-ScheduledTaskAction `
  -Execute "pwsh.exe" `
  -Argument "-NonInteractive -File D:\kazmion\scripts\backup\mongo-backup.ps1"
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Hours 1)

Register-ScheduledTask `
  -TaskName "KazmiOn-MongoBackup" `
  -Trigger  $trigger `
  -Action   $action `
  -Settings $settings `
  -RunLevel Highest
```

---

### Backup Checklist (Before Any Major Change)

- [ ] Run `.\scripts\backup\mongo-backup.ps1`
- [ ] Confirm backup `.zip` file exists and size > 1 KB
- [ ] Record the backup path in your change log
- [ ] Optionally: test restore to a separate test database

---

### Docker Volume Backup (Alternative)

If `mongodump` is not available, backup the Docker volume directly:

```powershell
# Stop the stack first (consistent backup)
docker compose stop

# Copy mongo_data volume to a tar archive
docker run --rm `
  -v pos-system_mongo_data:/data `
  -v ${PWD}/backups:/backup `
  alpine tar czf /backup/mongo_volume_$(Get-Date -Format yyyyMMdd_HHmmss).tar.gz -C /data .

# Restart
docker compose start
```

---

### Retention Policy

Default: last **7** backups retained. Older backups are automatically deleted by the script.\
Adjust with `-KeepLast` parameter.

Recommended minimum retention: **30 days** for production.

<a id="ref-16"></a>

## Reference: `docs/barcode-module.md`

## Barcode generator and scanner

### API

All endpoints require an authenticated, active tenant and the `barcodes` feature. Operational product queries inherit the selected branch context and never search another tenant or branch.

| Endpoint | Purpose | Module access |
| --- | --- | --- |
| `POST /api/barcodes/generate` | Validate and render CODE128, CODE39, EAN13, EAN8 or UPC-A as SVG | Barcode generator |
| `GET /api/barcodes/products?q=...` | Search active products for label selection | Barcode generator |
| `GET /api/barcodes/lookup?value=...` | Find an active product by exact barcode, then exact SKU | Barcode scanner or POS |

All three endpoints require `catalog.read` action access. Generation accepts exactly one of `value` or `productId`, plus `format`, optional integer `scale` (1–6), `height` (10–60 mm) and `displayValue`. Retail inputs without check digits are completed; incorrect supplied check digits are rejected. A product label cannot silently change the stored identifier. Generation does not assign or alter product barcodes; edit them in Products.

The generator uses `bwip-js` rather than handwritten encoding tables. SVGs have explicit native pixel dimensions so PNG export preserves barcode resolution. The browser downloads PNG/SVG files and builds print sheets using DOM nodes without inserting product text as HTML. Print windows wait for labels to load; blocked pop-ups show an error.

### Scanner behavior

USB readers that emit keyboard input and Enter use the labeled barcode/SKU field or the POS search field. Camera decoding uses a lazily loaded ZXing multi-format decoder, so native `BarcodeDetector` support is unnecessary. HTTPS or localhost and camera permission are required. Permission errors, missing devices and unavailable products have visible messages.

Camera tracks stop after a match, when canceled, when the page is hidden and when the module unmounts. A stream arriving after cancellation is also stopped. Lookup requests are canceled when superseded. Product details include price and stock, with Add to sale available only to users with POS access; local cart quantities cannot exceed tracked stock. Checkout still validates stock on the server.

History is limited to the last ten matched codes in memory. Switching branch clears the module state. No camera images are uploaded or stored. Weighted GS1 labels, lot/serial extraction, physical printer/scanner certification and offline lookup are outside this change.

### Billing scans

The scanner's optional “Add matched products directly to billing” mode adds each successful match to the shared sale cart. The input regains focus and selects the last code for the next USB scan. “Continue to billing” opens the same cart in POS. POS also has a dedicated barcode/SKU input that queries the full active branch catalog, independently of the products currently displayed or the catalog page limit. Both paths check the quantity already in the cart against tracked stock.

Camera scanning supports 1D barcodes and QR codes containing a saved product barcode or SKU. Lookup accepts the equivalent UPC-A/EAN-13 representation only when the retail checksum is valid, and always prefers exact identifiers. Products must have their code saved in the catalog; arbitrary or unregistered product codes cannot be priced automatically.

### Verification

```powershell
npm run build
npm --prefix apps/api test -- --runInBand
node qa/api-integration.cjs
npm exec --yes --package=@playwright/test -- playwright test --config=qa/barcodes.config.cjs
```

The browser tests exercise the actual compiled API encoder and independently decode SVGs for all five formats and downloaded PNGs. They also check invalid check digits, printing, responsive desktop/mobile layouts, USB-style input, unknown codes, adding to a sale, denied camera permission, canceling a pending camera request and a deterministic camera-video match. API integration tests use a disposable database and cover tenant/branch isolation, separate module rights, feature entitlements and exact matching. Physical devices still need a manual acceptance check.

<a id="ref-17"></a>

## Reference: `docs/DATABASE_DESIGN.md`

## KazmiOn — Database Design

### Overview

KazmiOn uses **MongoDB 7** as its primary operational database with a planned optional **PostgreSQL 16** layer for invoicing and analytics. This document covers both the current MongoDB schema and the target PostgreSQL schema.

---

### MongoDB Collections (Current Primary)

#### Entity Relationship Overview

```mermaid
erDiagram
    tenants ||--o{ users : "has staff"
    tenants ||--o{ products : "owns"
    tenants ||--o{ customers : "manages"
    tenants ||--o{ orders : "processes"
    tenants ||--o{ installmentProducts : "sells via"
    tenants ||--o{ installmentSales : "records"
    orders ||--|{ orderItems : "contains"
    customers ||--o{ orders : "places"
    customers ||--o{ installmentSales : "repays"
    installmentProducts ||--o{ installmentSales : "defines"
    installmentSales ||--|{ scheduleEntries : "has schedule"
    installmentSales ||--o{ payments : "receives"
```

#### Collection: `tenants`

The root entity — every piece of business data belongs to a tenant.

| Field | Type | Description |
|-------|------|-------------|
| `_id` | ObjectId | Primary key |
| `name` | String | Business name |
| `domainType` | Enum | retail, restaurant, pharmacy, etc. |
| `currency` | String | Currency code (PKR, USD…) |
| `invoicePrefix` | String | e.g. "INV" for INV-2026-0001 |
| `taxProfile` | Object | GST%, reduced%, charges[] |
| `featureFlags` | Object | pos, inventory, reports, customers, installments, barcodes |
| `status` | Enum | active \| suspended |
| `logoUrl` | String? | Business logo URL |
| `address` | String? | Business address |
| `taxRegNo` | String? | Tax registration number |
| `installmentMarkupPercent` | Number | Markup applied to installment prices |
| `invoicePrintSettings` | Object | Paper size, orientation, widthMm, heightMm |
| `subscriptionPlanId` | ObjectId? | Linked subscription plan |
| `navigationVisibility` | Object | Per-module nav visibility overrides |

#### Collection: `users`

Staff accounts. Each user belongs to exactly one tenant.

| Field | Type | Description |
|-------|------|-------------|
| `_id` | ObjectId | Primary key |
| `tenantId` | ObjectId | FK → tenants |
| `name` | String | Full name |
| `email` | String | Unique login email |
| `passwordHash` | String | Argon2id (or bcrypt legacy) |
| `role` | Enum | owner \| admin \| cashier |
| `isActive` | Boolean | Account enabled |
| `moduleRights` | String[] | Module access overrides |
| `permissions` | String[] | Fine-grained action permissions |
| `branchIds` | ObjectId[] | Allowed branches |

**Indexes:**
```javascript
{ email: 1 }              // unique
{ tenantId: 1, role: 1 }
```

#### Collection: `products`

Product catalog — inventory items available for sale.

| Field | Type | Description |
|-------|------|-------------|
| `_id` | ObjectId | Primary key |
| `tenantId` | ObjectId | FK → tenants |
| `name` | String | Product name |
| `sku` | String? | Stock keeping unit |
| `barcode` | String? | Barcode (EAN/UPC) |
| `category` | String? | Product category |
| `unit` | String? | Piece, kg, litre, etc. |
| `price` | Number | Selling price (NUMERIC equivalent) |
| `costPrice` | Number? | Purchase cost |
| `stockQty` | Number | Current stock count |
| `lowStockThreshold` | Number? | Alert threshold |
| `trackStock` | Boolean | Enable stock tracking |
| `taxClass` | Enum | standard \| reduced \| exempt |
| `attributes` | Object | Flexible key-value metadata |
| `isActive` | Boolean | Available for sale |

**Indexes:**
```javascript
{ tenantId: 1, sku: 1 }         // unique per tenant
{ tenantId: 1, barcode: 1 }
{ tenantId: 1, createdAt: -1 }
```

#### Collection: `customers`

Customer profiles linked to orders and installment plans.

| Field | Type | Description |
|-------|------|-------------|
| `_id` | ObjectId | Primary key |
| `tenantId` | ObjectId | FK → tenants |
| `name` | String | Customer full name |
| `phone` | String | Primary contact number |
| `cnic` | String? | National ID (Pakistan) |
| `address` | String? | Home/office address |
| `guarantor` | Object? | {name, phone, cnic, address} |
| `notes` | String? | Internal notes |

**Indexes:**
```javascript
{ tenantId: 1, phone: 1 }
{ tenantId: 1, cnic: 1 }
```

#### Collection: `orders`

POS sales transactions. The core financial record.

| Field | Type | Description |
|-------|------|-------------|
| `_id` | ObjectId | Primary key |
| `tenantId` | ObjectId | FK → tenants |
| `invoiceNo` | String | Formatted invoice number |
| `paymentMode` | Enum | cash \| card \| wallet \| installment \| mixed |
| `status` | Enum | completed \| voided \| refunded |
| `cashierId` | ObjectId | FK → users |
| `cashierName` | String | Denormalized for display |
| `customerId` | ObjectId? | FK → customers (optional) |
| `subtotal` | Number | Pre-discount total |
| `discountTotal` | Number | Total discounts applied |
| `taxableTotal` | Number | Taxable amount |
| `taxTotal` | Number | Total tax amount |
| `grandTotal` | Number | Final amount due |
| `idempotencyKey` | String | Duplicate prevention key |
| `items` | Array | Embedded `orderItems` |
| `invoiceStatus` | Enum | pending \| ready \| failed |
| `invoicePdfPath` | String? | Generated PDF path |

**Embedded: `orderItems`**

| Field | Type | Description |
|-------|------|-------------|
| `productId` | ObjectId | FK → products |
| `name` | String | Denormalized product name |
| `qty` | Number | Quantity sold |
| `unitPrice` | Number | Price at time of sale |
| `discountPercent` | Number | Line discount % |
| `taxPercent` | Number | Applied tax rate |
| `lineTotal` | Number | qty × (unitPrice − discount) + tax |

**Indexes:**
```javascript
{ tenantId: 1, createdAt: -1 }
{ tenantId: 1, invoiceNo: 1 }   // unique per tenant
{ idempotencyKey: 1 }            // unique
```

#### Collection: `installmentSales`

Installment purchase agreements — the most complex financial entity.

| Field | Type | Description |
|-------|------|-------------|
| `_id` | ObjectId | Primary key |
| `tenantId` | ObjectId | FK → tenants |
| `agreementId` | String | Human-readable agreement ID |
| `customerId` | ObjectId | FK → customers |
| `installmentProductId` | ObjectId | FK → installmentProducts |
| `saleDate` | Date | Date of agreement |
| `actualPrice` | Number | Product cost price |
| `advancePayment` | Number | Down payment amount |
| `commissionRate` | Number | Markup/commission % |
| `commissionAmount` | Number | Calculated commission |
| `totalInstallmentPrice` | Number | Total to pay (cost + commission) |
| `installmentDuration` | Number | Number of installments |
| `paymentFrequency` | Enum | monthly \| weekly \| biweekly |
| `outstandingBalance` | Number | Remaining amount |
| `totalPaid` | Number | Cumulative paid |
| `saleStatus` | Enum | pending \| active \| completed \| overdue \| cancelled |
| `schedule` | Array | Generated payment schedule |
| `payments` | Array | Recorded payment history |

**schedule[] entries:**

| Field | Type |
|-------|------|
| `installmentId` | String |
| `dueDate` | Date |
| `expectedAmount` | Number |
| `amountPaid` | Number |
| `remainingAmount` | Number |
| `status` | String |

**payments[] entries:**

| Field | Type |
|-------|------|
| `paymentId` | String |
| `amount` | Number |
| `mode` | Enum |
| `paidAt` | Date |
| `receiptNo` | String |
| `note` | String? |

---

### PostgreSQL Schema (Target / Optional Hybrid)

> See migration file: [`database/postgresql/migrations/001_initial_schema.sql`](../database/postgresql/migrations/001_initial_schema.sql)

#### Entity Relationship Diagram (PostgreSQL)

```mermaid
erDiagram
    tenants ||--o{ users : "tenant_id"
    tenants ||--o{ products : "tenant_id"
    tenants ||--o{ customers : "tenant_id"
    tenants ||--o{ orders : "tenant_id"
    tenants ||--o{ installment_products : "tenant_id"
    tenants ||--o{ installment_sales : "tenant_id"
    tenants ||--o{ invoice_counters : "tenant_id"
    tenants ||--o{ audit_events : "tenant_id"
    orders ||--|{ order_items : "order_id"
    customers ||--o{ orders : "customer_id"
    customers ||--o{ installment_sales : "customer_id"
    installment_products ||--o{ installment_plans : "product_id"
    installment_plans ||--o{ installment_sales : "plan_id"
```

#### Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| `UUID` primary keys | Deterministic mapping from MongoDB ObjectIds |
| `mongo_id TEXT UNIQUE` on every table | Idempotent migration — `ON CONFLICT DO UPDATE` |
| `NUMERIC(12,2)` for all money | No floating-point rounding errors |
| `TIMESTAMPTZ` for all timestamps | UTC storage, timezone-aware queries |
| `JSONB` for schedule/payments arrays | Preserves MongoDB document structure |
| Compound index on `(tenant_id, created_at)` | Multi-tenant query performance |

#### Financial Calculation Rules

> [!IMPORTANT]
> All financial calculations use `NUMERIC(12,2)` — never `FLOAT` or `DOUBLE PRECISION`.
> Database transactions wrap all financial writes.
> Idempotency keys prevent duplicate orders and payments.

```sql
-- Example: safe monetary sum
SELECT SUM(grand_total)::NUMERIC(12,2) FROM orders WHERE tenant_id = $1;

-- Example: transactional payment recording
BEGIN;
  UPDATE installment_sales SET amount_paid = amount_paid + $1 WHERE id = $2;
  INSERT INTO installment_payments (...) VALUES (...);
COMMIT;
```

---

### MongoDB → PostgreSQL Field Mapping

| MongoDB (camelCase) | PostgreSQL (snake_case) | Notes |
|--------------------|------------------------|-------|
| `_id` (ObjectId) | `id` (UUID) | Deterministic UUID from ObjectId |
| `tenantId` | `tenant_id` | UUID FK |
| `grandTotal` | `grand_total` | NUMERIC(12,2) |
| `createdAt` | `created_at` | TIMESTAMPTZ |
| `invoiceNo` | `invoice_no` | TEXT |
| `paymentMode` | `payment_method` | TEXT (enum-like) |
| `items` (array) | `order_items` table | Normalized |
| `schedule` (array) | `schedule` JSONB | Kept as JSONB |
| `payments` (array) | `payments` JSONB | Kept as JSONB |

<a id="ref-18"></a>

## Reference: `docs/delivery-phases.md`

## KazmiOn delivery phases

Status: in progress. Existing uncommitted work is retained. No production cutover is authorized by this document.

1. Inspect existing routes, persistence, authorization, printing and verification tools; establish baseline checks.
2. Register trusted installed module manifests idempotently, show release states and submodules, enforce runtime availability, and preserve catalog records.
3. Standardize provisioning and entitlement defaults; expose Help and Backup availability with separately authorized export operations and Coming Soon AI registration.
4. Extend invoice layout settings and preview/PDF/browser printing with bounded paper dimensions and safe branding.
5. Strengthen installment decimal arithmetic, append-only payment posting, concurrency/idempotency and audit evidence.
6. Verify isolated restoration and print dimensions; record regression results and deployment gates.

### Database boundary

Current core services inject shared Mongoose models. An existing optional PostgreSQL invoice-state adapter routes that domain to independent business databases. Full database-per-tenant provisioning requires a separate routing, migration and rollback cutover across all core services and workers. It must not be represented as complete by creating empty databases or changing a URI. Existing business data stays in place until a reviewed migration and restore drill permit cutover.

### Release gates

No production deployment, destructive migration, existing-volume reset or business-data restore is part of local verification. Hardware printer testing requires the actual device and driver. SMTP acceptance tests do not prove external inbox delivery. Results below must come from executed checks, not older documentation.

<a id="ref-19"></a>

## Reference: `docs/DEPLOYMENT_GUIDE.md`

## KazmiOn POS — Deployment Guide (Single Container)

Target: Windows 10/11 client PC with Docker Desktop. Fully offline after installation.

### What ships
One image (`kazmion/pos:latest`), one container (`kazmion-pos`) containing PostgreSQL 17, FerretDB gateway, Redis, NestJS API, PDF worker and the compiled React frontend behind nginx. App URL: `http://localhost:8080`.

### Prerequisites
- Docker Desktop for Windows (WSL2 backend), running.
- Nothing else.

### Fresh installation
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\install.ps1
```
This creates `.env` with generated secrets, builds the image, starts the container and waits for health.

Manual equivalent:
```powershell
Copy-Item .env.example .env   # then set JWT_ACCESS_SECRET, JWT_REFRESH_SECRET,
                              # PLATFORM_DEVELOPER_SETUP_TOKEN, PASSWORD_RESET_BASE_URL
docker compose build
docker compose up -d
```

### Daily use
| Action | Command / script |
|---|---|
| Start | `scripts\start.ps1` (or `KazmiOn-Launch.bat`) |
| Stop | `scripts\stop.ps1` |
| Logs | `docker compose logs -f kazmion` |
| Status | `docker compose ps` |
| Health | `http://localhost:8080/health` |

### Required commands
```powershell
docker compose build
docker compose up -d
docker compose ps
docker compose logs -f
docker compose down
docker image ls
```

### Data persistence
Named volumes (survive container replacement and upgrades):
- `kazmion_pgdata` — PostgreSQL cluster incl. generated service credentials
- `kazmion_uploads` — generated PDF invoices (`/data/invoices`)
- `kazmion_backups` — `/app/backups` inside the container

PostgreSQL, FerretDB and Redis bind to the container loopback only; only port 8080 is published, to `127.0.0.1`.

### Upgrades (data-safe)
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\update.ps1
```
Takes a pre-update backup, rebuilds, replaces the container, never touches volumes. Image rebuild is required for any code/module change — modules ship inside the image.

### Backups / restore
```powershell
scripts\backup.ps1 [-OutputDir <dir>]     # pg_dump + invoice files
scripts\restore.ps1 -SqlFile backups\manual\pos-<stamp>.sql [-InvoicesDir backups\manual\invoices-<stamp>]
```

### Offline operation
After image build and first boot, the stack needs no internet. Avoid `docker compose pull` on client machines.

### Architecture notes
- Each business is tenant-isolated at the application layer (business/branch scoping enforced in API guards + DocumentDB extension tables); see `docs/TENANT_ISOLATION.md` and `docs/adr/0003-single-container-postgresql.md` for why physical per-business databases were not adopted (they would require breaking application changes).
- Process supervision: supervisord (`docker/supervisord.conf`), Postgres readiness-gated app startup, autorestart on failure.

<a id="ref-20"></a>

## Reference: `docs/design-system.md`

## KazmiOn interface design

The React interface uses `apps/web/src/styles/design-system.css` for the shared product theme and `PageHeading` for module headings. Provider design work can be incorporated once Canva and Figma are connected; no provider-generated designs are included in this implementation.

### Typography

- Inter: interface, headings, forms, buttons, and tables. System sans-serif is the offline fallback.
- JetBrains Mono: identifiers, codes, and keyboard shortcuts.
- Page headings: 24–30px, weight 650. Descriptions: 13px with generous line height.
- Controls and table rows: 13–16px. Labels: sentence case, weight 550.
- Monetary metrics use tabular figures to keep columns aligned.

### Color and surfaces

- Light canvas: `#f5f7fb`; panels: white; primary text: `#18263b`.
- Dark canvas: `#0c1422`; panels: `#141f30`; primary text: `#edf2fa`.
- Primary action: `#175cd3` with white text. Orange remains a restrained brand accent.
- Use semantic success, warning, and error tokens instead of brand colors for status.
- Use solid panels, subtle borders, 14px panel corners, and 9px control corners.

### Interaction

Use `page-header` with `PageHeading` and a compact action group. Keep primary actions clearly distinguished from secondary actions. Shared controls have visible keyboard focus, 42–44px action heights, and 44px field heights. Mobile fields use 16px text to avoid browser zoom. Shared dialogs trap focus, restore focus to their trigger, and lock background scrolling. Respect reduced-motion preferences.

The shared theme applies to all business routes, installment submodules, onboarding, sign-in, and platform/developer consoles. Print styles stay separate from screen styling.

### Browser verification

With the frontend running on port 5173 and Microsoft Edge installed, run:

```powershell
npm exec --yes --package=@playwright/test -- playwright test --config=qa/playwright.config.cjs
```

The suite checks 28 routes in desktop light mode and mobile dark mode. It uses mocked demo responses and a browser-local demo session, checks page rendering and horizontal overflow, verifies the selected theme and font family, and exercises shared dialog focus and Escape behavior. Screenshots are stored under `qa/artifacts/` and excluded from Git. These are UI smoke checks, not live API integration tests.

The main sign-in page uses a fluid card over the supplied hero image on screens 1200px and wider. Smaller screens use a centered card beneath a compact image banner. Content scrolls naturally on short screens, helper text remains readable, and recovery/navigation controls have 44px touch targets. PIN verification includes an accessible progress indicator; all recovery states share the same theme tokens.

Nine additional sign-in checks cover 320–1920px widths, tablet and landscape layouts, both themes, password visibility, PIN errors, recovery completion, focus transitions and horizontal overflow. Run them separately with `--config=qa/sign-in.config.cjs`, or as part of the main browser suite.

<a id="ref-21"></a>

## Reference: `docs/DOCKER_DEPLOYMENT.md`

## KazmiOn — Docker Deployment Guide (Windows)

### Prerequisites

| Requirement | Minimum | Notes |
|-------------|---------|-------|
| Windows | 10 / 11 (64-bit) | WSL2 required for Docker |
| Docker Desktop | Latest stable | Enable WSL2 backend |
| RAM | 8 GB | 16 GB recommended |
| Disk | 20 GB free | For images + MongoDB data |
| Git | Any recent | For cloning |

### Quick Start

```powershell
# 1. Clone
git clone <repo-url> kazmion
Set-Location kazmion

# 2. Configure
Copy-Item .env.example .env
# Open .env and set all REPLACE_ME values (see Configuration section)

# 3. Build + Start (takes 3–5 min on first run)
npm run docker:rebuild

# 4. Open
Start-Process "http://localhost:8080"
```

### Configuration (.env)

Minimum required values — replace all `REPLACE_ME_*`:

```env
# Secrets (generate with PowerShell below)
JWT_ACCESS_SECRET=<64-char random string>
JWT_REFRESH_SECRET=<different 64-char random string>
PLATFORM_DEVELOPER_SETUP_TOKEN=<32+ char random string>

# URLs
CORS_ORIGIN=http://localhost:5173,http://localhost:8080
PASSWORD_RESET_BASE_URL=http://localhost:8080

# Optional: PostgreSQL (for migration only)
# POSTGRES_PASSWORD=<password>
```

**Generate secrets in PowerShell:**
```powershell
-join ((65..90)+(97..122)+(48..57) | Get-Random -Count 64 | ForEach-Object {[char]$_})
```
Run twice — once for JWT_ACCESS_SECRET, once for JWT_REFRESH_SECRET.

### Commands

| Command | Description |
|---------|-------------|
| `npm run docker:rebuild` | Build fresh images + start (after code changes) |
| `npm run docker:start` | Start existing images |
| `npm run docker:stop` | Stop all containers |
| `npm run docker:logs` | Tail all container logs |
| `.\scripts\verify-deployment.ps1` | Post-startup smoke test |

### Ports

| Port | Service | Access |
|------|---------|--------|
| **8080** | Web app (Nginx + React SPA) | `http://localhost:8080` |
| 3000 | NestJS API | Dev/debug only |
| 27017 | MongoDB | Dev/debug only |
| 6379 | Redis | Dev/debug only |

> **Security:** In production, expose only port 8080 externally. The other ports are for local development.

### Persistent Volumes

| Volume | Contents | Location |
|--------|---------|---------|
| `mongo_data` | All business data | Managed by Docker |
| `redis_data` | Queue persistence | Managed by Docker |
| `invoice_data` | Generated PDFs | Managed by Docker |

### Updating the Application

```powershell
# 1. Backup first (always!)
.\scripts\backup\mongo-backup.ps1

# 2. Pull latest code
git pull origin main

# 3. Rebuild with new source
npm run docker:rebuild

# 4. Verify
.\scripts\verify-deployment.ps1
```

### Troubleshooting

| Symptom | Diagnosis | Fix |
|---------|-----------|-----|
| Port 8080 shows old UI | Stale Docker image | `npm run docker:rebuild` |
| `401 Unauthorized` on all routes | Wrong JWT secret | Check `JWT_ACCESS_SECRET` in `.env` |
| PDF not generating | Worker error | `docker compose logs pdf-worker` |
| Cannot connect to MongoDB | Service not healthy | `docker compose logs mongo` |
| `set JWT_ACCESS_SECRET in .env` error | Missing env var | Edit `.env`, set the value |
| Containers keep restarting | Startup failure | `docker compose logs <service>` |

**Full reset (WARNING — deletes all data):**
```powershell
docker compose down -v          # remove containers + volumes
npm run docker:rebuild          # rebuild from scratch
```

### Health Endpoints

| Endpoint | Expected response |
|----------|-------------------|
| `http://localhost:3000/api/health` | `{"status":"ok"}` |
| `http://localhost:8080/health` | `200 OK` (Nginx static) |

### First-Time Setup After Deploy

1. Navigate to `http://localhost:8080`
2. Use the developer setup flow to create the platform developer account (requires `PLATFORM_DEVELOPER_SETUP_TOKEN`)
3. Create a tenant/business through the developer console
4. Log in as the business owner
5. Configure products, staff, and business settings

<a id="ref-22"></a>

## Reference: `docs/erd.md`

## Data model (MongoDB)

```mermaid
erDiagram
  TENANT ||--o{ USER : employs
  TENANT ||--o{ PRODUCT : sells
  TENANT ||--o{ ORDER : records
  TENANT ||--o{ INVOICE_COUNTER : numbers
  USER ||--o{ ORDER : rings_up
  ORDER ||--|{ ORDER_ITEM : contains
  PRODUCT ||--o{ ORDER_ITEM : sold_as

  TENANT {
    ObjectId _id
    string name
    string domainType
    string taxRegNo
    string currency
    string invoicePrefix
    object taxProfile "gstPercent, reducedGstPercent, serviceChargePercent, otherCharges[]"
  }
  USER {
    ObjectId tenantId
    string email "unique"
    string passwordHash
    string role "owner | admin | cashier"
  }
  PRODUCT {
    ObjectId tenantId
    string name
    string sku "unique per tenant (optional)"
    number price
    number stockQty
    boolean trackStock
    string taxClass "standard | reduced | exempt"
    object attributes "free-form, per business type"
  }
  ORDER {
    ObjectId tenantId
    string invoiceNo "unique per tenant"
    number subtotal
    number taxTotal
    number grandTotal
    string status "completed | voided"
    string invoiceStatus "pending | ready | failed"
    string invoicePdfPath
  }
  ORDER_ITEM {
    ObjectId productId
    number qty
    number unitPrice
    number discountAmount
    number taxPercent
    number lineTotal
  }
  INVOICE_COUNTER {
    ObjectId tenantId
    number year
    number lastNumber
  }
```

Every document carries `tenantId`, and every service query filters on it. That is what keeps one business's data invisible to another.

<a id="ref-23"></a>

## Reference: `docs/installment-pricing.md`

Interest only applies after the down payment. New sales apply a one-time flat percentage to the cash price minus the received down payment, and that balance (principal + interest) is then distributed evenly over the installments, with the final installment absorbing rounding. If the down payment is zero, no interest is charged: the full cash price is distributed over the installments instead. Existing agreements retain saved amounts. Final payments absorb rounding differences. New order-backed agreements snapshot unit price, discount, tax and line totals; older records show missing amounts as Not recorded.

<a id="ref-24"></a>

## Reference: `docs/migration/01-repository-audit.md`

## MongoDB migration: repository audit

Date: 2026-11-15. Scope: current working tree, including uncommitted application
work. This is a discovery report, not approval for production cutover.

### Existing architecture

- API: TypeScript, NestJS, Mongoose, MongoDB. `apps/api/src/app.module.ts`
  creates one connection from `MONGO_URI`. Modules inject concrete Mongoose
  models; there is no interchangeable database repository layer.
- Web: React, Vite, TypeScript, React Query and Zustand. API identifiers and
  response shapes must remain compatible during the database transition.
- Worker: BullMQ/Redis plus the native MongoDB driver. `worker.ts` opens `orders`;
  `queue/invoice.processor.ts` updates invoice status using an ObjectId.
- Python analytics and chatbot applications are future-service stubs.
- Docker Compose runs MongoDB 7, Redis, API, PDF worker and web. Named volumes
  hold MongoDB, Redis and invoice files. Production overlay removes database
  host ports. Existing containers were running during discovery.
- Application and platform data currently share the `pos` database. A tenant
  filter and branch context isolate logical businesses; there are no per-business
  database credentials or installation database registry yet.

### Boundaries that must change together

1. Authentication currently looks up globally unique email addresses and users
   in the shared database. JWT validation reloads users and checks session/PIN
   versions. A trusted installation-local business directory is needed before
   tenant-local authentication; a caller-supplied database name is not acceptable.
2. Business creation creates tenant and owner records through the existing shared
   models. Provisioning must become an explicit, restartable operation. Starting
   an API process must never provision another database.
3. `common/branch-scope.ts` injects branch filters into Mongoose operations using
   AsyncLocalStorage. Legacy missing/null branch IDs belong to a default branch.
   SQL repositories must reproduce this explicitly.
4. Order creation conditionally decrements stock, increments invoice counters,
   inserts orders and installment plans, and compensates on errors. It does not
   use a multi-document MongoDB transaction. PostgreSQL must wrap these changes
   in one transaction, with durable post-commit PDF dispatch.
5. Checkout and stock adjustment idempotency records, payment receipt identities,
   stock-restoration markers and refund snapshots are migration data, not caches.
6. Reporting uses aggregation, date bucketing and configured report timezone.
   Preserve date-only installment due dates separately from timestamp instants.
7. The PDF worker currently updates by order ID in a single shared collection.
   Jobs need an authenticated installation/business resolution path after the
   split; existing queued jobs and stored PDF paths must be accounted for.
8. Developer backup exports deliberately remove credentials and omit Redis and
   external files. They cannot serve as a lossless migration source or rollback
   backup. Use verified database and file backups before cutover.

### Authentication and financial preservation

Preserve bcrypt/Argon2 hashes as opaque values, together with roles, permissions,
session versions, lockouts and recovery state. Do not copy business passwords to
the developer server. Existing password recovery code has compile errors from
before migration work; a green backend baseline remains a prerequisite.

Source monetary fields are JavaScript/Mongoose numbers. Target NUMERIC precision
and conversion rules must be based on observed values and business rounding,
with exact-decimal reconciliation. Do not silently round historical values to
two places. Quantities may be fractional. Existing invoice/customer snapshots
must survive normalization even when current product/customer data changes.

### Confirmed user decisions

- Existing businesses will be distributed across different client PCs.
- Each business gets its own local PostgreSQL database.
- The developer control plane is separate from business databases.
- Offline sales continue when a cached license expires; administrators see a
  renewal notice. No online developer-server dependency may gate ordinary sales.
- The business-to-client-PC mapping and control-plane host are still required.

### Status and risks

Repository dependency discovery is recorded in reports 02 and 03. Live initial
profiling is recorded in reports 04 and 05. Full nested-field, financial and
cross-installation discovery is not yet complete. No PostgreSQL runtime switch,
schema deployment, data migration or source deletion has been performed.

Do not remove MongoDB volumes or dependencies. Before cutover: complete the
destination mapping, profile every nested financial field, resolve anomalies,
prove backup restoration, implement and test the SQL backend and ETL, freeze
source writes for a consistent final snapshot, reconcile, then obtain explicit
production-cutover approval. Rollback must account for post-cutover sales.

<a id="ref-25"></a>

## Reference: `docs/migration/02-mongodb-inventory.md`

## MongoDB source inventory

Generated from the current working tree on 2026-11-15. These are source declarations, not assertions that all corresponding collections exist in live data.

Includes schemas embedded in module/service files. Branch fields are also injected by `common/branch-scope.ts`.

### apps/api/src/modules/customer/schemas/customer.schema.ts

```text
5:@Schema({ _id: false })
6:export class Guarantor {
7:  @Prop() name?: string;
8:  @Prop() phone?: string;
9:  @Prop() cnic?: string;
10:  @Prop() address?: string;
14:@Schema({ timestamps: true })
15:export class Customer {
16:  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true, index: true }) tenantId: Types.ObjectId;
17:  @Prop({ required: true, trim: true }) name: string;
18:  @Prop({ required: true, trim: true }) phone: string;
20:  @Prop({ trim: true }) cnic?: string;
21:  @Prop() address?: string;
22:  @Prop({ type: GuarantorSchema }) guarantor?: Guarantor;
23:  @Prop() notes?: string;
28:CustomerSchema.plugin(branchScoped);
29:CustomerSchema.index({ tenantId: 1, name: 1 });
30:CustomerSchema.index({ tenantId: 1, phone: 1 });
```

### apps/api/src/modules/auth/schemas/user.schema.ts

```text
5:@Schema({ timestamps: true })
6:export class User {
7:  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true, index: true }) tenantId: Types.ObjectId;
8:  @Prop({ required: true, trim: true }) name: string;
9:  @Prop({ required: true, unique: true, lowercase: true, trim: true }) email: string;
10:  @Prop({ type: String, default: null, trim: true, index: true }) phone: string | null;
11:  @Prop({ type: String, default: null, lowercase: true, trim: true }) recoveryEmail: string | null;
12:  @Prop({ default: false }) emailVerified: boolean;
13:  @Prop({ type: Date, default: null }) emailVerifiedAt: Date | null;
14:  @Prop({ type: String, select: false }) emailVerificationCodeHash?: string;
15:  @Prop({ type: Date, select: false }) emailVerificationExpiresAt?: Date;
16:  @Prop({ default: 0, select: false }) emailVerificationAttempts: number;
17:  @Prop({ default: false }) phoneVerified: boolean;
18:  @Prop({ type: Date, default: null }) phoneVerifiedAt: Date | null;
19:  @Prop({ type: Date, select: false }) securityCodeRequestedAt?: Date;
20:  @Prop({ default: false }) pinEnabled: boolean;
21:  @Prop({ required: true, select: false }) passwordHash: string;
23:  @Prop({ default: 0, select: false }) developerSessionVersion: number;
24:  @Prop({ type: String, select: false }) pinHash?: string;
25:  @Prop({ type: String, select: false }) developerPinHash?: string;
26:  @Prop({ default: 0 }) sessionVersion: number;
27:  @Prop({ default: false }) pinRequiresChange: boolean;
28:  @Prop({ default: 0 }) pinVersion: number;
29:  @Prop({ default: 0, select: false }) pinFailedAttempts: number;
30:  @Prop({ type: Date, default: null, select: false }) pinLockedUntil: Date | null;
31:  @Prop({ type: String, select: false }) pinChallengeId?: string;
32:  @Prop({ type: String, select: false }) pinResetCodeHash?: string;
33:  @Prop({ type: Date, select: false }) pinResetExpiresAt?: Date;
34:  @Prop({ default: 0, select: false }) pinResetAttempts: number;
35:  @Prop({ required: true, enum: Role }) role: Role;
37:  @Prop({ type: [String], default: undefined }) moduleRights?: string[];
38:  @Prop({ type: [String], default: undefined }) permissions?: string[];
39:  @Prop({ type: [Types.ObjectId], default: [] }) branchIds: Types.ObjectId[];
40:  @Prop({ default: false }) superAdmin: boolean;
41:  @Prop({ default: true }) isActive: boolean;
43:  @Prop({ type: Date, default: null, select: false }) enrollmentExpiresAt?: Date | null;
44:  @Prop({ default: false }) passwordRequiresChange: boolean;
62:UserSchema.index({ superAdmin: 1 }, {
63:  unique: true,
64:  partialFilterExpression: { superAdmin: true },
```

### apps/api/src/modules/audit/audit.module.ts

```text
10:@Schema({ timestamps: { createdAt: true, updatedAt: false } })
11:export class AuditEvent {
12:  @Prop({ type: Types.ObjectId, required: true, index: true }) tenantId: Types.ObjectId;
13:  @Prop({ required: true }) actorId: string;
14:  @Prop({ required: true }) action: string;
15:  @Prop({ required: true }) resource: string;
16:  @Prop({ type: Types.ObjectId }) branchId?: Types.ObjectId;
17:  @Prop({ type: Object }) details?: Record<string, unknown>;
20:schema.index({ tenantId: 1, createdAt: -1 });
24:export class AuditService {
39:class AuditInterceptor implements NestInterceptor {
53:class AuditController {
59:export class AuditModule {}
```

### apps/api/src/modules/tenant/schemas/tenant.schema.ts

```text
5:@Schema({ _id: false })
6:export class ChargeRule {
7:  @Prop({ required: true }) label: string;
8:  @Prop({ required: true, enum: ChargeType }) type: ChargeType;
9:  @Prop({ required: true, min: 0 }) value: number;
18:@Schema({ _id: false })
19:export class TaxProfile {
20:  @Prop({ default: 18, min: 0, max: 100 }) gstPercent: number;
21:  @Prop({ default: 5, min: 0, max: 100 }) reducedGstPercent: number;
22:  @Prop({ default: 0, min: 0, max: 100 }) serviceChargePercent: number;
23:  @Prop({ type: [ChargeRuleSchema], default: [] }) otherCharges: ChargeRule[];
27:@Schema({ _id: false })
28:export class NavigationVisibility {
29:  @Prop({ default: true }) dashboard: boolean;
30:  @Prop({ default: true }) pos: boolean;
31:  @Prop({ default: true }) products: boolean;
32:  @Prop({ default: true }) customers: boolean;
33:  @Prop({ default: true }) installments: boolean;
34:  @Prop({ default: true }) barcodeGenerator: boolean;
35:  @Prop({ default: true }) barcodeScanner: boolean;
36:  @Prop({ default: true }) orders: boolean;
37:  @Prop({ default: true }) settings: boolean;
41:@Schema({ _id: false })
42:export class TenantFeatureFlags {
43:  @Prop({ default: true }) pos: boolean;
44:  @Prop({ default: true }) inventory: boolean;
45:  @Prop({ default: true }) reports: boolean;
46:  @Prop({ default: true }) customers: boolean;
47:  @Prop({ default: true }) installments: boolean;
48:  @Prop({ default: true }) barcodes: boolean;
52:@Schema({ timestamps: true })
53:export class Tenant {
54:  @Prop({ type: Types.ObjectId, default: null }) defaultBranchId?: Types.ObjectId | null;
55:  @Prop({ default: 1, min: 1 }) branchLimit: number;
56:  @Prop({ default: 0, min: 0 }) branchCount: number;
57:  @Prop({ enum: ['cloud', 'offline', 'hybrid'], default: 'cloud' }) deploymentMode: 'cloud' | 'offline' | 'hybrid';
58:  @Prop({ type: Date, default: null }) licenseExpiresAt?: Date | null;
59:  @Prop({ default: 'Asia/Karachi' }) timeZone: string;
60:  @Prop({ required: true, trim: true }) name: string;
61:  @Prop({ required: true, enum: DomainType, default: DomainType.Retail }) domainType: DomainType;
62:  @Prop() logoUrl?: string;
63:  @Prop() address?: string;
64:  @Prop() taxRegNo?: string;
65:  @Prop({ default: 'PKR' }) currency: string;
66:  @Prop({ default: 'INV' }) invoicePrefix: string;
67:  @Prop({ type: TaxProfileSchema, default: () => ({}) }) taxProfile: TaxProfile;
69:  @Prop({ default: 0, min: 0, max: 100 }) installmentMarkupPercent: number;
70:  @Prop({ type: NavigationVisibilitySchema, default: () => ({}) }) navigationVisibility: NavigationVisibility;
71:  @Prop({ type: String, enum: ['active', 'suspended'], default: 'active', index: true }) status: 'active' | 'suspended';
72:  @Prop({ type: TenantFeatureFlagsSchema, default: () => ({}) }) featureFlags: TenantFeatureFlags;
73:  @Prop({ type: Types.ObjectId, ref: 'SubscriptionPlan', default: null }) subscriptionPlanId: Types.ObjectId | null;
```

### apps/api/src/modules/auth/recovery.service.ts

```text
12:@Schema()
13:export class RecoveryChallenge {
14:  @Prop({ required: true, unique: true }) challengeId: string;
15:  @Prop({ required: true, type: Types.ObjectId }) userId: Types.ObjectId;
16:  @Prop({ required: true }) purpose: string;
17:  @Prop({ required: true }) channel: string;
18:  @Prop({ required: true }) destination: string;
19:  @Prop({ required: true, select: false }) codeHash: string;
20:  @Prop({ required: true, expires: 0 }) expiresAt: Date;
21:  @Prop({ default: 0 }) attempts: number;
22:  @Prop({ required: true }) sessionVersion: number;
23:  @Prop({ required: true }) developerSessionVersion: number;
28:export class RecoveryService {
```

### apps/api/src/modules/branch/branch.module.ts

```text
17:@Schema({ timestamps: true }) export class Branch {
18:  @Prop({ type: Types.ObjectId, required: true, index: true }) tenantId: Types.ObjectId;
19:  @Prop({ required: true }) name: string;
20:  @Prop({ required: true }) code: string;
21:  @Prop() address?: string;
22:  @Prop({ default: true }) isActive: boolean;
25:schema.index({ tenantId: 1, code: 1 }, { unique: true });
26:class CreateBranchDto { @IsString() @Length(2, 100) name: string; @IsString() @Length(2, 20) code: string; @IsOptional() @IsString() @MaxLength(300) address?: string; }
27:class UpdateBranchDto { @IsOptional() @IsString() @Length(2, 100) name?: string; @IsOptional() @IsBoolean() isActive?: boolean; }
29:@Injectable() export class BranchService {
52:@Injectable() class BranchContextInterceptor implements NestInterceptor {
61:class BranchController {
69:export class BranchModule {}
```

### apps/api/src/modules/order/schemas/order.schema.ts

```text
6:@Schema({ _id: false })
7:export class OrderItem {
8:  @Prop({ type: Types.ObjectId, ref: 'Product', required: true }) productId: Types.ObjectId;
9:  @Prop({ required: true }) name: string;
10:  @Prop({ required: true }) qty: number;
11:  @Prop({ required: true }) unitPrice: number;
12:  @Prop({ default: 0 }) discountPercent: number;
13:  @Prop({ default: 0 }) discountAmount: number;
14:  @Prop({ default: 0 }) taxPercent: number;
15:  @Prop({ default: 0 }) taxAmount: number;
16:  @Prop({ required: true }) lineTotal: number;
18:  @Prop() serialNo?: string;
20:  @Prop({ default: true }) stockTracked: boolean;
24:@Schema({ _id: false })
25:class ChargeAmount {
26:  @Prop({ required: true }) label: string;
27:  @Prop({ required: true }) amount: number;
31:@Schema({ _id: false })
32:class TaxBreakdownRow {
33:  @Prop({ required: true }) ratePercent: number;
34:  @Prop({ required: true }) taxableAmount: number;
35:  @Prop({ required: true }) taxAmount: number;
39:@Schema({ _id: false })
40:class Customer {
41:  @Prop() name?: string;
42:  @Prop() phone?: string;
46:@Schema({ timestamps: true })
47:export class Order {
48:  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true }) tenantId: Types.ObjectId;
49:  @Prop({ type: Types.ObjectId, ref: 'User', required: true }) cashierId: Types.ObjectId;
50:  @Prop({ required: true }) cashierName: string;
51:  @Prop({ required: true }) invoiceNo: string;
52:  @Prop() idempotencyKey?: string;
53:  @Prop({ type: [{ _id: false, mode: String, amount: Number }], default: undefined }) payments?: { mode: string; amount: number }[];
54:  @Prop({ type: Object }) refund?: { reason: string; amount: number; approvedBy: string; refundedAt: Date };
55:  @Prop({ type: [OrderItemSchema], required: true }) items: OrderItem[];
56:  @Prop({ required: true }) subtotal: number;
57:  @Prop({ required: true }) discountTotal: number;
58:  @Prop({ required: true }) taxableTotal: number;
59:  @Prop({ required: true }) taxTotal: number;
60:  @Prop({ type: [ChargeAmountSchema], default: [] }) charges: ChargeAmount[];
61:  @Prop({ default: 0 }) chargesTotal: number;
62:  @Prop({ required: true }) grandTotal: number;
63:  @Prop({ type: [TaxBreakdownRowSchema], default: [] }) taxBreakdown: TaxBreakdownRow[];
64:  @Prop({ required: true, enum: PaymentMode }) paymentMode: PaymentMode;
65:  @Prop({ type: CustomerSchema }) customer?: Customer;
66:  @Prop() note?: string;
67:  @Prop({ enum: OrderStatus, default: OrderStatus.Completed }) status: OrderStatus;
68:  @Prop() voidedAt?: Date;
69:  @Prop({ enum: InvoiceStatus, default: InvoiceStatus.Pending }) invoiceStatus: InvoiceStatus;
71:  @Prop() invoicePdfPath?: string;
76:OrderSchema.plugin(branchScoped);
77:OrderSchema.index({ tenantId: 1, createdAt: -1 });
78:OrderSchema.index({ tenantId: 1, invoiceNo: 1 }, { unique: true });
79:OrderSchema.index({ tenantId: 1, idempotencyKey: 1 }, { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } });
```

### apps/api/src/modules/stock/stock.module.ts

```text
15:@Schema({ timestamps: true }) class StockAdjustment {
16:  @Prop({ type: Types.ObjectId, required: true }) tenantId: Types.ObjectId;
17:  @Prop({ type: Types.ObjectId, required: true }) productId: Types.ObjectId;
18:  @Prop({ required: true }) idempotencyKey: string;
19:  @Prop({ required: true }) delta: number;
20:  @Prop({ required: true }) reason: string;
21:  @Prop({ required: true }) actorId: string;
22:  @Prop({ default: 'pending', enum: ['pending', 'applied', 'rejected'] }) status: string;
24:const schema = SchemaFactory.createForClass(StockAdjustment); schema.plugin(branchScoped); schema.index({ tenantId: 1, idempotencyKey: 1 }, { unique: true });
25:class AdjustStockDto { @IsMongoId() productId: string; @IsUUID() idempotencyKey: string; @IsNumber({ maxDecimalPlaces: 3, allowNaN: false, allowInfinity: false }) delta: number; @IsString() @Length(3, 300) reason: string; }
26:@Injectable() class StockService {
53:class StockController {
58:@Module({ imports: [ProductModule, MongooseModule.forFeature([{ name: StockAdjustment.name, schema }])], providers: [StockService], controllers: [StockController] }) export class StockModule {}
```

### apps/api/src/modules/order/schemas/invoice-counter.schema.ts

```text
5:@Schema()
6:export class InvoiceCounter {
7:  @Prop({ type: Types.ObjectId, required: true }) tenantId: Types.ObjectId;
8:  @Prop({ required: true }) year: number;
9:  @Prop({ default: 0 }) lastNumber: number;
13:InvoiceCounterSchema.index({ tenantId: 1, year: 1 }, { unique: true });
```

### apps/api/src/modules/order/schemas/checkout-request.schema.ts

```text
4:@Schema({ timestamps: true })
5:export class CheckoutRequest {
6:  @Prop({ type: Types.ObjectId, required: true }) tenantId: Types.ObjectId;
7:  @Prop({ required: true }) key: string;
8:  @Prop({ required: true }) hash: string;
9:  @Prop({ type: Object }) result?: Record<string, unknown>;
12:CheckoutRequestSchema.plugin(branchScoped);
13:CheckoutRequestSchema.index({ tenantId: 1, key: 1 }, { unique: true });
```

### apps/api/src/modules/super-admin/schemas/subscription-plan.schema.ts

```text
4:@Schema({ _id: false })
5:export class PlanFeatures {
6:  @Prop({ required: true, default: false }) barcodes: boolean;
7:  @Prop({ required: true, default: true }) pos: boolean;
8:  @Prop({ required: true, default: true }) inventory: boolean;
9:  @Prop({ required: true, default: true }) reports: boolean;
10:  @Prop({ required: true, default: true }) customers: boolean;
11:  @Prop({ required: true, default: true }) installments: boolean;
15:@Schema({ timestamps: true })
16:export class SubscriptionPlan {
17:  @Prop({ required: true, unique: true, trim: true }) name: string;
18:  @Prop({ type: String, default: '' }) description: string;
19:  @Prop({ required: true, min: 0 }) price: number;
20:  @Prop({ required: true, enum: ['monthly', 'yearly', 'lifetime'], default: 'monthly' }) billingInterval: 'monthly' | 'yearly' | 'lifetime';
21:  @Prop({ type: PlanFeaturesSchema, default: () => ({}) }) features: PlanFeatures;
22:  @Prop({ default: true, index: true }) isActive: boolean;
```

### apps/api/src/modules/super-admin/schemas/platform-module.schema.ts

```text
5:@Schema({ timestamps: true })
6:export class PlatformModule {
8:  @Prop({ required: true, unique: true, trim: true, lowercase: true })
11:  @Prop({ required: true, trim: true }) label: string;
12:  @Prop({ type: String, default: '' }) description: string;
13:  @Prop({ default: true, index: true }) isActive: boolean;
```

### apps/api/src/modules/super-admin/schemas/admin-audit.schema.ts

```text
4:@Schema({ timestamps: true })
5:export class AdminAudit {
6:  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true }) actorId: Types.ObjectId;
7:  @Prop({ required: true, trim: true }) actorEmail: string;
8:  @Prop({ required: true, trim: true, index: true }) action: string;
9:  @Prop({ required: true, trim: true, index: true }) entityType: string;
10:  @Prop({ required: true, trim: true, index: true }) entityId: string;
11:  @Prop({ type: MongooseSchema.Types.Mixed, default: {} }) details: Record<string, unknown>;
17:AdminAuditSchema.index({ createdAt: -1 });
```

### apps/api/src/modules/product/schemas/product.schema.ts

```text
6:@Schema({ timestamps: true })
7:export class Product {
8:  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true, index: true }) tenantId: Types.ObjectId;
9:  @Prop({ required: true, trim: true }) name: string;
10:  @Prop({ trim: true }) sku?: string;
11:  @Prop({ trim: true }) category?: string;
12:  @Prop({ default: 'pcs' }) unit: string;
13:  @Prop({ required: true, min: 0 }) price: number;
14:  @Prop({ default: 0, min: 0 }) costPrice: number;
15:  @Prop({ default: 0, min: 0 }) stockQty: number;
16:  @Prop({ default: 5, min: 0 }) lowStockThreshold: number;
18:  @Prop({ default: true }) trackStock: boolean;
19:  @Prop({ required: true, enum: TaxClass, default: TaxClass.Standard }) taxClass: TaxClass;
21:  @Prop({ type: Object, default: {} }) attributes: Record<string, string | number | boolean>;
22:  @Prop() imageUrl?: string;
23:  @Prop({ default: true }) isActive: boolean;
24:  @Prop({ type: [String], default: [], select: false }) restoredSaleEvents: string[];
25:  @Prop({ type: [String], default: [], select: false }) stockAdjustmentEvents: string[];
26:  @Prop() barcode?: string;
31:ProductSchema.plugin(branchScoped);
34:ProductSchema.index(
36:  { unique: true, partialFilterExpression: { sku: { $type: 'string' } } },
38:ProductSchema.index({ tenantId: 1, name: 1 });
39:ProductSchema.index({ tenantId: 1, branchId: 1, barcode: 1 }, { unique: true, partialFilterExpression: { barcode: { $type: 'string' } } });
```

### apps/api/src/modules/installment/schemas/installment-sale.schema.ts

```text
8:@Schema({ _id: false })
9:export class InstallmentScheduleEntry {
10:  @Prop({ required: true }) installmentId: string;
11:  @Prop({ required: true }) dueDate: string;
12:  @Prop({ required: true, min: 0 }) expectedAmount: number;
13:  @Prop({ default: 0, min: 0 }) amountPaid: number;
14:  @Prop({ default: 0, min: 0 }) remainingAmount: number;
15:  @Prop({ default: 'pending', enum: ['pending', 'partial', 'paid', 'overdue', 'cancelled'] }) status: 'pending' | 'partial' | 'paid' | 'overdue' | 'cancelled';
18:@Schema({ _id: false })
19:export class InstallmentPaymentEntry {
20:  @Prop({ required: true }) paymentId: string;
21:  @Prop({ required: true }) installmentId?: string;
22:  @Prop({ required: true, min: 0 }) amount: number;
23:  @Prop({ required: true }) paidAt: Date;
24:  @Prop({ required: true, enum: ['cash', 'card', 'wallet'] }) mode: 'cash' | 'card' | 'wallet';
25:  @Prop() note?: string;
26:  @Prop() receiptNo?: string;
32:@Schema({ timestamps: true })
33:export class InstallmentSale {
34:  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true, index: true }) tenantId: Types.ObjectId;
35:  @Prop({ required: true, unique: true, index: true }) installmentSaleId: string;
36:  @Prop({ required: true }) agreementId: string;
37:  @Prop({ type: Types.ObjectId, ref: 'Customer', required: true, index: true }) customerId: Types.ObjectId;
38:  @Prop({ type: Types.ObjectId, ref: 'InstallmentProduct', required: true, index: true }) installmentProductId: Types.ObjectId;
39:  @Prop({ required: true }) saleDate: string;
40:  @Prop({ required: true, min: 0 }) actualPrice: number;
41:  @Prop({ required: true, min: 0 }) advancePayment: number;
42:  @Prop({ required: true, min: 0, max: 100 }) commissionRate: number;
43:  @Prop({ required: true, min: 0 }) commissionAmount: number;
44:  @Prop({ required: true, min: 0 }) totalInstallmentPrice: number;
45:  @Prop({ required: true, min: 1, max: 120 }) installmentDuration: number;
46:  @Prop({ required: true, enum: ['monthly', 'weekly', 'biweekly'], default: 'monthly' }) paymentFrequency: InstallmentPaymentFrequency;
47:  @Prop({ required: true, min: 0 }) outstandingBalance: number;
48:  @Prop({ default: 0, min: 0 }) totalPaid: number;
49:  @Prop({ default: 'pending', enum: ['pending', 'active', 'completed', 'overdue', 'cancelled'] }) saleStatus: InstallmentSaleStatus;
50:  @Prop({ type: [InstallmentScheduleEntrySchema], default: [] }) schedule: InstallmentScheduleEntry[];
51:  @Prop({ type: [InstallmentPaymentEntrySchema], default: [] }) payments: InstallmentPaymentEntry[];
52:  @Prop({ default: true }) isActive: boolean;
53:  @Prop({ type: Object, default: {} }) metadata: Record<string, string | number | boolean | null>;
58:InstallmentSaleSchema.plugin(branchScoped);
59:InstallmentSaleSchema.index({ tenantId: 1, customerId: 1, saleStatus: 1 });
60:InstallmentSaleSchema.index({ tenantId: 1, installmentProductId: 1 });
```

### apps/api/src/modules/installment/schemas/installment-plan.schema.ts

```text
7:@Schema({ _id: false })
8:export class PlanItem {
9:  @Prop({ required: true }) name: string;
10:  @Prop({ required: true }) qty: number;
11:  @Prop() serialNo?: string;
12:  @Prop() unitPrice?: number;
13:  @Prop() discountAmount?: number;
14:  @Prop() taxAmount?: number;
15:  @Prop() lineTotal?: number;
20:@Schema({ _id: false })
21:export class ScheduleEntry {
22:  @Prop({ required: true }) no: number;
24:  @Prop({ required: true }) dueDate: string;
25:  @Prop({ required: true }) amount: number;
26:  @Prop({ default: 0 }) paidAmount: number;
27:  @Prop({ default: 'pending', enum: ['pending', 'partial', 'paid'] }) status: 'pending' | 'partial' | 'paid';
31:@Schema({ _id: false })
32:export class PlanPayment {
33:  @Prop({ required: true }) receiptNo: string;
34:  @Prop() idempotencyKey?: string;
35:  @Prop({ required: true }) amount: number;
36:  @Prop({ required: true }) paidAt: Date;
37:  @Prop({ required: true, enum: [PaymentMode.Cash, PaymentMode.Card, PaymentMode.Wallet] }) mode: PaymentMode;
38:  @Prop({ required: true }) receivedBy: string;
39:  @Prop() note?: string;
43:@Schema({ timestamps: true })
44:export class InstallmentPlan {
45:  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true, index: true }) tenantId: Types.ObjectId;
46:  @Prop({ type: Types.ObjectId, ref: 'Order', required: true }) orderId: Types.ObjectId;
47:  @Prop({ required: true }) invoiceNo: string;
50:  @Prop({ type: Types.ObjectId, ref: 'Customer', required: true, index: true }) customerId: Types.ObjectId;
51:  @Prop({ required: true }) customerName: string;
52:  @Prop({ required: true }) customerPhone: string;
53:  @Prop() customerCnic?: string;
54:  @Prop() customerAddress?: string;
55:  @Prop({ type: GuarantorSchema }) guarantor?: Guarantor;
57:  @Prop({ type: [PlanItemSchema], default: [] }) items: PlanItem[];
59:  @Prop({ required: true }) cashTotal: number;
60:  @Prop({ required: true }) downPayment: number;
61:  @Prop({ required: true }) markupPercent: number;
62:  @Prop({ required: true }) markupAmount: number;
63:  @Prop({ required: true }) totalPayable: number;
64:  @Prop({ required: true }) financedAmount: number;
65:  @Prop({ required: true }) months: number;
66:  @Prop({ required: true }) monthlyAmount: number;
67:  @Prop({ required: true }) firstDueDate: string;
69:  @Prop({ type: [ScheduleEntrySchema], default: [] }) schedule: ScheduleEntry[];
70:  @Prop({ type: [PlanPaymentSchema], default: [] }) payments: PlanPayment[];
71:  @Prop({ default: 0 }) paidTotal: number;
72:  @Prop({ required: true }) balance: number;
73:  @Prop({ enum: PlanStatus, default: PlanStatus.Active }) status: PlanStatus;
74:  @Prop({ required: true }) createdByName: string;
79:InstallmentPlanSchema.plugin(branchScoped);
80:InstallmentPlanSchema.index({ tenantId: 1, status: 1, createdAt: -1 });
81:InstallmentPlanSchema.index({ tenantId: 1, orderId: 1 }, { unique: true });
```

### apps/api/src/modules/installment/schemas/installment-product.schema.ts

```text
7:@Schema({ timestamps: true })
8:export class InstallmentProduct {
9:  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true, index: true }) tenantId: Types.ObjectId;
10:  @Prop({ required: true, unique: true, index: true }) installmentProductId: string;
11:  @Prop({ required: true, trim: true }) name: string;
12:  @Prop({ trim: true }) brand?: string;
13:  @Prop({ trim: true }) model?: string;
14:  @Prop({ trim: true }) category?: string;
15:  @Prop({ trim: true }) description?: string;
16:  @Prop({ trim: true }) imageUrl?: string;
17:  @Prop({ default: 0, min: 0 }) actualPrice: number;
18:  @Prop({ default: 0, min: 0, max: 100 }) defaultCommissionRate: number;
19:  @Prop({ default: 'active', enum: ['active', 'inactive', 'archived'] }) status: InstallmentProductStatus;
20:  @Prop({ default: true }) isActive: boolean;
21:  @Prop({ type: Object, default: {} }) metadata: Record<string, string | number | boolean | null>;
26:InstallmentProductSchema.plugin(branchScoped);
27:InstallmentProductSchema.index({ tenantId: 1, name: 1 });
28:InstallmentProductSchema.index({ tenantId: 1, status: 1 });
```

Raw recovery collections are accessed from `auth/password-recovery.service.ts`: `password_reset_tokens` and `recovery_codes`. Worker collection access is in `apps/pdf-worker/src/worker.ts`. No GridFS, change-stream or MongoDB session transaction calls were found in the source scan; this is not a claim about external clients.

<a id="ref-26"></a>

## Reference: `docs/migration/03-dependency-map.md`

## MongoDB dependency map

Source paths and line numbers from a repository-wide scan of application, shared-package, script and QA code. Generated output and installed dependencies are excluded. Existing services inject Mongoose models directly; raw-driver calls and ObjectId-dependent API validation also require migration.

```text
qa\api-integration.cjs:9:const mongoose = requireApi('mongoose');
qa\api-integration.cjs:15:const uri = `mongodb://127.0.0.1:27017/${databaseName}`;
qa\api-integration.cjs:31:  database = await mongoose.createConnection(uri, { serverSelectionTimeoutMS: 10000 }).asPromise();
qa\api-integration.cjs:33:  const tenants = ['A', 'B'].map((name) => ({ _id: new mongoose.Types.ObjectId(), name: `Test ${name}`, currency: 'PKR', domainType: 'retail', status: 'active', branchLimit: 1, branchCount: 0, defaultBranchId: null, featureFlags: features, taxProfile: { gstPercent: 0, reducedGstPercent: 0, serviceChargePercent: 0, otherCharges: [] }, invoicePrefix: 'TEST' }));
qa\api-integration.cjs:34:  await database.collection('tenants').insertMany(tenants);
qa\api-integration.cjs:35:  const owners = await Promise.all(tenants.map(async (tenant, index) => ({ _id: new mongoose.Types.ObjectId(), tenantId: tenant._id, name: `Owner ${index}`, email: `owner${index}@spec.test`, passwordHash: await bcrypt.hash('test-password-123', 4), pinHash: await bcrypt.hash('1234', 4), pinVersion: 0, sessionVersion: 0, pinRequiresChange: false, role: 'owner', isActive: true, superAdmin: false, branchIds: [] })));
qa\api-integration.cjs:36:  await database.collection('users').insertMany(owners);
qa\api-integration.cjs:38:  child = spawn(process.execPath, ['-r', path.join(root, 'qa/recovery-provider-hook.cjs'), 'dist/main.js'], { cwd: path.join(root, 'apps/api'), env: { ...process.env, PORT: String(port), MONGO_URI: uri, REDIS_URL: 'redis://127.0.0.1:6379/0', BULL_PREFIX: prefix, JWT_ACCESS_SECRET: randomBytes(32).toString('hex'), JWT_REFRESH_SECRET: randomBytes(32).toString('hex'), PLATFORM_DEVELOPER_EMAIL: 'developer@spec.test', PLATFORM_DEVELOPER_SETUP_TOKEN: setupToken, CORS_ORIGIN: 'http://localhost:5173', THROTTLE_LIMIT: '10000', SMTP_HOST: '127.0.0.1', SMTP_PORT: String(recoveryFixtures.smtpPort), SMTP_SECURE: 'false', SMTP_USER: 'test@spec.test', SMTP_PASSWORD: randomBytes(16).toString('hex'), SMTP_FROM: 'test@spec.test', TWILIO_ACCOUNT_SID: 'AC-test', TWILIO_AUTH_TOKEN: 'test-only', TWILIO_WHATSAPP_FROM: '+15005550006', TWILIO_WHATSAPP_CONTENT_SID: 'HX-test', RECOVERY_TEST_PROVIDER: recoveryFixtures.whatsappUrl }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
qa\api-integration.cjs:70:    assert.equal(await database.collection('orders').countDocuments({ tenantId: tenants[0]._id }), 1);
qa\api-integration.cjs:128:      await database.collection('tenants').updateOne({ _id: tenants[0]._id }, { $set: { 'featureFlags.inventory': false, 'featureFlags.pos': false } });
qa\api-integration.cjs:131:      await database.collection('tenants').updateOne({ _id: tenants[0]._id }, { $set: { 'featureFlags.barcodes': false } });
qa\api-integration.cjs:134:    } finally { await database.collection('tenants').updateOne({ _id: tenants[0]._id }, { $set: { 'featureFlags.inventory': true, 'featureFlags.pos': true, 'featureFlags.barcodes': true } }); }
qa\api-integration.cjs:184:    await database.collection('users').updateOne({ email }, { $unset: { securityCodeRequestedAt: 1 } });
qa\api-integration.cjs:198:    await database.collection('users').updateOne({ _id: owners[0]._id }, { $set: { phone: '+923001234567', phoneVerified: true, phoneVerifiedAt: null }, $unset: { securityCodeRequestedAt: 1 } });
qa\api-integration.cjs:204:    const stored = await database.collection('recoverychallenges').findOne({ challengeId: sent.data.challengeId });
qa\api-integration.cjs:211:    assert.equal((await database.collection('users').findOne({ _id: owners[0]._id })).phoneVerified, true);
qa\api-integration.cjs:225:    await database.collection('recoverychallenges').updateOne({ challengeId: expired.challengeId }, { $set: { expiresAt: new Date(0) } });
qa\api-integration.cjs:229:    await database.collection('users').updateOne({ _id: owners[0]._id }, { $set: { recoveryEmail: 'changed@spec.test', emailVerified: true, emailVerifiedAt: new Date() } });
qa\api-integration.cjs:231:    await database.collection('users').updateOne({ _id: owners[0]._id }, { $set: { recoveryEmail: null, emailVerified: false, emailVerifiedAt: null } });
qa\api-integration.cjs:235:    await database.collection('users').updateOne({ _id: owners[0]._id }, { $unset: { securityCodeRequestedAt: 1 } });
qa\api-integration.cjs:237:    assert.equal(await database.collection('recoverychallenges').countDocuments({ userId: owners[0]._id }), 0);
qa\api-integration.cjs:240:  await database.collection('users').insertOne({ tenantId: tenants[1]._id, name: 'Test platform admin', email: 'super@spec.test', passwordHash: await bcrypt.hash('test-password-123', 4), pinHash: await bcrypt.hash('1234', 4), role: 'owner', superAdmin: true, isActive: true, pinVersion: 0 });
qa\api-integration.cjs:248:      const account = await database.collection('users').findOne({ email }); assert.ok(await bcrypt.compare('updated-password-123', account.passwordHash));
qa\api-integration.cjs:256:    const account = await database.collection('users').findOne({ email: 'cashier@spec.test' });
qa\api-integration.cjs:257:    await database.collection('users').updateOne({ _id: account._id }, { $set: { phone: '+923001234568', phoneVerified: true, phoneVerifiedAt: new Date() } });
qa\api-integration.cjs:272:    await database.collection('users').updateOne({ email: owners[0].email }, { $unset: { securityCodeRequestedAt: 1 } });
qa\recovery-provider-hook.cjs:2:if (!/\/pos_spec_test_\d+_[a-f0-9]{8}$/.test(process.env.MONGO_URI || '') || !/^http:\/\/127\.0\.0\.1:\d+$/.test(process.env.RECOVERY_TEST_PROVIDER || '')) throw new Error('Recovery provider fixture requires a disposable test database and loopback sink.');
apps\pdf-worker\src\worker.ts:5:import { MongoClient } from 'mongodb';
apps\pdf-worker\src\worker.ts:13:  const mongo = new MongoClient(process.env.MONGO_URI || 'mongodb://localhost:27017/pos');
apps\pdf-worker\src\worker.ts:15:  const orders = mongo.db().collection('orders');
apps\api\src\common\pipes\parse-object-id.pipe.ts:2:import { isValidObjectId } from 'mongoose';
apps\api\src\common\pipes\parse-object-id.pipe.ts:5:export class ParseObjectIdPipe implements PipeTransform<string, string> {
apps\api\src\common\object-id.ts:1:import { Types } from 'mongoose';
apps\api\src\cli\init-super-admin.ts:1:import mongoose from 'mongoose';
apps\api\src\cli\init-super-admin.ts:4:  const mongoUri = process.env.MONGO_URI;
apps\api\src\cli\init-super-admin.ts:6:  if (!mongoUri) throw new Error('MONGO_URI is required');
apps\api\src\cli\init-super-admin.ts:9:  await mongoose.connect(mongoUri);
apps\api\src\cli\init-super-admin.ts:11:    const users = mongoose.connection.collection('users');
apps\api\src\cli\init-super-admin.ts:12:    await users.createIndex({ superAdmin: 1 }, {
apps\api\src\cli\init-super-admin.ts:29:    await mongoose.disconnect();
apps\api\src\modules\tenant\tenant.service.ts:2:import { InjectModel } from '@nestjs/mongoose';
apps\api\src\modules\tenant\tenant.service.ts:3:import { Model } from 'mongoose';
apps\api\src\modules\tenant\tenant.service.ts:10:  constructor(@InjectModel(Tenant.name) private readonly model: Model<Tenant>) {}
apps\api\src\app.module.ts:5:import { MongooseModule } from '@nestjs/mongoose';
apps\api\src\app.module.ts:37:      useFactory: (config: ConfigService) => ({ uri: config.getOrThrow<string>('MONGO_URI') }),
apps\api\src\modules\stock\stock.module.ts:2:import { InjectModel, MongooseModule, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
apps\api\src\modules\stock\stock.module.ts:4:import { IsMongoId, IsNumber, IsString, IsUUID, Length } from 'class-validator';
apps\api\src\modules\stock\stock.module.ts:5:import { Model, Types } from 'mongoose';
apps\api\src\modules\stock\stock.module.ts:25:class AdjustStockDto { @IsMongoId() productId: string; @IsUUID() idempotencyKey: string; @IsNumber({ maxDecimalPlaces: 3, allowNaN: false, allowInfinity: false }) delta: number; @IsString() @Length(3, 300) reason: string; }
apps\api\src\modules\stock\stock.module.ts:27:  constructor(@InjectModel(StockAdjustment.name) private readonly adjustments: Model<StockAdjustment>, private readonly products: ProductService) {}
apps\api\src\common\branch-scope.ts:2:import { Schema, Types } from 'mongoose';
apps\pdf-worker\src\queue\invoice.processor.ts:2:import { Collection, ObjectId } from 'mongodb';
apps\api\src\modules\report\report.service.ts:3:import { InjectModel } from '@nestjs/mongoose';
apps\api\src\modules\report\report.service.ts:4:import { Model } from 'mongoose';
apps\api\src\modules\report\report.service.ts:26:    @InjectModel(Order.name) private readonly orders: Model<OrderDocument>,
apps\api\src\modules\report\report.service.ts:55:      this.orders.aggregate([
apps\api\src\modules\report\report.service.ts:58:          $group: {
apps\api\src\modules\report\report.service.ts:68:      this.orders.aggregate([
apps\api\src\modules\report\report.service.ts:71:          $group: {
apps\api\src\modules\report\report.service.ts:79:      this.orders.aggregate([
apps\api\src\modules\report\report.service.ts:83:          $group: {
apps\api\src\modules\report\report.service.ts:93:      this.orders.aggregate([
apps\api\src\modules\report\report.service.ts:95:        { $group: { _id: '$paymentMode', orders: { $sum: 1 }, revenue: { $sum: '$grandTotal' } } },
apps\api\src\modules\report\report.module.ts:2:import { MongooseModule } from '@nestjs/mongoose';
apps\api\src\modules\installment\schemas\installment-sale.schema.ts:1:import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
apps\api\src\modules\installment\schemas\installment-sale.schema.ts:2:import { HydratedDocument, Types } from 'mongoose';
apps\api\src\modules\installment\schemas\installment-product.schema.ts:1:import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
apps\api\src\modules\installment\schemas\installment-product.schema.ts:2:import { HydratedDocument, Types } from 'mongoose';
apps\api\src\modules\installment\installment.module.ts:2:import { MongooseModule } from '@nestjs/mongoose';
apps\api\src\modules\tenant\tenant.module.ts:2:import { MongooseModule } from '@nestjs/mongoose';
apps\api\src\modules\installment\schemas\installment-plan.schema.ts:1:import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
apps\api\src\modules\installment\schemas\installment-plan.schema.ts:2:import { HydratedDocument, Types } from 'mongoose';
apps\api\src\modules\health\health.module.ts:2:import { InjectConnection } from '@nestjs/mongoose';
apps\api\src\modules\health\health.module.ts:3:import { Connection } from 'mongoose';
apps\api\src\modules\health\health.module.ts:9:  constructor(@InjectConnection() private readonly database: Connection) {}
apps\api\src\modules\installment\installment.controller.ts:8:import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
apps\api\src\modules\installment\installment.controller.ts:57:  findProduct(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string) {
apps\api\src\modules\installment\installment.controller.ts:69:  updateProduct(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string, @Body() dto: UpdateInstallmentProductDto) {
apps\api\src\modules\installment\installment.controller.ts:75:  removeProduct(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string) {
apps\api\src\modules\installment\installment.controller.ts:85:  findSale(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string) {
apps\api\src\modules\installment\installment.controller.ts:95:  paySale(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string, @Body() dto: RecordInstallmentSalePaymentDto) {
apps\api\src\modules\installment\installment.controller.ts:100:  findOne(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string) {
apps\api\src\modules\installment\installment.controller.ts:105:  pay(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string, @Body() dto: RecordPaymentDto) {
apps\api\src\modules\installment\installment.service.ts:3:import { InjectModel } from '@nestjs/mongoose';
apps\api\src\modules\installment\installment.service.ts:4:import { Model } from 'mongoose';
apps\api\src\modules\installment\installment.service.ts:45:    @InjectModel(InstallmentPlan.name) private readonly model: Model<InstallmentPlan>,
apps\api\src\modules\installment\installment.service.ts:46:    @InjectModel(InstallmentProduct.name) private readonly productModel: Model<InstallmentProduct>,
apps\api\src\modules\installment\installment.service.ts:47:    @InjectModel(InstallmentSale.name) private readonly saleModel: Model<InstallmentSale>,
apps\api\src\modules\installment\dto\installment.dto.ts:5:  IsIn, IsInt, IsMongoId, IsNumber, IsObject, IsOptional, IsString, Length, Matches, Max, MaxLength, Min, ValidateNested,
apps\api\src\modules\installment\dto\installment.dto.ts:13:  @ApiProperty() @IsMongoId() customerId: string;
apps\api\src\modules\installment\dto\installment.dto.ts:41:  @ApiPropertyOptional() @IsOptional() @IsMongoId() customerId?: string;
apps\api\src\modules\installment\dto\installment.dto.ts:71:  @ApiProperty() @IsMongoId() customerId: string;
apps\api\src\modules\installment\dto\installment.dto.ts:72:  @ApiProperty() @IsMongoId() installmentProductId: string;
apps\api\src\modules\installment\dto\installment.dto.ts:91:  @ApiPropertyOptional() @IsOptional() @IsMongoId() customerId?: string;
apps\api\src\modules\developer\developer.controller.ts:9:import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
apps\api\src\modules\developer\developer.controller.ts:39:    @Param('id', ParseObjectIdPipe) id: string,
apps\api\src\modules\developer\developer.controller.ts:48:    @Param('id', ParseObjectIdPipe) id: string,
apps\api\src\modules\developer\developer.controller.ts:86:    @Param('id', ParseObjectIdPipe) id: string,
apps\api\src\modules\developer\developer.controller.ts:95:    @Param('id', ParseObjectIdPipe) id: string,
apps\api\src\modules\developer\developer.controller.ts:109:    @Param('id', ParseObjectIdPipe) id: string,
apps\api\src\modules\developer\developer.controller.ts:118:    @Param('id', ParseObjectIdPipe) id: string,
apps\api\src\modules\developer\developer.controller.ts:137:    @Param('id', ParseObjectIdPipe) id: string,
apps\api\src\modules\tenant\schemas\tenant.schema.ts:1:import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
apps\api\src\modules\tenant\schemas\tenant.schema.ts:2:import { HydratedDocument, Types } from 'mongoose';
apps\api\src\modules\product\schemas\product.schema.ts:1:import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
apps\api\src\modules\product\schemas\product.schema.ts:2:import { HydratedDocument, Types } from 'mongoose';
apps\api\src\modules\customer\schemas\customer.schema.ts:1:import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
apps\api\src\modules\customer\schemas\customer.schema.ts:2:import { HydratedDocument, Types } from 'mongoose';
apps\api\src\modules\product\product.service.ts:2:import { InjectModel } from '@nestjs/mongoose';
apps\api\src\modules\product\product.service.ts:3:import { Model } from 'mongoose';
apps\api\src\modules\product\product.service.ts:11:  constructor(@InjectModel(Product.name) private readonly model: Model<Product>) {}
apps\api\src\modules\product\product.service.ts:112:      { $inc: { stockQty: -qty } },
apps\api\src\modules\product\product.service.ts:118:    await this.model.updateOne({ _id: productId, tenantId: oid(tenantId) }, { $inc: { stockQty: qty } });
apps\api\src\modules\product\product.service.ts:123:    const result = await this.model.updateOne({ _id: productId, tenantId: oid(tenantId), restoredSaleEvents: { $ne: event } }, { $inc: { stockQty: qty }, $addToSet: { restoredSaleEvents: event } });
apps\api\src\modules\product\product.service.ts:128:    const updated = await this.model.findOneAndUpdate({ _id: productId, tenantId: oid(tenantId), stockAdjustmentEvents: { $ne: key }, ...(delta < 0 ? { stockQty: { $gte: -delta } } : {}) }, { $inc: { stockQty: delta }, $addToSet: { stockAdjustmentEvents: key } }, { new: true });
apps\api\src\modules\invoice\invoice.service.ts:4:import { InjectModel } from '@nestjs/mongoose';
apps\api\src\modules\invoice\invoice.service.ts:8:import { Model } from 'mongoose';
apps\api\src\modules\invoice\invoice.service.ts:22:    @InjectModel(Order.name) private readonly orders: Model<Order>,
apps\api\src\modules\product\product.module.ts:2:import { MongooseModule } from '@nestjs/mongoose';
apps\api\src\modules\product\product.controller.ts:8:import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
apps\api\src\modules\product\product.controller.ts:26:  findOne(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string) {
apps\api\src\modules\product\product.controller.ts:47:  update(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string, @Body() dto: UpdateProductDto) {
apps\api\src\modules\product\product.controller.ts:54:  remove(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string) {
apps\api\src\modules\invoice\invoice.module.ts:3:import { MongooseModule } from '@nestjs/mongoose';
apps\api\src\modules\customer\customer.service.ts:2:import { InjectModel } from '@nestjs/mongoose';
apps\api\src\modules\customer\customer.service.ts:3:import { Model } from 'mongoose';
apps\api\src\modules\customer\customer.service.ts:10:  constructor(@InjectModel(Customer.name) private readonly model: Model<Customer>) {}
apps\api\src\modules\invoice\invoice.controller.ts:10:import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
apps\api\src\modules\invoice\invoice.controller.ts:22:  async status(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string) {
apps\api\src\modules\invoice\invoice.controller.ts:28:  async pdf(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string) {
apps\api\src\modules\invoice\invoice.controller.ts:40:  regenerate(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string) {
apps\api\src\modules\customer\customer.module.ts:2:import { MongooseModule } from '@nestjs/mongoose';
apps\api\src\modules\customer\customer.controller.ts:6:import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
apps\api\src\modules\customer\customer.controller.ts:23:  findOne(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string) {
apps\api\src\modules\customer\customer.controller.ts:33:  update(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string, @Body() dto: UpdateCustomerDto) {
apps\api\src\modules\super-admin\schemas\subscription-plan.schema.ts:1:import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
apps\api\src\modules\super-admin\schemas\subscription-plan.schema.ts:2:import { HydratedDocument } from 'mongoose';
apps\api\src\modules\super-admin\super-admin.service.ts:3:import { InjectModel } from '@nestjs/mongoose';
apps\api\src\modules\super-admin\super-admin.service.ts:5:import { Model, Types } from 'mongoose';
apps\api\src\modules\super-admin\super-admin.service.ts:23:    @InjectModel(Tenant.name) private readonly tenants: Model<Tenant>,
apps\api\src\modules\super-admin\super-admin.service.ts:24:    @InjectModel(User.name) private readonly users: Model<User>,
apps\api\src\modules\super-admin\super-admin.service.ts:25:    @InjectModel(SubscriptionPlan.name) private readonly plans: Model<SubscriptionPlan>,
apps\api\src\modules\super-admin\super-admin.service.ts:26:    @InjectModel(AdminAudit.name) private readonly audits: Model<AdminAudit>,
apps\api\src\modules\super-admin\super-admin.service.ts:27:    @InjectModel(PlatformModule.name) private readonly platformModules: Model<PlatformModule>,
apps\api\src\modules\branch\branch.module.ts:3:import { InjectModel, MongooseModule, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
apps\api\src\modules\branch\branch.module.ts:6:import { Model, Types } from 'mongoose';
apps\api\src\modules\branch\branch.module.ts:12:import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
apps\api\src\modules\branch\branch.module.ts:30:  constructor(@InjectModel(Branch.name) private readonly branches: Model<Branch>, @InjectModel(Tenant.name) private readonly tenants: Model<Tenant>) {}
apps\api\src\modules\branch\branch.module.ts:35:    const tenant = await this.tenants.findOneAndUpdate({ _id: user.tenantId, $expr: { $lt: [{ $ifNull: ['$branchCount', 0] }, { $ifNull: ['$branchLimit', 1] }] } }, { $inc: { branchCount: 1 } }, { new: true });
apps\api\src\modules\branch\branch.module.ts:41:    } catch (error) { await this.tenants.updateOne({ _id: tenant._id }, { $inc: { branchCount: -1 } }); if ((error as { code?: number }).code === 11000) throw new ConflictException('Branch code already exists'); throw error; }
apps\api\src\modules\branch\branch.module.ts:65:  @Patch(':id') @Roles(Role.Owner, Role.Admin) update(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string, @Body() dto: UpdateBranchDto) { return this.branches.update(user, id, dto); }
apps\api\src\modules\super-admin\schemas\platform-module.schema.ts:1:import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
apps\api\src\modules\super-admin\schemas\platform-module.schema.ts:2:import { HydratedDocument } from 'mongoose';
apps\api\src\modules\super-admin\super-admin.module.ts:2:import { MongooseModule } from '@nestjs/mongoose';
apps\api\src\modules\super-admin\schemas\admin-audit.schema.ts:1:import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
apps\api\src\modules\super-admin\schemas\admin-audit.schema.ts:2:import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
apps\api\src\modules\order\schemas\order.schema.ts:1:import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
apps\api\src\modules\order\schemas\order.schema.ts:2:import { HydratedDocument, Types } from 'mongoose';
apps\api\src\modules\super-admin\super-admin.controller.ts:7:import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
apps\api\src\modules\super-admin\super-admin.controller.ts:37:    @Param('id', ParseObjectIdPipe) id: string,
apps\api\src\modules\super-admin\super-admin.controller.ts:46:    @Param('id', ParseObjectIdPipe) id: string,
apps\api\src\modules\order\schemas\invoice-counter.schema.ts:1:import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
apps\api\src\modules\order\schemas\invoice-counter.schema.ts:2:import { Types } from 'mongoose';
apps\api\src\modules\order\schemas\checkout-request.schema.ts:1:import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
apps\api\src\modules\order\schemas\checkout-request.schema.ts:2:import { Types } from 'mongoose';
apps\api\src\modules\super-admin\dto\super-admin.dto.ts:4:  IsBoolean, IsEmail, IsEnum, IsMongoId, IsNumber, IsObject, IsOptional, IsString, Length, Max,
apps\api\src\modules\super-admin\dto\super-admin.dto.ts:43:  @IsOptional() @IsMongoId() initialPlanId?: string;
apps\api\src\modules\super-admin\dto\super-admin.dto.ts:76:  @IsMongoId() subscriptionPlanId: string;
apps\api\src\modules\order\order.service.ts:3:import { InjectModel } from '@nestjs/mongoose';
apps\api\src\modules\order\order.service.ts:4:import { Model } from 'mongoose';
apps\api\src\modules\order\order.service.ts:25:    @InjectModel(Order.name) private readonly orders: Model<Order>,
apps\api\src\modules\order\order.service.ts:26:    @InjectModel(InvoiceCounter.name) private readonly counters: Model<InvoiceCounter>,
apps\api\src\modules\order\order.service.ts:27:    @InjectModel(CheckoutRequest.name) private readonly checkouts: Model<CheckoutRequest>,
apps\api\src\modules\order\order.service.ts:177:      this.orders.aggregate([
apps\api\src\modules\order\order.service.ts:179:        { $group: { _id: null, revenue: { $sum: '$grandTotal' }, orders: { $sum: 1 }, tax: { $sum: '$taxTotal' }, discounts: { $sum: '$discountTotal' } } },
apps\api\src\modules\order\order.service.ts:181:      this.orders.aggregate([
apps\api\src\modules\order\order.service.ts:183:        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone } }, revenue: { $sum: '$grandTotal' }, orders: { $sum: 1 } } },
apps\api\src\modules\order\order.service.ts:186:      this.orders.aggregate([
apps\api\src\modules\order\order.service.ts:189:        { $group: { _id: '$items.productId', name: { $first: '$items.name' }, qty: { $sum: '$items.qty' }, revenue: { $sum: '$items.lineTotal' } } },
apps\api\src\modules\order\order.service.ts:226:      { $inc: { lastNumber: 1 } },
apps\api\src\modules\barcode\barcode.dto.ts:3:import { IsBoolean, IsIn, IsInt, IsMongoId, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
apps\api\src\modules\barcode\barcode.dto.ts:10:  @ApiPropertyOptional() @IsOptional() @IsMongoId() productId?: string;
apps\api\src\modules\order\dto\order.dto.ts:4:  ArrayMaxSize, ArrayMinSize, IsArray, IsDefined, IsEnum, IsMongoId, IsNumber, IsOptional, IsString, Max, MaxLength, Min,
apps\api\src\modules\order\dto\order.dto.ts:11:  @ApiProperty() @IsMongoId() productId: string;
apps\api\src\modules\order\order.module.ts:2:import { MongooseModule } from '@nestjs/mongoose';
apps\api\src\modules\auth\schemas\user.schema.ts:1:import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
apps\api\src\modules\auth\schemas\user.schema.ts:2:import { HydratedDocument, Types } from 'mongoose';
apps\api\src\modules\order\order.controller.ts:8:import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
apps\api\src\modules\order\order.controller.ts:44:  findOne(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string) {
apps\api\src\modules\order\order.controller.ts:50:  void(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string) {
apps\api\src\modules\order\order.controller.ts:55:  refund(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string, @Body() dto: RefundOrderDto) { return this.orders.refund(user, id, dto.reason); }
apps\api\src\modules\auth\recovery.service.ts:3:import { InjectModel } from '@nestjs/mongoose';
apps\api\src\modules\auth\recovery.service.ts:4:import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
apps\api\src\modules\auth\recovery.service.ts:5:import { Model, Types } from 'mongoose';
apps\api\src\modules\auth\recovery.service.ts:29:  constructor(@InjectModel(User.name) private readonly users: Model<User>, @InjectModel(RecoveryChallenge.name) private readonly challenges: Model<RecoveryChallenge>, private readonly config: ConfigService, private readonly email: EmailService) {}
apps\api\src\modules\auth\recovery.service.ts:86:    const challenge = await this.challenges.findOneAndUpdate({ challengeId: dto.challengeId, expiresAt: { $gt: new Date() }, attempts: { $lt: 5 }, ...(phoneUserId ? { userId: new Types.ObjectId(phoneUserId), purpose: 'phone-verification' } : { purpose: { $ne: 'phone-verification' } }) }, { $inc: { attempts: 1 } }, { new: true }).select('+codeHash');
apps\api\src\modules\auth\recovery.service.ts:100:    const updated = await this.users.updateOne({ _id: user._id, isActive: true, ...this.versions(challenge), email: user.email, recoveryEmail: user.recoveryEmail ?? null, phone: user.phone ?? null, emailVerifiedAt: user.emailVerifiedAt ?? null, phoneVerifiedAt: user.phoneVerifiedAt ?? null }, { $set: { [field]: hash, pinFailedAttempts: 0, pinLockedUntil: null, ...(field === 'pinHash' ? { pinRequiresChange: false, pinEnabled: true } : {}) }, $inc: { sessionVersion: 1, developerSessionVersion: 1, pinVersion: 1 }, $unset: { pinChallengeId: 1, pinResetCodeHash: 1, pinResetExpiresAt: 1, emailVerificationCodeHash: 1, emailVerificationExpiresAt: 1 } });
apps\api\src\modules\auth\dto\auth.dto.ts:2:import { ArrayMaxSize, IsArray, IsBoolean, IsEmail, IsEnum, IsIn, IsMongoId, IsOptional, IsString, Length, Matches, MaxLength, MinLength } from 'class-validator';
apps\api\src\modules\auth\dto\auth.dto.ts:69:  @IsOptional() @IsArray() @ArrayMaxSize(100) @IsMongoId({ each: true }) branchIds?: string[];
apps\api\src\modules\auth\dto\auth.dto.ts:81:  @IsOptional() @IsArray() @ArrayMaxSize(100) @IsMongoId({ each: true }) branchIds?: string[];
apps\api\src\modules\auth\dto\auth.dto.ts:116:  @ApiProperty() @IsMongoId() staffId: string;
apps\api\src\modules\audit\audit.module.ts:3:import { InjectModel, MongooseModule, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
apps\api\src\modules\audit\audit.module.ts:5:import { Model, Types } from 'mongoose';
apps\api\src\modules\audit\audit.module.ts:25:  constructor(@InjectModel(AuditEvent.name) private readonly events: Model<AuditEvent>) {}
apps\api\src\modules\auth\jwt.strategy.ts:1:import { InjectModel } from '@nestjs/mongoose';
apps\api\src\modules\auth\jwt.strategy.ts:5:import { Model } from 'mongoose';
apps\api\src\modules\auth\jwt.strategy.ts:21:    @InjectModel(User.name) private readonly users: Model<User>,
apps\api\src\modules\auth\auth.module.ts:3:import { MongooseModule } from '@nestjs/mongoose';
apps\api\src\modules\auth\password-recovery.service.ts:10:import { InjectModel } from "@nestjs/mongoose";
apps\api\src\modules\auth\password-recovery.service.ts:11:import { Model, Schema, Types } from "mongoose";
apps\api\src\modules\auth\password-recovery.service.ts:98:    @InjectModel(User.name) private readonly users: Model<User>,
apps\api\src\modules\auth\password-recovery.service.ts:105:    this.tokens = userModel.collection.conn.collection('password_reset_tokens') as never as {
apps\api\src\modules\auth\password-recovery.service.ts:109:    this.codes = userModel.collection.conn.collection('recovery_codes') as never as {
apps\api\src\modules\auth\password-recovery.service.ts:124:    return this.users.collection.conn.collection('password_reset_tokens');
apps\api\src\modules\auth\password-recovery.service.ts:128:    return this.users.collection.conn.collection('recovery_codes');
apps\api\src\modules\auth\password-recovery.service.ts:190:        $inc: { sessionVersion: 1, developerSessionVersion: 1, pinVersion: 1 },
apps\api\src\modules\auth\password-recovery.service.ts:254:        $inc: { sessionVersion: 1, developerSessionVersion: 1, pinVersion: 1 },
apps\api\src\modules\auth\password-recovery.service.ts:297:        $inc: { sessionVersion: 1, developerSessionVersion: 1, pinVersion: 1 },
apps\api\src\modules\auth\auth.controller.ts:2:import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
apps\api\src\modules\auth\auth.controller.ts:125:  updateStaffRights(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string, @Body() dto: UpdateStaffRightsDto) {
apps\api\src\modules\auth\auth.controller.ts:130:  updateStaffStatus(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string, @Body() dto: UpdateStaffStatusDto) { return this.auth.updateStaffStatus(user, id, dto.isActive); }
apps\api\src\modules\auth\auth.service.ts:7:import { InjectModel } from '@nestjs/mongoose';
apps\api\src\modules\auth\auth.service.ts:10:import { Model } from 'mongoose';
apps\api\src\modules\auth\auth.service.ts:37:    @InjectModel(User.name) private readonly users: Model<User>,
apps\api\src\modules\auth\auth.service.ts:133:      await this.users.updateOne({ _id: user._id }, { $inc: { pinFailedAttempts: 1 }, ...(failed >= 5 ? { $set: { pinLockedUntil: new Date(Date.now() + 15 * 60_000) } } : {}) });
apps\api\src\modules\auth\auth.service.ts:162:    await this.users.updateOne({ _id: user._id }, { $inc: { developerSessionVersion: 1 } });
apps\api\src\modules\auth\auth.service.ts:222:        ...(dto.newPin ? { $inc: { pinVersion: 1 } } : {}),
apps\api\src\modules\auth\auth.service.ts:323:    const staff = await this.users.findOneAndUpdate({ _id: staffId, tenantId: oid(actor.tenantId), role: { $ne: Role.Owner }, superAdmin: { $ne: true } }, { $set: { isActive }, $inc: { sessionVersion: 1 } }, { new: true });
apps\api\src\modules\auth\auth.service.ts:329:    await this.users.updateOne({ _id: userId }, { $inc: { sessionVersion: 1, developerSessionVersion: 1 } });
apps\api\src\modules\auth\auth.service.ts:345:        $inc: { sessionVersion: 1, developerSessionVersion: 1, pinVersion: 1 },
apps\api\src\modules\auth\recovery.module.ts:2:import { MongooseModule } from '@nestjs/mongoose';
```

Deployment/configuration dependencies: `docker-compose.yml`, `docker-compose.prod.yml`, `.env.example`, application environment examples, API/PDF-worker package manifests and lockfiles, Dockerfiles, `.github/workflows/ci.yml`, `scripts/seed.ts`, `docs/erd.md` and `docs/api-spec.yaml`. Existing CI integration fixtures use disposable MongoDB databases and must be ported to isolated PostgreSQL databases. Runtime health checks also depend on the Mongoose connection.

<a id="ref-27"></a>

## Reference: `docs/migration/04-data-profile.md`

## Initial live data profile

Read-only discovery ran on 2026-11-15 against the existing local Compose MongoDB.
The exact timestamp, counts, observed top-level BSON types, index metadata and
relationship results are in [data-profile.json](migration/reports/data-profile.json).

The server exposes `admin`, `config`, `local` and `pos`. System databases are not
business migration targets. `pos` is the only application database discovered.

| Collection | Documents |
| --- | ---: |
| adminaudits | 45 |
| auditevents | 413 |
| branches | 0 |
| checkoutrequests | 6 |
| customers | 4 |
| installmentplans | 5 |
| installmentproducts | 0 |
| installmentsales | 0 |
| invoicecounters | 2 |
| orders | 23 |
| products | 9 |
| recoverychallenges | 0 |
| stockadjustments | 0 |
| subscriptionplans | 2 |
| tenants | 3 |
| users | 5 |

The three tenant records are source identities, not automatically three client
installations. Explicit mapping must distinguish business ownership and any
platform account tenant before distribution. No source tenant is discarded.

### Repeat discovery (PowerShell, repository root)

```powershell
Get-Content scripts/migration/profile-mongodb.js -Raw |
  docker compose exec -T mongo mongosh --quiet --file /dev/stdin
```

The script does not load Mongoose models or trigger index creation. It performs
database/collection listing, counts, index reads and aggregation without `$out`
or `$merge`. It emits no document values, hashes, credentials or customer samples.
Aggregation operations have a 60-second time limit. Run with a database account
limited to read/metadata permissions when the installation has authentication.

This is an initial live profile, not a consistent backup. Concurrent writes can
change counts between operations. The report is not sufficient evidence for
cutover. Nested array schemas, exact monetary values, duplicate business keys,
special BSON values inside nested fields and file integrity still require
dedicated profiling. No source-to-target reconciliation has occurred.

<a id="ref-28"></a>

## Reference: `docs/migration/05-data-quality-report.md`

## Initial data quality findings

Evidence: [live metadata](migration/reports/data-profile.json), collected 2026-11-15.

### Checks performed

Reference checks cover observed tenant and branch references, order cashiers and
line-item products, installment plan orders/customers, installment-sale
customers/products, stock products, subscription plans, user branch assignments,
admin-audit actors and recovery-challenge users. No missing targets or
cross-tenant targets were found in these checks. Null/missing references and
empty arrays are excluded; zero findings are not proof of complete integrity.

### Findings requiring explicit schema handling

- Branches are empty despite three tenants. Do not manufacture historical branch
  records or require non-null branch references during import.
- Thirteen orders have no customer snapshot; seventeen lack an idempotency key;
  one lacks an invoice PDF path. These are not grounds for discarding sales.
- Optional customer address/CNIC/guarantor and product SKU/category/attributes
  fields are missing in some documents. Missing and null must not be silently
  converted into fabricated values.
- Five legacy installment plans exist while the separate installment product
  and sale collections are empty. Both model families are referenced by code;
  do not collapse one into the other without explicit field mapping.
- Three users have no branchIds field. Authentication must preserve legacy
  permission semantics rather than treating migration defaults as new grants.
- Code refers to platform modules, password_reset_tokens and recovery_codes,
  which were not present in the live collection list. Absence in this snapshot
  does not justify deleting support or assuming other installations are empty.

### Open checks / cutover blockers

1. Business-to-client-PC mapping and control-plane host have not been supplied.
2. Nested BSON types, array element validity, date-only values and optional-field
   semantics require full profiling against the final source snapshot.
3. Duplicate business-key checks beyond existing index metadata remain pending.
4. Exact-decimal monetary, inventory and payment reconciliation is pending.
5. Full backup/restore, file and Redis job reconciliation are not yet verified.
6. The pre-existing backend password recovery compile errors need resolution
   before a reliable source/target regression baseline can be established.

No rows were repaired, invented, transferred or deleted. No acceptance criterion
for PostgreSQL cutover is claimed as passed.

<a id="ref-29"></a>

## Reference: `docs/migration/07-etl-guide.md`

## PostgreSQL staging transfer

### Scope

The current engine copies **all discovered application documents** into isolated
PostgreSQL staging databases. It preserves the raw BSON bytes and verifies SHA-256
checksums in PostgreSQL and against a second MongoDB read. It does not yet convert
those records into the final normalized application schema, migrate file contents,
drain Redis jobs, replace API repositories or switch the worker runtime.

Staging BSON is deliberate preservation evidence, not the proposed runtime data
model. Financial fields still need normalized NUMERIC columns and exact-decimal
reconciliation before runtime cutover. Do not serve production from staging tables.

### Isolation and installation

`docker-compose.postgres-staging.yml` starts a separate PostgreSQL Compose project
on loopback port 55432, with a dedicated persistent volume. It uses an image pinned
by digest and mounts `/var/lib/postgresql` as required by the PostgreSQL 18 official
image. See the [official image documentation](https://hub.docker.com/_/postgres).

The admin password is generated locally in ignored
`storage/postgresql-staging/password` and mounted as a Compose secret. Do not commit,
print or share it. The migration account is an administrator only on this staging
server. Per-business least-privilege runtime credentials are not yet provisioned.

```powershell
npm --prefix scripts/migration ci --ignore-scripts
docker compose -f docker-compose.postgres-staging.yml up -d --wait
npm --prefix scripts/migration test
node scripts/migration/stage-postgresql.cjs --dry-run
node scripts/migration/stage-postgresql.cjs --staging
```

The local secret must exist before starting a fresh installation. Generate it
with a cryptographically secure random generator; never use a sample password.

The source defaults to the audited local `mongodb://127.0.0.1:27017/pos`; override
with `MIGRATION_MONGO_URI` in the process environment when necessary. The target
endpoint is deliberately fixed to this isolated local staging server. The script
does not support arbitrary production destination URLs.

### Routing and resume behavior

- `pos_stage_control` holds subscription plans, platform modules and admin audits.
- `pos_stage_<original tenant ObjectId>` holds each tenant and its business records,
  including that business's users, hashes and recovery data.
- Recovery side-collections without tenant IDs resolve ownership through users.
- Unknown collections, unknown tenants and unresolved ownership abort the run.
- Source records use `(collection_name, legacy_id)` as a staging identity. Inserts
  are idempotent; an existing different checksum aborts rather than overwriting.
- Collection manifests retain empty collections and expected counts.
- Existing target databases must carry a matching staging identity. A database
  left unmarked by an interruption during initial provisioning requires operator
  review; the tool will not guess its ownership.

MongoDB remains unchanged. Live reads are not a point-in-time snapshot. Two-pass
checks catch many concurrent changes but cannot establish a single global snapshot.
A final approved write freeze and snapshot-based import/reconciliation are required
before cutover. Do not reuse this staging report as production acceptance evidence.

### Validation and recovery

The engine checks target record counts, stored bytes against stored hashes, and
second-pass source hashes. It rejects deleted/stale target records through count
mismatches. Rerunning an unchanged source is supported and verified locally.

No drop, truncate, source update or source delete operations are implemented. If a
source changes after capture, preserve the staging database and inspect the change;
do not clear it to force a green report. A future snapshot-run registry must support
multiple source snapshots explicitly before repeated production rehearsal.

Retain MongoDB volumes and invoice files. No production connection was changed;
there is therefore no production cutover to roll back at this stage.

<a id="ref-30"></a>

## Reference: `docs/migration/08-reconciliation-report.md`

## Staging reconciliation status

Date: 2026-11-15. Machine-readable results:
[staging-reconciliation.json](migration/reports/staging-reconciliation.json).

- 16 source collections discovered.
- 519 documents captured and verified in the initial successful staging run.
- Four PostgreSQL staging databases: three business databases and one control plane.
- Each record's PostgreSQL BSON checksum matched its source checksum.
- Counts matched across routed destinations for every source collection.
- Routing, unknown ownership, recovery ownership and database-name validation tests
  passed (four tests). An additional live PostgreSQL test verifies raw BSON
  round trips for Decimal128, Int64, dates, binary, null and missing fields.

The earlier profile counted 517 documents. The source remained live and contained
519 when staging ran; the engine reads current source data rather than treating
the earlier count as an immutable manifest. This reinforces the need for a write
freeze or consistent backup during the final approved cutover.

### Not yet accepted

This is **lossless staging verification only**, not a completed runtime migration.
Normalized financial reconciliation, SQL foreign keys, application authentication,
authorization, concurrent sales, worker behavior, offline startup and backup/restore
validation have not passed against PostgreSQL. The API and PDF worker still use
MongoDB in the running deployment. The new PostgreSQL invoice adapter and worker
path now pass a local integration test with a real generated PDF, tenant isolation,
generation ordering, restricted permissions and API HTTP-503 error propagation.
This covers invoice metadata only. PostgreSQL-only production acceptance remains
pending for all other business domains.

### API baseline repair

The existing password recovery service's duplicate user-model declaration and
obsolete constructor fragment were removed. Missing 15-minute reset and 24-hour
enrollment constants now match the service's documented behavior; the owner-role
query uses the existing enum. API TypeScript checking passes after these repairs.
These changes do not switch the database provider or deploy the API.

<a id="ref-31"></a>

## Reference: `docs/migration/09-hybrid-invoices.md`

## PostgreSQL-authoritative invoices

### Implemented boundary

The shared `@pos/invoice-store` package makes PostgreSQL authoritative for invoice
status, PDF file references and regeneration generations. The API still authorizes
access through its business-scoped MongoDB order queries before reading PostgreSQL.
The PDF worker in PostgreSQL mode does not open a MongoDB connection.

Sales, products, inventory, installments, users and licensing still use MongoDB.
The 519-document BSON preservation copy is a staging artifact, not a relational
replacement for those services. Complete MongoDB removal has not been implemented.

Each business has its own `pos_invoice_<tenant-id>` database, login and restricted
role. The schema enforces that invoice rows reference the database's single business
identity. Runtime roles can read business identity and select/insert/update invoice
state; they cannot delete rows, create databases or change the business identity.
Business-to-connection mappings are loaded from a private, operator-controlled file.
Requests and jobs cannot choose connection strings. Pools are limited to two
connections per configured business, with at most 32 businesses per registry.

### Source of truth and job handling

- Both API and worker must use the same `INVOICE_STORE` mode and registry.
- Configuring a registry selects PostgreSQL unless an explicit mode overrides it.
  Without either setting, MongoDB mode preserves existing installations.
- In PostgreSQL mode, reads use PostgreSQL state. An absent row may be initialized
  from an already-authorized MongoDB order; existing SQL rows are never overwritten
  by that initialization.
- PostgreSQL outages fail invoice reads with HTTP 503. There is no automatic
  fallback to stale MongoDB invoice status. A completed sale is not undone because
  PDF queuing or status persistence fails; regeneration is the recovery operation.
- Every regeneration receives a new generation token. A worker may complete only
  that pending generation. Old completion/failure callbacks cannot overwrite a
  newer generation or change a completed invoice to failed.
- Generated filenames include the generation token in PostgreSQL mode, preventing
  an older job from replacing the bytes referenced by the current generation.
- Old jobs without a generation token must be drained before activation or
  regenerated through the API. Do not blindly replay old jobs into the new store.
- Newly created businesses must be explicitly provisioned and added to both
  registries before invoice processing; application startup never creates databases.

### Local preparation and validation

```powershell
docker compose -f docker-compose.postgres-staging.yml up -d --wait
node scripts/migration/prepare-invoice-store.cjs --prepare
npm run build
node --test qa/postgres-invoices.test.cjs
```

Preparation reads checksummed staged orders and initializes missing SQL invoice
rows. It does not overwrite existing SQL status. The generated private registry
files are under ignored `storage/postgresql-staging/`:

- `invoice-databases.json`: local Node processes on port 55432.
- `invoice-databases.docker.json`: containers on the private PostgreSQL network.

The script is intentionally limited to the isolated local server used for this
migration rehearsal. It is not a general remote client installer. Client-PC
distribution and independent backups remain separate deployment work.

For local Node development, set `INVOICE_STORE=postgres` and
`INVOICE_DATABASES_FILE` to the absolute path of the local registry for **both**
processes. Never commit either registry or put passwords in frontend configuration.

### Activation gate

Production activation has not been performed. Before changing the live processes:

1. Verify database and invoice-file backups and test restoration.
2. Pause invoice regeneration and drain existing invoice jobs.
3. Refresh and reconcile invoice metadata against the final source state. The
   preparation script's staged source may be older than the live MongoDB data.
4. Verify all active businesses have matching identities and usable runtime logins.
5. Build and validate API/worker images together, then obtain the explicit cutover
   approval required by the migration instructions.

The prepared Compose overlay is applied with:

```powershell
docker compose -f docker-compose.yml -f docker-compose.postgres-invoices.yml up -d --build api pdf-worker
```

The external PostgreSQL network must already exist. This changes invoice persistence
only; it retains MongoDB and its volumes for the other services. New installations
still require normal provisioning and secret setup; this overlay is not a standalone
installer.

### Rollback

Stop invoice writers first. Preserve SQL invoice status, generation records and PDF
files. Reconcile SQL-generated paths/status back into MongoDB before enabling legacy
mode; otherwise successful PostgreSQL invoices become invisible to the legacy API.
Never simply change the mode while jobs are active or discard post-switch records.

### Remaining work

Normalized business/financial SQL schemas, transactional sale and stock repositories,
PostgreSQL authentication, automated new-business provisioning, backup/restore
rehearsal and full client installation migration are still pending. Do not remove
MongoDB application dependencies yet.

### Verification completed on 2026-11-15

- API unit suites: 46 tests passed.
- Renderer and installment invoice-view regressions: four tests passed.
- Migration routing and exact BSON round-trip tests: five tests passed.
- PostgreSQL integration: one test passed, including real PDF generation, API
  reads, cross-business isolation, limited role permissions, stale generation
  protection, legacy-job rejection and HTTP-503 propagation on store failure.
- API, worker and web compiled successfully; API and worker Docker images built.
- The worker image generated a valid PDF with its bundled Chromium runtime.
- Compose overlay configuration validated; private connection registries remain
  ignored by Git. Live API/worker containers were not recreated or switched.

Two pre-existing build blockers were repaired during verification: installment
invoice views now use their already-plain result, and worker paper-size annotations
use the installed Puppeteer `PaperFormat` type. The web build still reports its
existing large-chunk warning. Image dependency installation reports 20 audit
findings (four low, sixteen moderate); dependency remediation was not performed.

<a id="ref-32"></a>

## Reference: `docs/migration/POSTGRESQL_MIGRATION_PLAN.md`

## PostgreSQL Migration Plan (STEP 4)

**Date:** 2026-11-17\
**Objective:** Migrate primary data store from MongoDB to PostgreSQL while preserving all existing customer data, modules, routes, permissions, and UIs.

### 1. Migration Principles

1. **Never delete MongoDB data automatically** — backups required before every step
2. **Idempotent ETL scripts** — safe to retry
3. **Controlled cutover** — feature flags, dual-write period, verification gates
4. **Documented rollback** — at every checkpoint
5. **Zero-downtime target** — dual-write allows read from MongoDB while writing to both

### 2. Migration Phases

#### Phase 0: Preparation (Checkpoint CP-0)

**Goal:** Establish PostgreSQL infrastructure, backup strategy, and migration tooling.

**Tasks:**
- [ ] Provision PostgreSQL 16 instance (local dev + Docker + staging)
- [ ] Create `packages/config/` configuration schema with validation
- [ ] Write `scripts/migrate/` ETL skeleton (idempotent, field-by-field mapping)

#### Phase 1: Schema and Dual-Write (Checkpoint CP-1)

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

#### Phase 2: Transactional Data Migration (Checkpoint CP-2)


#### Phase 3: Cutover (Checkpoint CP-3)

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

#### Phase 4: Decommission (Checkpoint CP-4)

**Goal:** MongoDB no longer used by the application.


### 3. Field-by-Field Migration Mapping

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

### 5. Verification Checks

| Check | Method | Pass Criteria |
|-------|--------|---------------|
| Record counts | `SELECT count(*)` vs MongoDB `countDocuments()` | Exact match |
| Financial totals | `SUM(grand_total)` vs MongoDB aggregation | Exact match (2 decimal places) |
| Referential integrity | FK constraint check, orphan scan | Zero orphans |
| Sample records | Field-by-field comparison of 10 random records per table | Exact match |
| Invoice numbering | Counter values match | Exact match |
| Idempotency keys | Unique constraint enforcement | No duplicates |
| API regression | Full test suite against PostgreSQL | 100% pass |

### 6. Rollback Procedures

#### Rollback at CP-0 or CP-1
Stop API, revert code to pre-dual-write version. Drop PostgreSQL tables or leave as standby. Restart API (MongoDB only).

#### Rollback at CP-2
Set `READ_FROM_POSTGRESQL=false`. Restart API (reads from MongoDB, writes to both during transition). PostgreSQL data preserved for debugging.

#### Rollback at CP-3
Set `READ_FROM_POSTGRESQL=false`. Re-enable MongoDB writes. Restart API. PostgreSQL becomes read-only standby.

#### Rollback at CP-4
Restore MongoDB from archived backup (manual, last resort). Revert application code to MongoDB-only version.

### 7. Backup Before Migration

**Required before every migration phase:**

```bash
# MongoDB backup
mongodump --uri="mongodb://localhost:27017/pos" --out="backups/mongo/pre-migration-$(date +%Y%m%d-%H%M%S)"

# PostgreSQL backup (if exists)
pg_dump "$DATABASE_URL" > "backups/postgres/pre-migration-$(date +%Y%m%d-%H%M%S).sql"
```

**Backups are never deleted automatically.**

### 8. Timeline Estimate

| Phase | Duration | Dependencies |
|-------|----------|--------------|
| CP-0 Preparation | 1-2 days | PostgreSQL provisioning |
| CP-1 Schema + Dual-Write | 3-5 days | Schema design, ETL skeleton |
| CP-2 Transactional Migration | 2-3 days | CP-1 complete |
| CP-3 Cutover | 1-2 days | CP-2 complete, tests pass |
| CP-4 Decommission | 7-30 days (verification) | CP-3 complete, stable operation |

**Total: 2-6 weeks depending on verification period.**

### 4. ETL Script Structure

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

<a id="ref-33"></a>

## Reference: `docs/module-registration.md`

## Module registration and subscriptions

The developer console reads its module catalog from `GET /api/developer/features`. Registered features appear in its subscription and account controls without another hardcoded UI list change. This endpoint is developer-only.

To implement a new module, register its key and label in `apps/api/src/common/features.ts`, add its validated feature fields to the plan/tenant DTOs and schemas, and add its shared frontend type/navigation entry. Protect its routes with feature, action, and module permissions. A source file alone is not a registered feature.

Subscription feature normalization defaults missing plan values to false. Assigning a plan copies its features to the business. Editing a plan's features updates all businesses assigned to that plan; those subscription settings replace individual feature overrides for those businesses. Staff permissions still apply within the business entitlement.

Developer access manages the catalog and subscriptions; it does not grant unrestricted access to tenant business records. Enable the module in a subscription before distributing it to subscribing businesses.

Plan save and subscriber propagation are separate database writes on the current standalone MongoDB deployment. If propagation fails, the request reports an error; retry the same update. Transactional propagation and per-account subscription exceptions are not implemented.

<a id="ref-34"></a>

## Reference: `docs/MODULE_MANAGEMENT.md`

## KazmiOn — Module Management

### Overview

Modules are the unit of business functionality in KazmiOn. Each module corresponds to a business capability (inventory, POS, installments, reports, etc.) and can be enabled or disabled per tenant based on their subscription plan.

### Module Catalog

Modules are registered at **build time** in `packages/shared-types/src/module-manifests.ts`.

Each module definition:

```typescript
{
  id: 'MOD-PRODUCTS',          // Unique identifier — never change once deployed
  name: 'Products & Inventory',
  route: '/products',
  icon: 'package',
  roles: ['owner', 'admin', 'manager'],
  actions: ['create', 'read', 'update', 'delete'],
}
```

### Registered Modules

| ID | Name | Route |
|----|------|-------|
| `MOD-AUTH` | Authentication | `/auth` |
| `MOD-PRODUCTS` | Products & Inventory | `/products` |
| `MOD-CUSTOMERS` | Customer Management | `/customers` |
| `MOD-ORDERS` | POS / Sales | `/pos` |
| `MOD-INVOICES` | Invoice Generation | `/invoices` |
| `MOD-INSTALLMENTS` | Installment Sales | `/installments` |
| `MOD-REPORTS` | Business Reports | `/reports` |
| `MOD-SETTINGS` | Settings | `/settings` |
| `MOD-BACKUP` | Backup Management | `/backup` |
| `MOD-USERS` | User Management | `/users` |

### Navigation Source of Truth

`TENANT_NAVIGATION_ITEMS` in `packages/shared-types` drives:
- Sidebar navigation rendering
- Breadcrumb generation
- Route-to-module mapping for entitlement checks

**Single source of truth** — do not duplicate navigation logic in components.

### Adding a New Module

1. Add entry to `module-manifests.ts` with a new unique `MOD-*` ID
2. Add to `TENANT_NAVIGATION_ITEMS` in `packages/shared-types`
3. Create NestJS module: `apps/api/src/modules/<name>/`
   ```
   <name>.module.ts
   <name>.controller.ts    ← apply @ModuleRights('MOD-NAME')
   <name>.service.ts
   <name>.schema.ts
   <name>.dto.ts
   <name>.spec.ts
   ```
4. Register in `AppModule` imports
5. Add frontend route in `apps/web/src/App.tsx`
6. If paid: add to subscription plan definitions

### Guard Enforcement

`ModuleRightsGuard` enforces module access on every request:

1. Read `@ModuleRights('MOD-XXX')` decorator from controller/handler
2. Extract `tenantId` from JWT
3. Load tenant's active subscription plan (cached per request)
4. Check if `MOD-XXX` is included in the plan's module list
5. If not → `403 Forbidden`

> [!IMPORTANT]
> Module access is enforced at the **API layer**, not just the frontend. Hiding UI elements alone is insufficient.

### Subscription Plans

Plans are stored in MongoDB `subscriptionPlans` collection. Each plan specifies:
- Plan name and description
- List of included module IDs
- Price (for multi-tier commercial deployments)

Developer can:
- Create / modify plans via developer console
- Assign plan to any tenant
- Override individual module access per tenant

### Developer Console

The developer account has unrestricted access to all modules across all tenants. Developer-only endpoints are protected by `DeveloperScopeGuard`.

<a id="ref-35"></a>

## Reference: `docs/POSTGRESQL_MIGRATION.md`

## KazmiOn — PostgreSQL Migration Guide

> [!NOTE]
> KazmiOn currently uses **MongoDB 7** as its primary database. This document describes the migration path to PostgreSQL. The migration is **opt-in** and must be explicitly activated. All MongoDB data is preserved until you approve cutover.

### Migration Architecture

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

### Prerequisites

1. PostgreSQL 16 running (via `docker-compose.postgres.yml`)
2. `pg` and migration CLI available: `npm install pg`
3. Environment variable set: `POSTGRES_URL=postgresql://kazmion:pass@localhost:5432/kazmion`
4. MongoDB backup taken: `.\scripts\backup\mongo-backup.ps1`

---

### Phase CP-0 — Start PostgreSQL

```powershell
# Set password in .env first
# POSTGRES_PASSWORD=your_secure_password

# Start PostgreSQL container
docker compose -f docker-compose.postgres.yml up -d

# Verify it's healthy
docker compose -f docker-compose.postgres.yml ps
```

---

### Phase CP-1 — Apply Schema

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

### Phase CP-2 — Dry-Run ETL (Safe — No Data Written)

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

### Phase CP-3 — Live ETL Migration

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

### Phase CP-4 — Validation

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

### Migration Scripts Reference

| Script | Purpose | Safe to re-run |
|--------|---------|----------------|
| `run-migrations.cjs` | Apply SQL schema files | ✓ Idempotent |
| `migrate-01-reference.cjs` | Tenants, users, products, customers | ✓ ON CONFLICT DO UPDATE |
| `migrate-02-transactions.cjs` | Orders, installments | ✓ ON CONFLICT DO UPDATE |
| `migrate-03-supporting.cjs` | Stock, audit, counters | ✓ ON CONFLICT DO NOTHING |
| `validate-migration.cjs` | Reconciliation report | ✓ Read-only |

---

### Rollback Procedure

The MongoDB database is **never touched** by the ETL scripts. Rolling back is simply stopping use of PostgreSQL.

```powershell
# Stop PostgreSQL (doesn't delete data)
docker compose -f docker-compose.postgres.yml down

# Restore MongoDB from backup if needed
Expand-Archive ".\backups\mongo\<timestamp>.zip" -DestinationPath ".\restore-tmp"
mongorestore --uri="mongodb://localhost:27017/pos" --drop --gzip ".\restore-tmp\<timestamp>\pos\"
```

---

### MongoDB → PostgreSQL ObjectId Mapping

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

### Connection String Reference

| Environment | POSTGRES_URL |
|-------------|-------------|
| Local dev | `postgresql://kazmion:password@localhost:5432/kazmion` |
| Docker compose | `postgresql://kazmion:password@postgres:5432/kazmion` |
| Staging | `postgresql://kazmion:password@localhost:55432/kazmion` |

<a id="ref-36"></a>

## Reference: `docs/project-structure.md`

## Project structure

Run project commands from the repository root (`pos-system/`). Its parent is a
local workspace, not another application or npm package.

```text
pos-system/
  .github/workflows/       CI workflows
  apps/
    api/                  NestJS API and colocated unit tests
    web/                  React application and public assets
    pdf-worker/           Invoice queue worker, templates and renderer tests
    analytics-service/    Planned Python analytics service (stub)
    chatbot-service/      Planned Python chatbot service (stub)
  packages/
    shared-types/         Shared TypeScript contracts
    invoice-store/        Shared PostgreSQL invoice persistence
  database/postgresql/    Versioned PostgreSQL migration SQL
  infra/nginx/            Web server configuration
  scripts/                Repository build and seed commands
    migration/            Isolated database migration tooling and tests
  qa/                     Integration tests, browser tests and fixtures
  docs/                   Architecture, API contracts and feature guides
    adr/                  Architecture decisions
    migration/            Migration plans, findings and operating guides
      reports/            Machine-readable migration evidence
  storage/                Local runtime data (ignored by Git)
  backups/                Local database backups (ignored by Git)
```

The root also owns the README, changelog, npm entry points, shared TypeScript
configuration, Compose files, Windows launcher entry points and environment
example. Each application owns its dependencies, lockfile, build configuration
and Dockerfile where applicable. The Python services are documented
future-service stubs retained intentionally.

### Placement conventions

- Add API features under `apps/api/src/modules/<feature>/`; put shared guards,
  decorators and authorization helpers in `apps/api/src/common/`.
- Keep web routes in `apps/web/src/pages/`, reusable UI in `components/`, HTTP
  integration in `api/`, state in `store/`, hooks in `hooks/` and helpers in `utils/`.
- Keep invoice templates and rendering logic in `apps/pdf-worker/src/`.
- Keep unit tests beside the code they exercise. Cross-application integration
  and browser tests belong in `qa/`; reusable automation belongs in `scripts/`.
- Keep cross-application contracts in `packages/shared-types/`. Retain each app's
  lockfile; this repository uses per-app installs, not npm workspaces.
- Keep shared invoice persistence in `packages/invoice-store/`; keep the separate
  migration tool's package and lockfile under `scripts/migration/`.
- Put machine-readable migration reports under `docs/migration/reports/`; keep
  human-readable migration guides directly under `docs/migration/`. Reports are
  retained evidence, not disposable test output.
- Put architectural and operational guides in `docs/`. Record substantial
  architectural decisions in `docs/adr/` when such decisions are introduced.
- Use Git history for old source versions rather than copying application trees
  into backup directories. Preserve database and customer-data backups in
  `backups/` (gitignored) separately from source code.

### Generated and local files

| Content | Location | Policy |
| --- | --- | --- |
| Dependencies | Each application's `node_modules/` | Local, ignored |
| Compiled output | Each application's `dist/` | Generated by the build, ignored |
| Browser screenshots and traces | `qa/artifacts/` | Generated by QA, ignored |
| Invoice previews | `apps/pdf-worker/artifacts/` | Generated by `render:sample`, ignored |
| Runtime invoices and uploads | `storage/` or configured storage path | Persistent data; never treat as cleanup output |
| Database backups | `backups/` | Local operational data, ignored |
| Python environments | `venv/` or `.venv/` | Local, ignored; do not relocate installed environments |
| Secrets | `.env` and environment-specific `.env.*` | Local, ignored; commit only `.env.example` |
| VS Code settings | `.vscode/` | Local, ignored |

Route local diagnostic command output to `qa/artifacts/` rather than leaving
numbered logs or status files beside source code. Create that directory if it
does not exist. Git and Docker exclusions keep generated files out of commits
and image build contexts. `.editorconfig` defines formatting for future edits;
it does not require reformatting existing code.

### Verification commands

Run from the repository root:

```sh
npm run build
npm --prefix apps/api test -- --runInBand
node --test apps/pdf-worker/dist/services/invoice-renderer.test.js
node --test qa/backup-delivery.test.cjs
npm --prefix apps/pdf-worker run render:sample
```

The build must run before tests that import compiled `dist/` modules. API
integration tests (`node qa/api-integration.cjs`) also require local MongoDB and
Redis. Browser suites use `qa/playwright.config.cjs`; `qa/runtime.config.cjs`
targets an already-running stack, defaulting to `http://localhost:8080`.

### Further documentation

- [Data model](#ref-22) and [API specification](api-spec.yaml)
- [Documentation index](#ref-37)

<a id="ref-37"></a>

## Reference: `docs/README.md`

## Documentation

### Architecture and repository

- [Project structure and placement conventions](#ref-36)
- [Data model](#ref-22)
- [API specification](api-spec.yaml)
- [Module registration](#ref-33)
- [Specification implementation](#ref-40)
- [PostgreSQL invoice architecture decision](#ref-05)

### Features and operations

- [Account recovery](#ref-04)
- [Backup and production validation](#ref-14)
- [Barcode module](#ref-16)
- [Design system](#ref-20)
- [Installment pricing](#ref-23)

### Database migration

- [Repository audit](#ref-24)
- [MongoDB inventory](#ref-25)
- [Dependency map](#ref-26)
- [Data profile](#ref-27)
- [Data quality findings](#ref-28)
- [ETL guide](#ref-29)
- [Reconciliation status](#ref-30)
- [Hybrid invoice setup and activation](#ref-31)

Machine-readable evidence lives in `migration/reports/`. Runtime secrets and
business files belong in ignored `storage/`; generated screenshots, test PDFs and
traces belong in ignored `qa/artifacts/`.

<a id="ref-38"></a>

## Reference: `docs/RELEASE_CHECKLIST.md`

## KazmiOn — Release Checklist

Use this checklist before every deployment or update.

---

### 1. Code Quality

- [ ] `npm run test:all` passes — 60/60 API tests, 6/6 PDF tests
- [ ] `npm run test:web:typecheck` passes — 0 TypeScript errors
- [ ] `npm --prefix apps/api run build` succeeds
- [ ] No secrets or credentials committed to git (`git log --all -p | grep -i password`)
- [ ] `.env.example` updated for any new environment variables

---

### 2. Docker Build & Health

- [ ] `npm run docker:rebuild` completes without error
- [ ] `.\scripts\verify-deployment.ps1` — all checks pass
- [ ] `GET http://localhost:3000/api/health` → `{"status":"ok"}`
- [ ] `http://localhost:8080` → login page renders
- [ ] All containers show `healthy` in `docker compose ps`

---

### 3. Business Functionality (Manual Smoke Test)

#### Authentication
- [ ] Login with owner account succeeds
- [ ] Wrong password returns `401`
- [ ] JWT expires correctly (access: 15 min)

#### Products
- [ ] Create a new product with price and stock
- [ ] Update the product — changes persist
- [ ] Stock adjustment works (manual +/-)

#### POS / Sales
- [ ] Complete a cash sale with 1+ items
- [ ] Invoice PDF generates and downloads
- [ ] Invoice shows correct totals (no rounding errors)
- [ ] Stock deducted after sale

#### Installments
- [ ] Create an installment product and plan
- [ ] Create an installment sale for a customer
- [ ] Record an installment payment
- [ ] Installment receipt PDF generates with correct schedule

#### Customers
- [ ] Create a customer
- [ ] View customer order history

#### Reports
- [ ] Sales report loads for today's date range
- [ ] Inventory report shows correct stock values

#### Users (Owner only)
- [ ] Create a cashier account
- [ ] Cashier can log in and access POS only
- [ ] Cashier cannot access reports or settings

---

### 4. Security Verification

- [ ] `JWT_ACCESS_SECRET` is non-default (not `REPLACE_ME_*`)
- [ ] `JWT_REFRESH_SECRET` is non-default and **different** from access secret
- [ ] `PLATFORM_DEVELOPER_SETUP_TOKEN` is a strong non-default value
- [ ] MongoDB port 27017 is **not** publicly accessible
- [ ] Redis port 6379 is **not** publicly accessible
- [ ] No plaintext passwords in `.env`

---

### 5. Database

- [ ] MongoDB backup taken: `.\scripts\backup\mongo-backup.ps1`
- [ ] Backup file exists in `.\backups\mongo\` with size > 10 KB
- [ ] Invoice counters are intact (sequential invoice numbers not reset)

---

### 6. PDF Output Verification

- [ ] Invoice PDF — navy/amber theme, correct layout
- [ ] Invoice PDF — Urdu caption "رسید / انوائس" visible
- [ ] Invoice PDF — customer details correct
- [ ] Installment receipt — shows full payment schedule
- [ ] Installment receipt — shows payment history
- [ ] Installment receipt — 3-column signature section

---

### Deployment Steps

```powershell
# 1. Backup
.\scripts\backup\mongo-backup.ps1

# 2. Pull latest
git pull origin main

# 3. Rebuild (always rebuild after code changes)
npm run docker:rebuild

# 4. Verify
.\scripts\verify-deployment.ps1

# 5. Manual smoke test (see section 3 above)
```

---

### Rollback Procedure

```powershell
# Stop current stack
npm run docker:stop

# Find the backup (taken in step 1 above)
Get-ChildItem .\backups\mongo\ | Sort-Object LastWriteTime -Descending | Select-Object -First 3

# Restore backup
$backup = ".\backups\mongo\<timestamp>.zip"
Expand-Archive $backup -DestinationPath ".\restore-tmp"
mongorestore --uri="mongodb://localhost:27017/pos" --drop --gzip ".\restore-tmp\<timestamp>\pos\"

# Start previous Docker image (if tagged)
# docker compose up -d --no-build

# Or rebuild from previous git commit
# git checkout <previous-commit>
# npm run docker:rebuild
```

---

### Post-Deployment Sign-Off

| Check | Person | Date |
|-------|--------|------|
| All automated tests pass | | |
| Docker stack healthy | | |
| Business smoke test complete | | |
| Security checklist verified | | |
| Backup confirmed | | |

<a id="ref-39"></a>

## Reference: `docs/ROLLBACK_GUIDE.md`

## KazmiOn POS — Rollback Guide

### Rollback an image upgrade (data preserved)
Named volumes are never modified by an upgrade, so rolling back only swaps the application image.

```powershell
# 1. Note the current (broken) image id
docker images kazmion/pos

# 2. Retag a known-good previous image if it still exists locally
docker tag <previous-image-id> kazmion/pos:latest

# 3. Recreate the container with the old image
docker compose -f compose.yaml up -d --force-recreate

# 4. Verify
docker compose ps
Invoke-WebRequest http://localhost:8080/health
```

If no previous image exists locally, rebuild it from the matching Git tag/commit:
```powershell
git checkout <last-known-good-tag-or-commit>
docker compose build
docker compose up -d
```

### Rollback after a restore went wrong
`backup.ps1` writes `pg_dump` archives. To return to a pre-restore state, restore the most recent backup taken before the bad one:
```powershell
scripts\restore.ps1 -SqlFile backups\manual\pos-<earlier-stamp>.sql
```

### Disaster recovery (lost container, volumes intact)
```powershell
docker compose up -d      # container recreates against existing volumes
```

### Disaster recovery (volume lost)
Restore from a full backup:
1. `docker compose down` (do NOT use `-v` unless discarding data intentionally).
2. Recreate empty volumes, start container once to initialize cluster, stop it.
3. `scripts\restore.ps1 -SqlFile <backup>.sql -InvoicesDir <invoices-backup>`
4. `scripts\start.ps1`

### Critical rules
- Never run `docker compose down -v` or `docker system prune --volumes` on a client machine — that deletes all business data.
- `kazmion_pgdata` contains the generated DB credentials; a volume restore must keep those credentials with the matching data.
- Take a `backup.ps1` snapshot before any rollback on a live system.

<a id="ref-40"></a>

## Reference: `docs/specification-implementation.md`

## Product specification implementation status

Source: `KazmiOn_SaaS_Product_Specification_Updated.docx`, version 2.0, 12 November 2026. This is an implementation and verification checklist, not a production-readiness or FBR certification claim.

### Implemented foundation

| Specification area | Implementation | Practical limits |
| --- | --- | --- |
| Tenant isolation | Existing tenant filters retained; real API checks exercise cross-tenant reads and writes | Full penetration testing remains outstanding |
| Branch isolation | Branch registry, assignments, branch selector, branch-limit enforcement, branch-scoped operational queries and aggregates | Legacy records without a branch belong to the first/default branch; terminal/device registration is pending |
| Action permissions | Server-side action mapping denies unknown routes/roles; optional action grants restrict role defaults; module rights remain enforced | Owner/admin/cashier are implemented; specialized roles and maker-checker policies remain pending |
| User lifecycle | Staff activation/deactivation, branch/action grants, session-version revocation | MFA, per-device session registry, refresh-token rotation and periodic access reviews remain pending |
| Developer authentication | Argon2id-hashed password, lockout, setup-token authorization; legacy Developer PIN credentials are removed | Privileged MFA and secure secret provisioning are deployment gates |
| Checkout | Atomic stock reservations, optional idempotency keys, mixed cash/card/wallet tender, held carts, server-calculated totals | Held carts are browser-memory state; partial refunds/exchanges and offline checkout are not implemented |
| Full refunds and voids | Atomic order-state transitions and replay-safe stock restoration; refund reason/approver/time retained | Installment settlement, credit-note documents, crash-recovery drills and configurable approval thresholds remain pending |
| Inventory adjustments | Reasoned, replay-safe adjustments with nonnegative stock checks and persisted adjustment records | This is an adjustment ledger, not a complete purchasing/transfer/stocktake ledger |
| Barcode catalog | First-class barcode field, exact lookup, branch-scoped uniqueness, malformed-input validation | Weighted barcodes, GS1 lot/serial parsing, physical scanners/scales and label-printer compatibility require further work/testing |
| Business types | Retail, supermarket, grocery, pharmacy, electronics and restaurant categories supported | Category selection does not implement the specialized workflows listed below |
| Platform settings | Deployment entitlement, branch limit and license expiry; tenant cannot self-edit platform settings | Offline/hybrid entitlement is configuration only; no local-first sync engine or signed device licensing yet |
| Audit | Append-only application collection and audit endpoint for successful authenticated mutations; no request bodies/secrets stored | Database-level WORM retention, all denied actions and cryptographic tamper evidence are not yet established |
| Readiness | Public API health endpoint checks MongoDB connectivity | Redis/queue/worker health, load tests and centralized incident monitoring remain pending |
| Footer | KazmiOn development/copyright footer and WhatsApp contact `0331-6276186` | External messaging is opened only on user click |
| Receipt security | Mixed tenders in receipts, HTML escaping, embedded-image-only logos, PDF JavaScript/network disabled | Remote logo URLs must be replaced by uploaded embedded images; hardware compatibility remains unverified |
| CI | API unit/build checks, disposable-database integration test job, frontend build/browser checks, worker build | Hosted CI execution itself must be verified after pushing |

### Important transaction boundary

The current MongoDB deployment is standalone. Sales use conditional stock updates and compensating rollback rather than multi-document replica-set transactions. Idempotency and refund races are exercised by API tests, but process-kill recovery, partial infrastructure failures, long-term replay-marker growth, and multi-entity durability are not certified. Migrate to a supported transaction/outbox design and run fault-injection tests before production approval.

### Remaining specification work

| Priority | Work still required |
| --- | --- |
| P0 | Full sales/refund/stock ledger and partial-return accounting; specialized role policies; maker-checker approvals; privileged MFA; refresh-token rotation; comprehensive negative-path, failed-audit and fault-injection coverage |
| P1 purchasing | Suppliers, purchase orders, goods receipts, supplier returns, landed cost and payables |
| P1 finance | Cash drawers, shifts, expenses, reconciliation, daily close, loyalty/credit limits and accounting exports |
| P1 supermarket/grocery | Scale PLU, weighted labels, multi-lane registers, promotions, conversions, perishables and high-volume stock counts |
| P1 pharmacy | Per-lot stock, FEFO, expiry/recall controls, prescription references and pharmacist approvals |
| P1 electronics | Unique serial/IMEI lifecycle, warranty eligibility, service/repair tickets and device history |
| P1 retail | Variant matrix, exchanges/store credit, loyalty, transfers and reservations |
| P1 restaurant | Tables, kitchen tickets/display, modifiers, recipes, waiter assignments, split bills and tips |
| P1 offline/hybrid | Local API/database packaging, encrypted local writes, append-only sync queue, idempotent cloud reconciliation, conflict policy, clock-drift handling and 24-hour interruption tests |
| P1 resilience/hardware | Encrypted backup/restore implementation and restore drill, signed updates, device loss recovery and tested printer/drawer/scanner/scale adapters |
| P2 | Applicable current official FBR pathway, credentials, sandbox adapter, response/QR/reference storage, idempotent retry/reconciliation, authorized tax/legal validation and production approval |
| P3 | Billing/trials, signed licenses/device revocation, support tickets, audited/time-bound support access, metrics, incident management and scaling tests |

No transaction is marked FBR-confirmed. Existing invoice QR codes contain local receipt information and are not FBR acknowledgements.

### Verification commands

```powershell
npm --prefix apps/api test -- --runInBand
npm --prefix apps/api run build
node qa/api-integration.cjs
npm --prefix apps/pdf-worker run build
node --test apps/pdf-worker/dist/services/invoice-renderer.test.js
npm --prefix apps/web run build
npm exec --yes --package=@playwright/test -- playwright test --config=qa/playwright.config.cjs
docker compose up -d --build api pdf-worker web
npm exec --yes --package=@playwright/test -- playwright test --config=qa/runtime.config.cjs
```

The integration harness creates a unique `pos_spec_test_*` database and `spec-test-*` Redis namespace. Cleanup validates these exact generated names before removing them. It does not use the business database for test fixtures. Browser smoke checks use isolated demo responses and do not prove live API integration.

### Verification results — 12 November 2026 (Asia/Karachi)

- All three production builds passed through `npm run build`.
- API: 9 suites, 40 unit tests passed after the final dependency updates.
- Real API integration: 22 checks passed, including tenant/branch isolation, role restrictions, session revocation, checkout concurrency, void/refund races, mixed tender, barcode validation, stock adjustments, platform-only licensing and audit redaction. Disposable fixtures were cleaned up.
- Browser UI: 56 checks passed across 28 routes in desktop/light and mobile/dark modes. POS hold/resume, mixed-tender calculation and modal keyboard behavior are included. These use mocked API responses.
- Deployed-stack browser check passed against port 8080: sign-in renders, the supplied hero image loads, password visibility works, MongoDB health is reachable through the web proxy, and invalid credentials produce a visible error with the submit button re-enabled.
- Receipt renderer: 3 tests passed. The rebuilt worker also generated a valid 13,577-byte PDF using its installed Chromium without writing a business record.
- Production API dependency audit: zero reported vulnerabilities. The development dependency tree still reports 4 low and 16 moderate findings; the suggested forced Jest downgrade was not applied.
- Final Docker deployment: updated API, web and PDF-worker containers are running; MongoDB and Redis are healthy. After the final API replacement, `/login`, `/api/health` through port 8080, and `/api/docs` on port 3000 returned successfully. Existing persistent volumes were retained.

These results cover the named scenarios, not every requirement or failure mode in the specification. Hosted CI, real payment/hardware providers, FBR, prolonged offline operation and disaster recovery remain unverified.

### Running and setup

The local container UI is exposed at `http://localhost:8080`; the API at `http://localhost:3000/api`; readiness at `/api/health`; OpenAPI at `/api/docs`. Container status and HTTP responses must be checked after rebuilding.

Existing business accounts remain in the preserved MongoDB volume. Developer access now requires `PLATFORM_DEVELOPER_EMAIL` and a private setup token configured in the environment, followed by the authorized setup flow to generate a private PIN. There is no hardcoded fallback PIN. Never commit the token or generated PIN.

<a id="ref-41"></a>

## Reference: `docs/TENANT_ISOLATION.md`

## KazmiOn — Tenant Isolation

### Isolation Model

KazmiOn uses **shared-database, shared-collection** multi-tenancy with strict `tenantId` filtering enforced at the service layer.

Every MongoDB document in business collections includes a `tenantId` field (ObjectId). Every service method includes `tenantId` on **every query** — there are no collection-level scans.

### Verified Isolation Points

Audited 2026-11-17 — all services confirmed clean:

| Service | File | Isolation method |
|---------|------|-----------------|
| `CustomerService` | `customer.service.ts` | `tenantId: oid(tenantId)` on all queries |
| `ProductService` | `product.service.ts` | `tenantId: oid(tenantId)` on all queries |
| `ReportService` | `report.service.ts` | `tenantId: oid(tenantId)` on all queries |
| `OrderService` | `order.service.ts` | `tenantId: oid(tenantId)` on all queries |
| `AuthService` | `auth.service.ts` | Per-tenant user lookup |
| `InstallmentService` | `installment.service.ts` | `tenantId: oid(tenantId)` on all queries |
| `InvoiceService` | `invoice.service.ts` | `tenantId: oid(tenantId)` on all queries |

### How Tenant ID Flows

```
JWT (login)
  → TenantStatusGuard extracts tenantId from token payload
  → Validates tenant.status === 'active'
  → Attaches tenantId to request object
    → Controller reads from request (not from body!)
      → Service receives tenantId as parameter
        → Every DB query includes { tenantId: oid(tenantId) }
```

> [!IMPORTANT]
> Services never trust `tenantId` from the request body. It always comes from the validated JWT payload via the guard chain.

### ObjectId Conversion

The `oid()` utility converts the string `tenantId` from the JWT payload into a MongoDB ObjectId:

```typescript
import { Types } from 'mongoose';

function oid(id: string): Types.ObjectId {
  return new Types.ObjectId(id);
}
```

Using string comparison instead of ObjectId would silently return empty results (no match), not leak data — but the correct ObjectId conversion is verified on all services.

### Guard Chain Protection

```
JwtAuthGuard          ← validates token signature + expiry
  TenantStatusGuard   ← loads tenant, checks active status
    BranchGuard       ← scopes to branch within tenant
      RolesGuard      ← checks user role
        ModuleRightsGuard ← checks module subscription
```

A suspended or deleted tenant cannot pass `TenantStatusGuard`, so no business logic runs for inactive tenants.

### Recommended MongoDB Indexes

For performance with multi-tenant collections at scale:

```javascript
// products
db.products.createIndex({ tenantId: 1, sku: 1 }, { unique: true })
db.products.createIndex({ tenantId: 1, createdAt: -1 })

// orders
db.orders.createIndex({ tenantId: 1, createdAt: -1 })
db.orders.createIndex({ tenantId: 1, invoiceNo: 1 })

// customers
db.customers.createIndex({ tenantId: 1, phone: 1 })

// installmentSales
db.installmentSales.createIndex({ tenantId: 1, status: 1 })
db.installmentSales.createIndex({ tenantId: 1, customerId: 1 })
```

### Cross-Business Isolation (Multiple Businesses)

If multiple businesses share a single installation:
- Each business is a separate **tenant** with its own `tenantId`
- All data is scoped by `tenantId` — no shared collections without tenant scoping
- Users are assigned to exactly one tenant
- The JWT contains the user's `tenantId` — they cannot switch tenants without a fresh login

### Security Boundaries

| Boundary | Enforced by |
|----------|------------|
| Token validity | `JwtAuthGuard` |
| Tenant active | `TenantStatusGuard` |
| Role access | `RolesGuard` |
| Module access | `ModuleRightsGuard` |
| Data isolation | `tenantId` on every MongoDB query |
| Developer isolation | `DeveloperScopeGuard` |

<a id="ref-42"></a>

## Reference: `docs/TEST_REPORT.md`

## KazmiOn — Test Report

### Single-container acceptance, 2026-11-19

Built with `docker compose -f compose.yaml build` and started with `docker compose -f compose.yaml up -d --no-build --pull never --wait`. Docker reported exactly one running container, kazmion-pos. Only 127.0.0.1:8080 is published. Supervisor reported all six processes running. The web root returned HTTP 200, /health returned ok and the worker rendered a PDF. A read-only PostgreSQL query verified four accounts and two tenants after the container replacement.

The API unit suite passed 61 tests and the PDF worker passed six. The production frontend build included TypeScript checks. This run did not repeat browser end-to-end, recovery delivery or backup/restore drills. The current PostgreSQL cluster uses shared business collections with application tenant scoping. Separate physical databases per business remain outstanding.


**Last verified:** 2026-11-17\
**Node.js version:** v24.15.0\
**TypeScript version:** 6.x

---

### API Unit Tests (Jest + ts-jest)

```
Test Suites:  14 passed, 14 total
Tests:        60 passed, 60 total
Snapshots:    0 total
Time:         ~12s
```

**Run command:**
```powershell
npm run test:api
# or
npm --prefix apps/api test
```

#### Test Suites

| Suite | Tests | Status |
|-------|-------|--------|
| `auth.service.spec.ts` | ✓ | Passing |
| `product.service.spec.ts` | ✓ | Passing |
| `customer.service.spec.ts` | ✓ | Passing |
| `order.service.spec.ts` | ✓ | Passing |
| `installment.service.spec.ts` | ✓ | Passing |
| `invoice.service.spec.ts` | ✓ | Passing |
| `report.service.spec.ts` | ✓ | Passing |
| *(+ 7 controller / guard / module specs)* | ✓ | Passing |

#### Key Fix Applied (invoice.service.spec.ts)

NestJS 12 ships as pure ESM. Jest CJS transform could not load `@nestjs/common`.\
**Fix:** `jest.mock()` all 4 NestJS packages before import, with schema stubs returning chainable `{plugin, index, pre, post}` objects.

---

### PDF Worker Tests (Node.js built-in test runner)

```
Tests:  6 passed, 6 total
Time:   ~3s
```

**Run command:**
```powershell
npm run test:pdf
# or
npm --prefix apps/pdf-worker test
# which runs: tsx --test src/services/invoice-renderer.test.ts src/services/paper.test.ts
```

| File | Tests | Status |
|------|-------|--------|
| `invoice-renderer.test.ts` | 4 | ✓ Passing |
| `paper.test.ts` | 2 | ✓ Passing |

---

### TypeScript Compilation (Type Checking)

| Package | Command | Status |
|---------|---------|--------|
| `apps/api` | `npm --prefix apps/api run build` | ✓ 0 errors |
| `apps/web` | `npm --prefix apps/web run typecheck` | ✓ 0 errors |
| `apps/pdf-worker` | `tsc -p apps/pdf-worker/tsconfig.json` | ✓ 0 errors |

**Run all type checks:**
```powershell
npm run test:web:typecheck
```

---

### Run All Tests

```powershell
npm run test:all
```

This runs:
1. `npm run test:api` — 60 Jest unit tests
2. `npm run test:pdf` — 6 Node.js PDF worker tests

---

### E2E Tests

> **Status:** Not yet implemented.\
> Planned: Playwright tests for critical user flows (login, POS checkout, installment payment, PDF generation).\
> See [RELEASE_CHECKLIST.md](#ref-38) for manual verification steps in the interim.

---

### Known Issues

None at time of last verification (2026-11-17).

---

### Jest Configuration (apps/api)

```json
{
  "jest": {
    "moduleFileExtensions": ["js", "json", "ts"],
    "rootDir": "src",
    "testRegex": ".*\\.spec\\.ts$",
    "transform": { "^.+\\.ts$": "ts-jest" },
    "testEnvironment": "node"
  }
}
```

No `--experimental-vm-modules` needed. All NestJS ESM imports mocked at spec level.

<a id="ref-43"></a>

## Reference: `docs/WINDOWS_INSTALLER.md`

## KazmiOn — Windows Installer Guide

### Deployment Strategy

KazmiOn targets Windows business PCs using **Docker Desktop** as the runtime environment. The recommended installer approach uses **Inno Setup** to:

1. Check/install prerequisites (Docker Desktop)
2. Install KazmiOn files
3. Configure the application
4. Create a desktop shortcut that launches the browser to `http://localhost:8080`

---

### Architecture (Windows Client)

```
C:\KazmiOn\                    ← Installation directory
  docker-compose.yml           ← Services definition
  .env                         ← Business configuration (secrets)
  scripts\
    start.ps1                  ← Start the stack
    stop.ps1                   ← Stop the stack
    update.ps1                 ← Update without data loss
    backup.ps1                 ← Manual backup
  images\
    kazmion-api.tar            ← Pre-built Docker image (optional)
    kazmion-web.tar            ← Pre-built Docker image (optional)
    kazmion-pdf-worker.tar     ← Pre-built Docker image (optional)

Docker Named Volumes (managed by Docker, never in C:\KazmiOn):
  pos-system_mongo_data        ← ALL business data
  pos-system_redis_data        ← Queue persistence
  pos-system_invoice_data      ← Generated PDFs
```

> [!IMPORTANT]
> Docker named volumes are stored by Docker Engine — NOT in `C:\KazmiOn\`. They survive uninstallation of the KazmiOn application files. Only explicitly running `docker volume rm` deletes them.

---

### Inno Setup Script (`installer/kazmion-setup.iss`)

```pascal
[Setup]
AppName=KazmiOn POS
AppVersion=1.0.0
AppPublisher=KazmiOn Technologies
DefaultDirName={autopf}\KazmiOn
DefaultGroupName=KazmiOn
OutputBaseFilename=KazmiOn-Setup-1.0.0
Compression=lzma2
SolidCompression=yes
ArchitecturesInstallIn64BitMode=x64
MinVersion=10.0.19041   ; Windows 10 2004 (required for WSL2)

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
; Docker Compose configuration
Source: "..\docker-compose.yml";   DestDir: "{app}"; Flags: ignoreversion
Source: "..\docker-compose.postgres.yml"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\env.example";          DestDir: "{app}"; DestName: ".env.example"; Flags: ignoreversion

; Scripts
Source: "..\scripts\*"; DestDir: "{app}\scripts"; Flags: ignoreversion recursesubdirs

; Pre-built Docker images (if offline installer)
; Source: "images\*.tar"; DestDir: "{app}\images"; Flags: ignoreversion

[Icons]
Name: "{group}\KazmiOn POS";   Filename: "{app}\scripts\start-browser.bat"; IconFilename: "{app}\assets\icon.ico"
Name: "{group}\Stop KazmiOn";  Filename: "{app}\scripts\stop.bat"
Name: "{group}\Backup Data";   Filename: "{app}\scripts\backup.bat"
Name: "{commondesktop}\KazmiOn POS"; Filename: "{app}\scripts\start-browser.bat"; IconFilename: "{app}\assets\icon.ico"

[Run]
; Generate .env from template if it doesn't exist
Filename: "pwsh.exe"; Parameters: "-NoProfile -File ""{app}\scripts\setup-env.ps1"""; Description: "Configure application"; Flags: runhidden waituntilterminated

; Start the Docker stack
Filename: "pwsh.exe"; Parameters: "-NoProfile -File ""{app}\scripts\first-run.ps1"""; Description: "Starting KazmiOn (first run)..."; Flags: waituntilterminated
```

---

### Prerequisite Check Script (`scripts/check-prerequisites.ps1`)

```powershell
# Check Docker Desktop
$docker = Get-Command docker -ErrorAction SilentlyContinue
if (-not $docker) {
  Write-Host "Docker Desktop is not installed." -ForegroundColor Red
  Write-Host "Download from: https://www.docker.com/products/docker-desktop/" -ForegroundColor Yellow
  Write-Host "After installing, restart your computer and run KazmiOn Setup again." -ForegroundColor Yellow
  exit 1
}

# Check Docker is running
try {
  docker info 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) { throw }
} catch {
  Write-Host "Docker Desktop is installed but not running." -ForegroundColor Red
  Write-Host "Please start Docker Desktop from the Start Menu, wait for it to initialize," -ForegroundColor Yellow
  Write-Host "then run KazmiOn Setup again." -ForegroundColor Yellow
  exit 1
}

# Check WSL2 (required for Docker Desktop on Windows 10/11)
$wsl = wsl --status 2>&1
if ($LASTEXITCODE -ne 0) {
  Write-Host "WSL2 is not enabled." -ForegroundColor Red
  Write-Host "Run in an Administrator PowerShell: wsl --install" -ForegroundColor Yellow
  Write-Host "Then restart your computer." -ForegroundColor Yellow
  exit 1
}

Write-Host "All prerequisites satisfied." -ForegroundColor Green
exit 0
```

---

### First-Run Script (`scripts/first-run.ps1`)

```powershell
Set-Location $PSScriptRoot\..

# Generate secrets if .env doesn't exist
if (-not (Test-Path ".env")) {
  $accessSecret  = -join ((65..90)+(97..122)+(48..57) | Get-Random -Count 64 | ForEach-Object {[char]$_})
  $refreshSecret = -join ((65..90)+(97..122)+(48..57) | Get-Random -Count 64 | ForEach-Object {[char]$_})
  $setupToken    = -join ((65..90)+(97..122)+(48..57) | Get-Random -Count 32 | ForEach-Object {[char]$_})

  $env_content = Get-Content ".env.example" -Raw
  $env_content = $env_content `
    -replace "REPLACE_ME_WITH_STRONG_SECRET", $accessSecret `   # first occurrence
    -replace "REPLACE_ME_WITH_STRONG_SECRET", $refreshSecret `  # second occurrence
    -replace "REPLACE_ME_WITH_SETUP_TOKEN", $setupToken `
    -replace "REPLACE_ME_WITH_RESET_URL", "http://localhost:8080"

  Set-Content ".env" $env_content
  Write-Host "Generated secure .env configuration" -ForegroundColor Green
}

# Pull/load images and start
Write-Host "Starting KazmiOn (this may take a few minutes on first run)..." -ForegroundColor Cyan
docker compose up -d

# Wait for health
$deadline = (Get-Date).AddMinutes(5)
while ((Get-Date) -lt $deadline) {
  try {
    $r = Invoke-WebRequest -Uri "http://localhost:3000/api/health" -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
    if ($r.StatusCode -eq 200) {
      Write-Host "KazmiOn is ready!" -ForegroundColor Green
      Start-Process "http://localhost:8080"
      exit 0
    }
  } catch {}
  Start-Sleep 5
}

Write-Host "KazmiOn took longer than expected to start." -ForegroundColor Yellow
Write-Host "Check status with: docker compose ps" -ForegroundColor Gray
```

---

### Desktop Shortcut (`scripts/start-browser.bat`)

```batch
@echo off
cd /d "%~dp0.."
docker compose up -d
timeout /t 3 /nobreak >nul
start http://localhost:8080
```

---

### Update Without Data Loss (`scripts/update.bat`)

```batch
@echo off
cd /d "%~dp0.."
pwsh -NoProfile -File scripts\update-docker.ps1
pause
```

---

### Uninstall Notes

> [!WARNING]
> The Inno Setup uninstaller removes application files from `C:\KazmiOn\` but does **NOT** delete Docker volumes. Business data is safe after uninstall.

To permanently delete all data (factory reset):
```powershell
docker compose down -v   # WARNING: deletes all volumes including business data
```

---

### Alternative: Native Deployment (Without Docker)

If Docker Desktop licensing or WSL2 compatibility is an issue, consider:

1. **MongoDB Community** — install as a Windows service
2. **Redis for Windows** (via Memurai or WSL)
3. **Node.js** — run API and PDF worker as Windows services via NSSM
4. **Nginx** — serve the production React build

This approach avoids Docker but requires manual service management. Docker is strongly preferred for reliability and ease of updates.

---

### System Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| OS | Windows 10 Pro 2004 | Windows 11 Pro |
| CPU | 4 cores | 8 cores |
| RAM | 8 GB | 16 GB |
| Disk | 20 GB free | 50 GB SSD |
| Network | LAN for local access | — |

> Docker Desktop requires Windows 10 Pro/Enterprise/Education or Windows 11. Home editions require WSL2 backend.

<a id="ref-44"></a>

## Reference: `KazmiOn-Launcher/README.txt`

KazmiOn POS launcher - matched to public repository compose filenames
Repository: https://github.com/farazkazmi700-syed/POS

INSTALL / TEST
1. Copy KazmiOn-Start.ps1 and KazmiOn-Launch.bat to the ROOT of your POS checkout (alongside docker-compose.yml).
2. Configure .env (do not commit secrets).
3. Install and start Docker Desktop / Docker Engine.
4. First time only, build images in the repository root:
   docker compose -f docker-compose.yml -p kazmion build
5. Double-click KazmiOn-Launch.bat. It starts existing images, polls http://localhost:8080, then opens the browser.
6. Optional production overlay: KazmiOn-Launch.bat -Mode production
   Production overlay publishes port 80, so it opens http://localhost .

NOTES
- The published repository currently uses MongoDB and Redis; it has NOT been migrated to PostgreSQL.
- MongoDB, Redis and invoice volumes are preserved: the launcher does not run `down -v`.
- Inno Setup script is a launcher-only prototype. Its installed shortcut cannot launch POS unless compose files, .env, images and Docker are provisioned at the installed location. For now use the BAT in the repository root.
- The web polling checks HTTP readiness, not full API/database readiness.
- A first-run image build requires project source and build dependencies; commercial offline packaging needs exported images and a runtime installer.
