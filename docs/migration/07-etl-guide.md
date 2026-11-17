# PostgreSQL staging transfer

## Scope

The current engine copies **all discovered application documents** into isolated
PostgreSQL staging databases. It preserves the raw BSON bytes and verifies SHA-256
checksums in PostgreSQL and against a second MongoDB read. It does not yet convert
those records into the final normalized application schema, migrate file contents,
drain Redis jobs, replace API repositories or switch the worker runtime.

Staging BSON is deliberate preservation evidence, not the proposed runtime data
model. Financial fields still need normalized NUMERIC columns and exact-decimal
reconciliation before runtime cutover. Do not serve production from staging tables.

## Isolation and installation

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

## Routing and resume behavior

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

## Validation and recovery

The engine checks target record counts, stored bytes against stored hashes, and
second-pass source hashes. It rejects deleted/stale target records through count
mismatches. Rerunning an unchanged source is supported and verified locally.

No drop, truncate, source update or source delete operations are implemented. If a
source changes after capture, preserve the staging database and inspect the change;
do not clear it to force a green report. A future snapshot-run registry must support
multiple source snapshots explicitly before repeated production rehearsal.

Retain MongoDB volumes and invoice files. No production connection was changed;
there is therefore no production cutover to roll back at this stage.
