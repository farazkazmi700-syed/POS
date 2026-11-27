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
| `.github/workflows/` | CI and approval-gated release workflows |

The Docker build context is the repository root. The image is defined at `docker/Dockerfile` and the default stack at `docker/compose/compose.yaml`. Use `npm run docker:start` or pass both `--env-file .env` and `-f docker/compose/compose.yaml` from the repository root. Existing launch scripts can use the compatibility Compose files. The standalone `docker/compose/docker-compose.postgres.yml` supports development and migration work.

## Windows installation

For a new installation with Docker Desktop running, run the following command from the repository root.

```powershell
.\deploy\scripts\install.ps1
```

Open the POS at `http://localhost:8080`. nginx exposes API documentation at `/api/docs` and application health at `/health`. Existing installations can start through `desktop/windows/KazmiOn-Launch.bat`. Review the installation's volume mappings and backup procedure before upgrading.

## Development and verification

CI uses Node.js 24. Each shipped service has an npm lockfile. Run these commands from the repository root.

```sh
npm ci
npm ci --prefix app/api
npm ci --prefix app/pdf-worker
npm ci --prefix app/web
npm run build
npm run test:all
docker compose --env-file .env -f docker/compose/compose.yaml config --quiet
```

Use `npm run dev:web` for the Vite development server on port 5173. Its default API proxy targets port 8080. Owners manage invoice taxes under **Settings > Tax and service charges**.

## CI and deployment

GitHub Actions validates repository syntax, builds the API, PDF worker and web
app, and runs unit tests, live API tests, PostgreSQL migration rehearsals and
Chromium suites. The packaged image also runs a real browser smoke test and an
isolated LAN, checkout, restart and encrypted restore rehearsal. MongoDB and
Redis service containers used by the API test jobs are disposable fixtures.

Pushes and pull requests only validate code. After the required tests and V1
pilot are approved, dispatch **Release V1** from `main`, select `container`
or `pages`, and record the approval in the workflow input. Configure the
GitHub `production` environment with required reviewers and restrict it to
`main`. The workflow reruns CI for that commit before it can publish. The
[pilot checklist](desktop/windows/offline/handoff/PILOT-AND-RELEASE-GATES.txt)
records the required approvals and outstanding gates.

### Single-host cloud deployment

Use a Linux x86-64 host with Docker and Compose V2. Keep the container bound to
`127.0.0.1:8080` and terminate TLS at a host reverse proxy or tunnel. The
proxy should pass the original host and client address. The PostgreSQL,
FerretDB and Redis ports stay inside the container. Run a single active stack
per data volume set.

1. Create a restricted `.env` from `.env.example`. Set independent random JWT
   and setup secrets, a platform developer email, the exact HTTPS browser
   origin in `CORS_ORIGIN`, and the public `/reset-password` URL. Configure
   verified delivery channels if password recovery needs them.
2. The container release job builds, browser-tests and publishes a commit-tagged
   image to GHCR. Copy the approved registry digest from its job summary into
   `KAZMION_IMAGE` as `ghcr.io/<owner>/<repo>@sha256:<digest>`. Authenticate
   the deployment host to GHCR if the package is private.
3. Before an upgrade, record the previous image digest, protect a copy of
   `.env` and take a verified encrypted backup. Keep existing volume
   mappings and run:

   ```sh
   docker compose --env-file .env -f docker/compose/compose.yaml config --quiet
   docker compose --env-file .env -f docker/compose/compose.yaml pull kazmion
   docker compose --env-file .env -f docker/compose/compose.yaml up -d --no-build --pull never --wait --wait-timeout 300
   curl --fail --silent --show-error http://127.0.0.1:8080/api/health
   ```

4. Verify health and sign-in through the public HTTPS endpoint. Keep the old
   image and backup until acceptance. For rollback after a data change, restore
   the backup into new volumes with the matching image and verify records before
   cutover.

The V1 image uses the PostgreSQL DocumentDB extension through FerretDB. The
native relational cutover remains a separate migration and approval gate.

### Cloudflare Pages

Full procedure, prerequisites and known blockers: [deploy/DEPLOY.md](deploy/DEPLOY.md).

For a separate Pages frontend, configure `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID` as `production` environment secrets. Verify the
compatible API deployment over HTTPS before dispatching the Pages release.
The target project is `kazmion-pos-web`. Set `VITE_API_BASE_URL` to the HTTPS
API origin including `/api`, `CORS_ORIGIN` on the API to the Pages origin,
and `PASSWORD_RESET_BASE_URL` on the API to the Pages URL ending in
`/reset-password`.

