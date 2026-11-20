# KazmiOn POS

KazmiOn POS manages sales, inventory, customer accounts, installments and tax invoices. The default deployment runs the React app, NestJS API and invoice worker in a single container with nginx, PostgreSQL, FerretDB and Redis.

## Repository layout

| Path | Responsibility |
| --- | --- |
| `apps/api/`, `apps/web/`, `apps/pdf-worker/` | Services shipped in the default image |
| `packages/` | Shared types, contracts, configuration and invoice storage |
| `docker/` | Container entrypoint, process supervision and health checks |
| `infra/` | nginx configuration and PostgreSQL provisioning |
| `database/postgresql/` | Versioned SQL migrations |
| `scripts/` | Build, install, update, migration, backup and restore |
| `qa/` | Integration, browser and deployment tests |
| `docs/` | API specification, migration reports and technical reference |
| `KazmiOn-Launcher/` | Windows launcher installer sources |
| `.github/workflows/` | Continuous integration |

The root Dockerfile builds the production image. Compose uses `compose.yaml` by default. Existing launch scripts can use the compatibility Compose files. The standalone `docker-compose.postgres.yml` supports development and migration work.

## Windows installation

For a new installation with Docker Desktop running, run the following command from the repository root.

```powershell
.\scripts\install.ps1
```

Open the POS at `http://localhost:8080`. nginx exposes API documentation at `/api/docs` and application health at `/health`. Existing installations can start through `KazmiOn-Launch.bat`. Review the installation's volume mappings and backup procedure before upgrading.

## Development and verification

CI uses Node.js 24. Each shipped service has an npm lockfile. Run these commands from the repository root.

```sh
npm ci --prefix apps/api
npm ci --prefix apps/pdf-worker
npm ci --prefix apps/web
npm run build
npm run test:all
docker compose config --quiet
```

Use `npm run dev:web` for the Vite development server on port 5173. Its default API proxy targets port 8080. Owners manage invoice taxes under **Settings > Tax and service charges**.

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
- <a id="ref-44"></a>[KazmiOn-Launcher/README.txt](docs/technical-reference.md#ref-44)

</details>
