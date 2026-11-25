# KazmiOn POS

KazmiOn POS manages sales, inventory, customer accounts, installments and tax invoices. The default deployment runs the React app, NestJS API and invoice worker in a single container with nginx, PostgreSQL, FerretDB and Redis.

## Repository layout

| Path | Responsibility |
| --- | --- |
| `app/web/` | React SPA (Vite + Tailwind) — also the Cloudflare Pages target |
| `app/api/` | NestJS API |
| `app/pdf-worker/` | BullMQ invoice worker |
| `app/analytics-service/`, `app/chatbot-service/` | Future-service stubs |
| `app/packages/` | Shared types, contracts, configuration and invoice storage |
| `docker/` | `Dockerfile`, Compose files (`docker/compose/`), nginx, PostgreSQL bootstrap, supervisor and health checks |
| `deploy/scripts/` | Build, install, update, migration, backup and restore |
| `deploy/database/postgresql/` | Versioned SQL migrations |
| `desktop/windows/` | Windows launcher scripts and installer sources |
| `qa/` | Integration, browser and deployment tests |
| `docs/` | API specification, migration reports and technical reference |
| `.github/workflows/` | Continuous integration |

The Docker build context is the repository root. The image is defined at `docker/Dockerfile` and the default stack at `docker/compose/compose.yaml`; always pass the file explicitly, e.g. `docker compose -f docker/compose/compose.yaml up -d`. Existing launch scripts can use the compatibility Compose files. The standalone `docker/compose/docker-compose.postgres.yml` supports development and migration work.

## Windows installation

For a new installation with Docker Desktop running, run the following command from the repository root.

```powershell
.\deploy\scripts\install.ps1
```

Open the POS at `http://localhost:8080`. nginx exposes API documentation at `/api/docs` and application health at `/health`. Existing installations can start through `desktop/windows/KazmiOn-Launch.bat`. Review the installation's volume mappings and backup procedure before upgrading.

## Development and verification

CI uses Node.js 24. Each shipped service has an npm lockfile. Run these commands from the repository root.

```sh
npm ci --prefix app/api
npm ci --prefix app/pdf-worker
npm ci --prefix app/web
npm run build
npm run test:all
docker compose -f docker/compose/compose.yaml config --quiet
```

Use `npm run dev:web` for the Vite development server on port 5173. Its default API proxy targets port 8080. Owners manage invoice taxes under **Settings > Tax and service charges**.

## CI and deployment

GitHub Actions builds and tests the API, PDF worker and web app. It runs API
integration tests with isolated MongoDB and Redis services and runs browser
checks in Chromium. The Docker build must pass before a Pages deployment.

### Production Docker

Use the unified image and Compose configuration described above for the API,
PostgreSQL, FerretDB, Redis and the invoice worker. Keep the database and queue
private. If Cloudflare Pages serves the UI, give it an HTTPS API origin through
a TLS proxy or Cloudflare Tunnel in front of the container.

Set the GitHub repository variable `PUBLISH_CONTAINER_IMAGE` to `true` to
publish the unified image to GHCR after CI passes on `main`. The image is tagged
with the commit SHA. To promote a release, set `KAZMION_IMAGE` in the host
`.env` to the published `ghcr.io/<owner>/<repo>:<commit-sha>` and run
`docker compose --env-file .env -f docker/compose/compose.yaml up -d --no-build --pull always`.
Publishing an image does not restart a running installation.

### Cloudflare Pages