SPA routing and cache rules ship with the static build via `_redirects` and
`_headers`.

## Tenant Trash

In Developer Engine, open **Business Tenants** and select **Delete tenant**.
Enter the exact business name and confirm that access will be lost. The tenant
will move to **Trash** and can be restored there for 30 days. Restoring returns
the tenant to its previous active or suspended status.

The running API checks Trash every minute and retries unfinished cleanup. It
removes live tenant records, account recovery records, queued invoice jobs and
local invoice PDFs. In PostgreSQL invoice mode, cleanup also removes invoice
rows from the tenant's database. Standalone PostgreSQL installations should
rerun the invoice-store preparation script to grant the required DELETE
permission. The unified Docker provisioner applies the grant on startup.

Remote invoice storage requires a supported cleanup integration. A purge that
cannot complete remains visible in Trash for retry. Downloaded backups and
copies stored outside the installation follow their own retention policies.

## LAN access and recovery

The POS container publishes only `127.0.0.1:8080`. PostgreSQL, the document gateway, Redis, and the NestJS API stay inside the container. Keep that loopback binding and use the host TLS gateway when authorized terminals need LAN access.

1. Reserve a private IPv4 address for the server and for each authorized terminal. Restrict inbound TCP 8080 in the host firewall to those terminal IPs on the private network profile. Keep router port forwarding disabled. The gateway also checks the actual peer IP against an exact allowlist so forwarded headers cannot grant access.
2. Obtain a TLS certificate that covers the LAN DNS name or IP in its Subject Alternative Name. Install the issuing CA on the terminals. Run the gateway as a dedicated host user with read access to the TLS key. For PowerShell, set these values before running it:
   ```powershell
   $env:POS_LAN_BIND_IP = '192.168.50.10'
   $env:POS_LAN_HOST = 'pos.lan.example'
   $env:POS_LAN_CLIENTS = '192.168.50.21,192.168.50.22'
   $env:POS_LAN_TLS_CERT = 'E:\POS-TLS\fullchain.pem'
   $env:POS_LAN_TLS_KEY = 'E:\POS-TLS\private.key'
   node deploy/scripts/lan-gateway.cjs
   ```
3. Open `https://pos.lan.example:8080` from an authorized terminal. Add that exact HTTPS origin to `CORS_ORIGIN` and use it in `PASSWORD_RESET_BASE_URL` if terminals need password recovery. Keep business logins and roles enabled. Use sign-out on shared terminals. The trusted HTTPS origin also allows browser camera access, while labels and printable PDFs are generated locally.

### Encrypted cold backup

This procedure covers the standard Docker installation's PostgreSQL cluster and credentials, Redis queue state, and uploaded documents and invoice PDFs. Schedule a maintenance window and stop access while taking the backup. Rebuild the POS image to include the updated PostgreSQL shutdown order. The container must be cleanly stopped and its volumes unused, including by other containers.

Use a physically separate encrypted drive or offline backup location for archives. Generate a 32-byte AES key in a restricted directory on a different device. Copy the key to a second protected offline location and record which archives use it. The key is required to recover the archive. Store the Docker image identified by its immutable image ID and a separate protected copy of the deployment configuration, JWT secrets, and TLS materials for disaster recovery. Restrict Windows folder ACLs because the file mode set by the script does not replace Windows ACLs.

```powershell
node deploy/scripts/backup/pos-encrypted-backup.cjs keygen E:\POS-Keys\archive.key
docker stop -t 90 kazmion-pos
node deploy/scripts/backup/pos-encrypted-backup.cjs backup kazmion-pos F:\POS-Archives\snapshot.kzpos E:\POS-Keys\archive.key
docker start kazmion-pos
```

A backup with the same path is rejected. The archive streams directly to AES-256-GCM with a random nonce. Keep the archive and recovery key separate, and use a new key for future backups when rotating keys. Retain the old keys until their last archive expires.

### Restore rehearsal

Keep the original volumes and select a new prefix. The restore verifies the entire archive before extraction, requires the original image to be available locally, and creates new volumes. It does not replace an existing installation.

```powershell
node deploy/scripts/backup/pos-encrypted-backup.cjs restore F:\POS-Archives\snapshot.kzpos E:\POS-Keys\archive.key pos-restore-rehearsal
```

