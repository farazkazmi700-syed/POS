# KazmiOn POS — Deployment Guide (Single Container)

Target: Windows 10/11 client PC with Docker Desktop. Fully offline after installation.

## What ships
One image (`kazmion/pos:latest`), one container (`kazmion-pos`) containing PostgreSQL 17, FerretDB gateway, Redis, NestJS API, PDF worker and the compiled React frontend behind nginx. App URL: `http://localhost:8080`.

## Prerequisites
- Docker Desktop for Windows (WSL2 backend), running.
- Nothing else.

## Fresh installation
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

## Daily use
| Action | Command / script |
|---|---|
| Start | `scripts\start.ps1` (or `KazmiOn-Launch.bat`) |
| Stop | `scripts\stop.ps1` |
| Logs | `docker compose logs -f kazmion` |
| Status | `docker compose ps` |
| Health | `http://localhost:8080/health` |

## Required commands
```powershell
docker compose build
docker compose up -d
docker compose ps
docker compose logs -f
docker compose down
docker image ls
```

## Data persistence
Named volumes (survive container replacement and upgrades):
- `kazmion_pgdata` — PostgreSQL cluster incl. generated service credentials
- `kazmion_uploads` — generated PDF invoices (`/data/invoices`)
- `kazmion_backups` — `/app/backups` inside the container

PostgreSQL, FerretDB and Redis bind to the container loopback only; only port 8080 is published, to `127.0.0.1`.

## Upgrades (data-safe)
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\update.ps1
```
Takes a pre-update backup, rebuilds, replaces the container, never touches volumes. Image rebuild is required for any code/module change — modules ship inside the image.

## Backups / restore
```powershell
scripts\backup.ps1 [-OutputDir <dir>]     # pg_dump + invoice files
scripts\restore.ps1 -SqlFile backups\manual\pos-<stamp>.sql [-InvoicesDir backups\manual\invoices-<stamp>]
```

## Offline operation
After image build and first boot, the stack needs no internet. Avoid `docker compose pull` on client machines.

## Architecture notes
- Each business is tenant-isolated at the application layer (business/branch scoping enforced in API guards + DocumentDB extension tables); see `docs/TENANT_ISOLATION.md` and `docs/adr/0003-single-container-postgresql.md` for why physical per-business databases were not adopted (they would require breaking application changes).
- Process supervision: supervisord (`docker/supervisord.conf`), Postgres readiness-gated app startup, autorestart on failure.
