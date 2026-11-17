# Multi-tenant POS System

TypeScript POS where any business (retail, restaurant, pharmacy, salon, ...) can register, add its own products, sell, and get a **tax-invoice PDF** (itemised lines, per-rate tax breakdown, service/other charges, discount, QR code).

| Part | Tech | Folder |
|---|---|---|
| API | NestJS 12, MongoDB (Mongoose), JWT + roles, BullMQ | `apps/api` |
| PDF worker | BullMQ worker, Handlebars template, Puppeteer (Chromium) | `apps/pdf-worker` |
| Web app | React 19, Vite, Tailwind, React Query, Zustand | `apps/web` |
| Shared contract | plain TypeScript interfaces | `packages/shared-types` |
| Phase 2 (stubs) | FastAPI analytics + chatbot | `apps/analytics-service`, `apps/chatbot-service` |

See [Project structure and repository conventions](docs/project-structure.md) for directory ownership, generated files and verification commands.

PostgreSQL migration: the API and PDF worker support PostgreSQL-authoritative
invoice status and PDF metadata. Sales, inventory and authentication still use
MongoDB. See [hybrid invoice setup and activation gates](docs/migration/09-hybrid-invoices.md).

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

* App: http://localhost:8080  (register a business, then Settings -> set your tax rates)
* API docs (Swagger): http://localhost:3000/api/docs
* Demo data (optional, with the stack running): `npm run seed`
  -> logins `npm run dev:api` / `restaurant@demo.test`, password `demo12345`

Production: `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build`
(databases not exposed, secrets mandatory, restart policies; add TLS in front of the `web` container).

## Local development (no Docker for the apps)

```bash
npm run install:all             # installs api, web and pdf-worker
docker compose up -d mongo redis
cp .env.example .env            # use this one root env file for local apps too

npm run dev:api                 # http://localhost:3000
npm run dev:worker              # needs Chromium: puppeteer downloads it on install
npm run dev:web                 # http://localhost:5173 (proxies /api to :3000)
```

`STORAGE_DIR` must point at the **same folder** for the API and the worker; both load it from the root `.env`.
Tune the invoice layout with `cd apps/pdf-worker && npm run render:sample` (writes previews to `apps/pdf-worker/artifacts/`, which is ignored by Git).

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

Set `PLATFORM_DEVELOPER_EMAIL` and `PLATFORM_DEVELOPER_SETUP_TOKEN` in the root `.env` for Docker Compose and local development. Generate and save a 64-character setup token locally in PowerShell; do not send it in chat or commit it:

```powershell
$token = node -p "require('crypto').randomBytes(32).toString('hex')"
$envFile = '.env'
$lines = Get-Content $envFile | Where-Object { $_ -notmatch '^PLATFORM_DEVELOPER_SETUP_TOKEN=' }
$lines += "PLATFORM_DEVELOPER_SETUP_TOKEN=$token"
Set-Content $envFile $lines -Encoding ascii
Remove-Variable token
```

Restart/recreate the API after setting the token, then open `/developer` (`http://localhost:8080/developer` in Docker or `http://localhost:5173/developer` with Vite). Choose **Set up Developer PIN**, then enter the configured Developer email and setup token. The page creates a dedicated empty tenant, generates an 8-digit PIN, stores only its bcrypt hash, and displays the PIN once. The setup token is accepted only once; remove it from the env file and restart the API after setup. Main-window sign-in at `/login` remains email/password-based for business users. Developer sign-in at `/developer` uses the configured email plus the generated PIN. The Developer session is restricted to Developer APIs and cannot access ordinary POS/business routes.

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
