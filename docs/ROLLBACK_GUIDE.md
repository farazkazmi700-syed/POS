# KazmiOn POS — Rollback Guide

## Rollback an image upgrade (data preserved)
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

## Rollback after a restore went wrong
`backup.ps1` writes `pg_dump` archives. To return to a pre-restore state, restore the most recent backup taken before the bad one:
```powershell
scripts\restore.ps1 -SqlFile backups\manual\pos-<earlier-stamp>.sql
```

## Disaster recovery (lost container, volumes intact)
```powershell
docker compose up -d      # container recreates against existing volumes
```

## Disaster recovery (volume lost)
Restore from a full backup:
1. `docker compose down` (do NOT use `-v` unless discarding data intentionally).
2. Recreate empty volumes, start container once to initialize cluster, stop it.
3. `scripts\restore.ps1 -SqlFile <backup>.sql -InvoicesDir <invoices-backup>`
4. `scripts\start.ps1`

## Critical rules
- Never run `docker compose down -v` or `docker system prune --volumes` on a client machine — that deletes all business data.
- `kazmion_pgdata` contains the generated DB credentials; a volume restore must keep those credentials with the matching data.
- Take a `backup.ps1` snapshot before any rollback on a live system.
