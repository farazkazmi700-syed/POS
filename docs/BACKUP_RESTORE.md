# KazmiOn — Backup & Restore

## Tenant Business Export (Application UI)

The **Backup** page is available only to the business Owner. It creates a tenant-scoped logical JSON export and records the download in the audit log. It deliberately excludes credentials, active sessions, external files, and Redis jobs.

This file supports an operator-reviewed recovery workflow; it is not an automatic restore image and does not replace the database backups below. Keep the original file and its SHA-256 checksum together in encrypted storage.

## MongoDB Backup (Primary Database)

All business data lives in MongoDB. Back this up regularly.

### Manual Backup

```powershell
# Default settings — saves to .\backups\mongo\, retains last 7
.\scripts\backup\mongo-backup.ps1

# Custom location, keep 14 days
.\scripts\backup\mongo-backup.ps1 -BackupRoot "D:\KazmiOn-Backups" -KeepLast 14

# Custom MongoDB URI
.\scripts\backup\mongo-backup.ps1 -MongoUri "mongodb://localhost:27017/pos"
```

**Output:** Timestamped `.zip` file, e.g. `.\backups\mongo\20261117_143000.zip`  
**Requires:** `mongodump` on PATH (included with [MongoDB Database Tools](https://www.mongodb.com/try/download/database-tools))

### MongoDB Restore

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

## PostgreSQL Backup (Optional — Migration Layer)

Only needed if using the PostgreSQL hybrid invoice store.

### Manual Backup

```powershell
# Default settings — saves to .\backups\postgres\
$env:POSTGRES_URL = "postgresql://kazmion:password@localhost:5432/kazmion"
.\scripts\backup\pg-backup.ps1

# Custom
.\scripts\backup\pg-backup.ps1 -BackupRoot "D:\KazmiOn-Backups\pg" -KeepLast 14
```

**Output:** `.dump` file in PostgreSQL custom format  
**Requires:** `pg_dump` on PATH (from [PostgreSQL client tools](https://www.postgresql.org/download/windows/))

### PostgreSQL Restore

```powershell
pg_restore `
  -d "postgresql://kazmion:password@localhost:5432/kazmion" `
  -Fc `
  ".\backups\postgres\kazmion_20261117.dump"
```

---

## Automated Backup (Windows Task Scheduler)

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

## Backup Checklist (Before Any Major Change)

- [ ] Run `.\scripts\backup\mongo-backup.ps1`
- [ ] Confirm backup `.zip` file exists and size > 1 KB
- [ ] Record the backup path in your change log
- [ ] Optionally: test restore to a separate test database

---

## Docker Volume Backup (Alternative)

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

## Retention Policy

Default: last **7** backups retained. Older backups are automatically deleted by the script.  
Adjust with `-KeepLast` parameter.

Recommended minimum retention: **30 days** for production.