Start an isolated POS container with the returned image and volume names. Mount the restored `pgdata` at `/var/lib/postgresql/data`, `queue` at `/data/redis`, and `uploads` at `/data/invoices`. Keep it bound to loopback on a spare host port and use fresh JWT secrets so restored sessions cannot be reused. Confirm login, sales totals, inventory and invoice PDFs. After review, an operator can point the regular Compose service at the restored volumes using `KAZMION_EXISTING_VOLUMES=true`, `KAZMION_PG_VOLUME`, `KAZMION_QUEUE_VOLUME`, and `KAZMION_UPLOAD_VOLUME`. Keep the old volumes for rollback until the restored installation is accepted.

Run the isolated automated rehearsal by setting `SPEC_LAN_POS_IMAGE` to a locally available unified POS image and running `node --test qa/lan-protection.test.cjs`. It creates and removes only its own test containers and volumes.

## Business Data Sync

V1 supports local backup downloads. It does not send synchronization requests, even if a cloud destination was previously configured.

### V2 PostgreSQL contract

Apply `004_sync_v2.sql` to the native relational PostgreSQL database through the migration runner. Existing UUIDs, tenant IDs, and financial rows are preserved. Existing rows start at version 1 with a sync timestamp set at migration time. Business timestamps retain their original values. The initial export includes pre-migration rows. The current DocumentDB-backed production tables require a separate native PostgreSQL cutover before they can emit these events.

The contract ID is `kazmion.sync`, version `2`. Export functions are local SQL operations for a trusted database operator.

| Function | Envelope |
| --- | --- |
| `pos_sync.snapshot(tenant_id)` | `kind=snapshot`, `sourceId`, `tenantId`, `checkpoint`, `exportedAt`, `collections`, and `financialHistory`. The rows and checkpoint come from one consistent view. |
| `pos_sync.changes(tenant_id, after, limit)` | `kind=changes`, `sourceId`, `tenantId`, `after`, `checkpoint`, `hasMore`, and ordered `events`. Pages contain at most 1,000 events. |

Each event includes an immutable UUID `eventId`, `sequence`, `entity`, `entityId`, `entityVersion`, `operation`, `occurredAt`, and `record`. Operation is `upsert` or `tombstone`. Sequence, cursor, and version values are decimal strings. Timestamps use UTC. Preserve PostgreSQL numeric values using a decimal-aware parser for financial figures. Exports contain customer and financial data and require restricted storage. Credentials, authentication material, and local invoice file paths are outside the contract.

- **Baseline and replay.** Install a snapshot atomically, then request changes after its checkpoint. A consumer durably records the checkpoint per `(sourceId, tenantId)` in the same transaction as applying a page. Deduplicate by event UUID. A repeated UUID with different content, a gap, or a tenant/source mismatch rejects the page. A cursor below the retained floor requires a new snapshot. Keep a restored source single-writer and preserve its source ID. A separately writable copy needs a new source identity before onboarding.
- **Conflicts.** This contract assumes one authoritative writer per tenant. Compare entity versions within that source. A late lower version is a replay and cannot overwrite a newer row. Divergent data at the same version, unsolicited competing edits, or a version gap require review. Time is for audit only. A tombstone prevents automatic resurrection. Reference records are retired by setting `deleted_at`. Operational queries must exclude these records. Physical deletion is prohibited for synchronized tables.
- **Financial history.** Financial records cannot be deleted or tombstoned. Invoice counters are monotonic. Use authorized voids, refunds, and adjustment workflows for corrections. The outbox records the committed version, while a separate financial history ledger retains both the before and after states of financial changes. Historical source rows predating migration are preserved in the baseline.
- **Acknowledgements and retention.** `pos_sync.acknowledge(tenant_id, consumer_id, checkpoint)` accepts monotonic acknowledgements after durable application. `pos_sync.prune(tenant_id)` removes only a contiguous prefix at least 90 days old and acknowledged by every registered consumer. Without acknowledgements, the outbox is retained. Pruning leaves the financial history ledger and tombstones intact. V1 has no scheduled pruning or cloud consumer.

For rehearsal, run `node --test qa/sync-v2-postgres.test.cjs` with `SPEC_SYNC_POSTGRES_URL` pointed at an empty isolated local PostgreSQL database named `pos_sync_rehearsal`. The test seeds V1 records before applying the migration and checks baseline and incremental exports, rollback, tenant isolation, tombstones, acknowledgements, and retention.

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
