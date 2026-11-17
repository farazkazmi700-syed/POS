<#
.SYNOPSIS
  KazmiOn MongoDB Backup Script (Windows PowerShell)
.DESCRIPTION
  Creates a timestamped mongodump backup of the POS database.
  Keeps the last 7 backups by default.
.PARAMETER MongoUri
  MongoDB connection URI (defaults to MONGO_URI env var or localhost)
.PARAMETER BackupRoot
  Root directory for backups (defaults to BACKUP_ROOT env var or .\backups\mongo)
.PARAMETER KeepLast
  Number of backups to retain (default: 7)
.EXAMPLE
  .\scripts\backup\mongo-backup.ps1
  .\scripts\backup\mongo-backup.ps1 -MongoUri "mongodb://localhost:27017/pos" -KeepLast 14
#>
param(
  [string]$MongoUri   = "",
  [string]$BackupRoot = "",
  [int]$KeepLast      = 7
)

if (-not $MongoUri) {
  $MongoUri = if ($env:MONGO_URI) { $env:MONGO_URI } else { "mongodb://localhost:27017/pos" }
}
if (-not $BackupRoot) {
  $BackupRoot = if ($env:BACKUP_ROOT) { $env:BACKUP_ROOT } else { ".\backups\mongo" }
}

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$Timestamp  = Get-Date -Format "yyyyMMdd_HHmmss"
$BackupDir  = Join-Path $BackupRoot $Timestamp

Write-Host "========================================"
Write-Host "KazmiOn MongoDB Backup"
Write-Host "Timestamp : $Timestamp"
Write-Host "URI       : $MongoUri"
Write-Host "Output    : $BackupDir"
Write-Host "========================================"

# Create backup directory
New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null

# Run mongodump (prefer local command, fallback to docker container)
$hasLocalMongodump = [bool](Get-Command "mongodump" -ErrorAction SilentlyContinue)

if ($hasLocalMongodump) {
  $args = @("--uri=$MongoUri", "--out=$BackupDir", "--gzip")
  Write-Host "`nRunning local mongodump..."
  $proc = Start-Process -FilePath "mongodump" -ArgumentList $args -Wait -PassThru -NoNewWindow
  if ($proc.ExitCode -ne 0) {
    Write-Error "mongodump failed with exit code $($proc.ExitCode)"
    exit 1
  }
} else {
  Write-Host "`nLocal mongodump not found. Checking Docker container 'pos-system-mongo-1'..."
  $containerRunning = docker ps --filter "name=pos-system-mongo-1" --format "{{.Names}}" 2>$null
  if ($containerRunning -contains "pos-system-mongo-1") {
    Write-Host "Running mongodump inside Docker container..."
    $archiveContainerPath = "/tmp/pos_backup_$Timestamp.gz"
    docker exec pos-system-mongo-1 mongodump --db=pos --archive=$archiveContainerPath --gzip
    if ($LASTEXITCODE -ne 0) {
      Write-Error "Docker mongodump failed with exit code $LASTEXITCODE"
      exit 1
    }
    # Copy out to backup directory
    $archiveHostPath = Join-Path $BackupDir "pos_backup.gz"
    docker cp "pos-system-mongo-1:$archiveContainerPath" $archiveHostPath
    docker exec pos-system-mongo-1 rm $archiveContainerPath
  } else {
    Write-Error "Neither local mongodump nor Docker container pos-system-mongo-1 is available."
    exit 1
  }
}

# Verify output
$files = Get-ChildItem -Recurse $BackupDir | Measure-Object
Write-Host "`n[OK] Backup complete — $($files.Count) files in $BackupDir"

# Compress
$ZipPath = "$BackupDir.zip"
Compress-Archive -Path $BackupDir -DestinationPath $ZipPath -Force
Remove-Item -Recurse -Force $BackupDir
Write-Host "[OK] Compressed → $ZipPath"

# Rotate: keep only the last N backups
$AllBackups = @(Get-ChildItem -Path $BackupRoot -Filter "*.zip" |
  Sort-Object LastWriteTime -Descending)
if ($AllBackups.Count -gt $KeepLast) {
  $ToDelete = $AllBackups | Select-Object -Skip $KeepLast
  foreach ($f in $ToDelete) {
    Write-Host "[rotate] Removing old backup: $($f.Name)"
    Remove-Item $f.FullName -Force
  }
}

Write-Host "`n[OK] Done. Retained $([Math]::Min($AllBackups.Count, $KeepLast)) backups in $BackupRoot"