The deploy job is opt-in. Set the GitHub repository variable
`DEPLOY_CLOUDFLARE_PAGES` to `true`, configure the `production` environment,
and supply `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as Actions secrets.
The target project is `kazmion-pos-web`. Set `VITE_API_BASE_URL` to the HTTPS
API origin including `/api`, `CORS_ORIGIN` on the API to the Pages origin,
and `PASSWORD_RESET_BASE_URL` on the API to the Pages URL ending in
`/reset-password`.

Deployments run after successful CI on `main`. For a manually managed Pages
project, Node.js 24 and authenticated Wrangler are required to use
`deploy/cloudflare/deploy.ps1`. Choose one deployment mechanism per Pages
project to avoid duplicate releases. SPA routing and cache rules ship with the
static build via `_redirects` and `_headers`.

## Business Data Sync

Data Sync is off by default. Provision it only for a business that requests
cloud service. Create a dedicated Cloudflare D1 database and Worker for that
business. In `deploy/cloudflare/data-sync/wrangler.toml`, set a unique Worker
name, the D1 database name and ID, and the business ID. Apply the D1
migrations with `wrangler d1 migrations apply SNAPSHOTS --remote`, install a
random 32-byte hex secret with `wrangler secret put DATA_SYNC_TOKEN`, and
deploy the Worker with `wrangler deploy`. Run Wrangler from that directory.

Set the matching token, business ID, and HTTPS Worker endpoint ending in
`/v1/business-snapshot` in the local API environment using
`DATA_SYNC_TOKEN`, `DATA_SYNC_TENANT_ID`, and `DATA_SYNC_URL`. Grant Data
Sync in Module Entitlements and set the business deployment mode to Cloud
or Hybrid. The owner can then start an upload from Business Backup.

Sync sends a sanitized ZIP snapshot up to 50 MiB. The Worker stores it in
D1 chunks and changes the current snapshot only after the full upload is
stored. A daily cleanup removes superseded and incomplete snapshots older
than one day. An authorized operator can download the current archive with
`GET /v1/business-snapshot` using the same bearer token and `X-Business-Id`
header. Verify the download against the `X-Snapshot-SHA256` response header.
The local application remains authoritative. This workflow
does not provide incremental replication, cloud reporting tables, or
automatic restore. The snapshot contains customer and financial data.

## Technical reference

The [technical reference](docs/technical-reference.md) contains design decisions, operating procedures and historical migration records.

<details>
<summary>Reference index</summary>

- <a id="ref-01"></a>[ARCHITECTURE_AUDIT.md](docs/technical-reference.md#ref-01)
- <a id="ref-02"></a>[CHANGELOG.md](docs/technical-reference.md#ref-02)
- <a id="ref-03"></a>[CLEANUP_REPORT.md](docs/technical-reference.md#ref-03)
- <a id="ref-04"></a>[docs/account-recovery.md](docs/technical-reference.md#ref-04)
- <a id="ref-05"></a>[docs/adr/0001-postgresql-invoice-authority.md](docs/technical-reference.md#ref-05)
- <a id="ref-06"></a>[docs/adr/0002-postgresql-migration.md](docs/technical-reference.md#ref-06)
- <a id="ref-07"></a>[docs/adr/0003-single-container-postgresql.md](docs/technical-reference.md#ref-07)
- <a id="ref-08"></a>[docs/adr/0004-business-databases.md](docs/technical-reference.md#ref-08)
- <a id="ref-09"></a>[docs/API_DOCUMENTATION.md](docs/technical-reference.md#ref-09)
- <a id="ref-10"></a>[docs/ARCHITECTURE.md](docs/technical-reference.md#ref-10)
- <a id="ref-11"></a>[docs/architecture/CURRENT_STATE_AUDIT.md](docs/technical-reference.md#ref-11)
- <a id="ref-12"></a>[docs/architecture/TARGET_STATE.md](docs/technical-reference.md#ref-12)
- <a id="ref-13"></a>[docs/AUTHENTICATION_SECURITY.md](docs/technical-reference.md#ref-13)
- <a id="ref-14"></a>[docs/backup-and-production-validation.md](docs/technical-reference.md#ref-14)
- <a id="ref-15"></a>[docs/BACKUP_RESTORE.md](docs/technical-reference.md#ref-15)
- <a id="ref-16"></a>[docs/barcode-module.md](docs/technical-reference.md#ref-16)
- <a id="ref-17"></a>[docs/DATABASE_DESIGN.md](docs/technical-reference.md#ref-17)
- <a id="ref-18"></a>[docs/delivery-phases.md](docs/technical-reference.md#ref-18)
- <a id="ref-19"></a>[docs/DEPLOYMENT_GUIDE.md](docs/technical-reference.md#ref-19)
- <a id="ref-20"></a>[docs/design-system.md](docs/technical-reference.md#ref-20)
- <a id="ref-21"></a>[docs/DOCKER_DEPLOYMENT.md](docs/technical-reference.md#ref-21)
- <a id="ref-22"></a>[docs/erd.md](docs/technical-reference.md#ref-22)
- <a id="ref-23"></a>[docs/installment-pricing.md](docs/technical-reference.md#ref-23)
- <a id="ref-24"></a>[docs/migration/01-repository-audit.md](docs/technical-reference.md#ref-24)
- <a id="ref-25"></a>[docs/migration/02-mongodb-inventory.md](docs/technical-reference.md#ref-25)
- <a id="ref-26"></a>[docs/migration/03-dependency-map.md](docs/technical-reference.md#ref-26)
- <a id="ref-27"></a>[docs/migration/04-data-profile.md](docs/technical-reference.md#ref-27)
- <a id="ref-28"></a>[docs/migration/05-data-quality-report.md](docs/technical-reference.md#ref-28)
- <a id="ref-29"></a>[docs/migration/07-etl-guide.md](docs/technical-reference.md#ref-29)
- <a id="ref-30"></a>[docs/migration/08-reconciliation-report.md](docs/technical-reference.md#ref-30)
- <a id="ref-31"></a>[docs/migration/09-hybrid-invoices.md](docs/technical-reference.md#ref-31)
- <a id="ref-32"></a>[docs/migration/POSTGRESQL_MIGRATION_PLAN.md](docs/technical-reference.md#ref-32)
- <a id="ref-33"></a>[docs/module-registration.md](docs/technical-reference.md#ref-33)
- <a id="ref-34"></a>[docs/MODULE_MANAGEMENT.md](docs/technical-reference.md#ref-34)
- <a id="ref-35"></a>[docs/POSTGRESQL_MIGRATION.md](docs/technical-reference.md#ref-35)
- <a id="ref-36"></a>[docs/project-structure.md](docs/technical-reference.md#ref-36)
- <a id="ref-37"></a>[docs/README.md](docs/technical-reference.md#ref-37)
- <a id="ref-38"></a>[docs/RELEASE_CHECKLIST.md](docs/technical-reference.md#ref-38)
- <a id="ref-39"></a>[docs/ROLLBACK_GUIDE.md](docs/technical-reference.md#ref-39)
- <a id="ref-40"></a>[docs/specification-implementation.md](docs/technical-reference.md#ref-40)
- <a id="ref-41"></a>[docs/TENANT_ISOLATION.md](docs/technical-reference.md#ref-41)
- <a id="ref-42"></a>[docs/TEST_REPORT.md](docs/technical-reference.md#ref-42)
- <a id="ref-43"></a>[docs/WINDOWS_INSTALLER.md](docs/technical-reference.md#ref-43)
- <a id="ref-44"></a>[desktop/windows/KazmiOn-Launcher/README.txt](docs/technical-reference.md#ref-44)

</details>
