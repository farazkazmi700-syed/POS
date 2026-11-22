<#
.SYNOPSIS
  KazmiOn PostgreSQL Backup Script (Windows PowerShell)
.DESCRIPTION
  Creates a timestamped pg_dump backup (custom format) of the KazmiOn database.
  Keeps the last 7 backups by default.
.PARAMETER PostgresUrl
  PostgreSQL connection URL (defaults to POSTGRES_URL env var)
.PARAMETER BackupRoot
  Root directory for backups (defaults to BACKUP_ROOT env var or .\backups\postgres)
.PARAMETER KeepLast
  Number of backups to retain (default: 7)
.EXAMPLE
  .\deploy\scripts\backup\pg-backup.ps1
  $env:POSTGRES_URL = "postgresql://kazmion:pass@localhost:5432/kazmion"
  .\deploy\scripts\backup\pg-backup.ps1
#>
param(
  [string]$PostgresUrl = "",
  [string]$BackupRoot  = "",
  [int]$KeepLast       = 7
)

if (-not $PostgresUrl) {
  $PostgresUrl = if ($env:POSTGRES_URL) { $env:POSTGRES_URL } else { "postgresql://kazmion:kazmion@localhost:5432/kazmion" }
}
if (-not $BackupRoot) {
  $BackupRoot = if ($env:BACKUP_ROOT) { $env:BACKUP_ROOT } else { ".\backups\postgres" }
}

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$Timestamp  = Get-Date -Format "yyyyMMdd_HHmmss"
$BackupFile = Join-Path $BackupRoot "kazmion_${Timestamp}.dump"

Write-Host "========================================"
Write-Host "KazmiOn PostgreSQL Backup"
Write-Host "Timestamp : $Timestamp"
Write-Host "Output    : $BackupFile"
Write-Host "========================================"

# Create directory
New-Item -ItemType Directory -Path $BackupRoot -Force | Out-Null

# pg_dump in custom format (supports parallel restore with pg_restore)
$pgArgs = @("-Fc", "--no-password", "-f", $BackupFile, $PostgresUrl)
Write-Host "`nRunning pg_dump..."
$proc = Start-Process -FilePath "pg_dump" -ArgumentList $pgArgs -Wait -PassThru -NoNewWindow
if ($proc.ExitCode -ne 0) {
  Write-Error "pg_dump failed with exit code $($proc.ExitCode)"
  exit 1
}

$size = (Get-Item $BackupFile).Length / 1MB
Write-Host "`n[OK] Backup complete — $BackupFile ($([Math]::Round($size,2)) MB)"

# Rotate
$AllBackups = @(Get-ChildItem -Path $BackupRoot -Filter "*.dump" |
  Sort-Object LastWriteTime -Descending)
if ($AllBackups.Count -gt $KeepLast) {
  $ToDelete = $AllBackups | Select-Object -Skip $KeepLast
  foreach ($f in $ToDelete) {
    Write-Host "[rotate] Removing old backup: $($f.Name)"
    Remove-Item $f.FullName -Force
  }
}

Write-Host "`n[OK] Done. Retained $([Math]::Min($AllBackups.Count, $KeepLast)) backups in $BackupRoot"
Write-Host ""
Write-Host "To restore:"
Write-Host "  pg_restore -d `$PostgresUrl -Fc $BackupFile"
