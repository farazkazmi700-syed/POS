# PostgreSQL-authoritative invoices

## Implemented boundary

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

## Source of truth and job handling

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

## Local preparation and validation

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

## Activation gate

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

## Rollback

Stop invoice writers first. Preserve SQL invoice status, generation records and PDF
files. Reconcile SQL-generated paths/status back into MongoDB before enabling legacy
mode; otherwise successful PostgreSQL invoices become invisible to the legacy API.
Never simply change the mode while jobs are active or discard post-switch records.

## Remaining work

Normalized business/financial SQL schemas, transactional sale and stock repositories,
PostgreSQL authentication, automated new-business provisioning, backup/restore
rehearsal and full client installation migration are still pending. Do not remove
MongoDB application dependencies yet.

## Verification completed on 2026-11-15

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
