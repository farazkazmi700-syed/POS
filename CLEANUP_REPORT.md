# KazmiOn POS — Cleanup Report (Phase 5)

Date: 2026-11-18 · Branch: `feature/single-container-production`
Rule applied: delete only proven-obsolete files; no volumes, databases, backups, uploads or Git history touched.

## Classification

### Removed (proven obsolete)
| Item | Reason |
|---|---|
| `docker-compose.legacy-mongo.yml` | References the retired MongoDB container stack; superseded by the single-container PostgreSQL design (ADR 0003). |
| `docker-compose.postgres-staging.yml` | Staging overlay for the interim Postgres migration phase; migration complete (docs/migration/08-reconciliation-report.md). |
| `docker-compose.postgres-invoices.yml` | Interim invoice-store overlay; invoice store now built into the single image. |
| `KazmiOn-Launcher-Files.zip` | Duplicate packaging artifact of `KazmiOn-Launcher/` (zip of the same files). |
| `KazmiOn-startup.log`, `single-build.log` | Transient logs, regenerated on every run. |

### Kept — active
- `docker-compose.yml` — original single-service compose; retained for continuity with `update-docker.ps1`/existing installs (name `pos-postgresql`). Candidate for later removal after all client installs migrate to `compose.yaml`.
- `docker-compose.prod.yml` — small port overlay used by existing deployments.
- `docker-compose.single.yml` — documented build path in ADR 0003 (include of docker-compose.yml).
- `KazmiOn-Launcher/`, `KazmiOn-Launch.bat`, `KazmiOn-Start.ps1` — Windows client launcher (start script now points at `compose.yaml`).
- `apps/analytics-service`, `apps/chatbot-service` — documented future-service stubs; referenced in README, module manifests (`ai-chatbot`, coming-soon), support module and QA tests. Removing them would break `qa/delivery-phase-checks.cjs` and the UI.
- `scripts/migration/*` — data migration tooling incl. `copy-single-container.cjs`, required for existing-install cutover (ADR 0003). Its `node_modules/` is a local, non-committed cache.
- `scripts/migrate/*`, `database/postgresql/migrations/*` — versioned migration history (protected).
- `venv/` (repo root) — Python venv for the documented stub services; kept.
- `backups/`, `storage/` — customer data (protected).

### Uncertain — NOT deleted, needs owner approval
- `docker-compose.single.yml` vs `compose.yaml` duplication — consolidate after all installs use `compose.yaml`.
- `apps/api/.gitignore`, `apps/pdf-worker/.gitignore` deleted in working tree (uncommitted change from prior work); verify intent before committing.
- Root `venv/` size vs. shipping in image — not part of the Docker build either way.

## Actions taken
1. Removed the 5 files above (git rm) — see commit on this branch.
2. Root `KazmiOn-Start.ps1` stale path `compose.production.yaml` fixed → `pos-system\compose.yaml`.
3. No docker volume, container, image or database was removed. No `docker system prune` or `compose down -v` was executed.

## Regression testing after cleanup
Covered in Phase 7 (typecheck, API unit tests, image build, container smoke test). No protected item was in the removed set.
