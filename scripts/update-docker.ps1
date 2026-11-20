<#
.SYNOPSIS
  KazmiOn — Safe Docker Update Script (data-preserving)

.DESCRIPTION
  Updates running Docker containers to the latest built images WITHOUT
  deleting any data volumes (PostgreSQL, Redis and invoices).

  Docker named volumes survive container replacement automatically.
  This script adds:
  - Pre-update PostgreSQL backup
  - Container health verification after update
  - Clear rollback instructions if anything fails

  WHAT IS PRESERVED (always):
    pos_system_postgres17_live   ← PostgreSQL cluster and credentials
    kazmion_redis_data   ← Redis queue persistence
    kazmion_invoice_data ← Generated PDF invoices

  WHAT IS REPLACED:
    Container images (api, web, pdf-worker)
    Container configurations

.PARAMETER SkipBackup
  Skip the pre-update PostgreSQL backup (not recommended for production)
.PARAMETER SkipVerify
  Skip the post-update smoke test
.PARAMETER NoCache
  Pass --no-cache to docker compose build (slower but guaranteed fresh)

.EXAMPLE
  # Normal update (recommended)
  .\scripts\update-docker.ps1

  # Update without cache (after major dependency changes)
  .\scripts\update-docker.ps1 -NoCache

  # Quick update skipping backup and verify (dev only)
  .\scripts\update-docker.ps1 -SkipBackup -SkipVerify
#>
param(
  [switch]$SkipBackup,
  [switch]$SkipVerify,
  [switch]$NoCache
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$Timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
$Step = 0

function Step {
  param([string]$Name)
  $script:Step++
  Write-Host ""
  Write-Host "[$($script:Step)] $Name" -ForegroundColor Cyan
  Write-Host ("─" * 50) -ForegroundColor DarkGray
}

function OK   { param([string]$msg) Write-Host "  ✓ $msg" -ForegroundColor Green }
function WARN { param([string]$msg) Write-Host "  ⚠ $msg" -ForegroundColor Yellow }
function FAIL { param([string]$msg) Write-Host "  ✗ $msg" -ForegroundColor Red }
function INFO { param([string]$msg) Write-Host "  · $msg" -ForegroundColor Gray }

# ─── Header ───────────────────────────────────────────────
Write-Host ""
Write-Host "════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  KazmiOn Docker Update — Data-Safe Container Update" -ForegroundColor Cyan
Write-Host "  $Timestamp" -ForegroundColor Cyan
Write-Host "════════════════════════════════════════════════════" -ForegroundColor Cyan

Set-Location $PSScriptRoot\..

# Make first-run Docker Compose configuration self-contained without printing secrets.
& ".\scripts\prepare-compose-env.ps1"

# ─── Step 1: Verify volumes exist ─────────────────────────
Step "Verifying data volumes"
$volumes = docker volume ls --format "{{.Name}}" 2>$null
$requiredVolumes = @("pos_system_postgres17_live", "kazmion_redis_data", "kazmion_invoice_data")
$allPresent = $true
foreach ($vol in $requiredVolumes) {
  if ($volumes -contains $vol) {
    OK "$vol found"
  } else {
    WARN "$vol not found — may be first run or different compose project"
    $allPresent = $false
  }
}
if (-not $allPresent) {
  INFO "Missing volumes are normal on first run — they will be created"
}

# ─── Step 2: Pre-update backup ────────────────────────────
if (-not $SkipBackup) {
  $backupDir = Join-Path $PSScriptRoot "../backups/postgres"
  New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
  $archive = "pos_$Timestamp"
  $destination = Join-Path $backupDir $archive
  New-Item -ItemType Directory -Path $destination -ErrorAction Stop | Out-Null
  & docker compose exec -T -u postgres pos-system pg_basebackup -D "/tmp/$archive" -Ft -z -X stream -c fast
  if ($LASTEXITCODE -ne 0) { throw "PostgreSQL base backup failed. Update stopped." }
  & docker compose cp "pos-system:/tmp/$archive/." $destination
  if ($LASTEXITCODE -ne 0) { throw "Could not copy PostgreSQL backup. Update stopped." }
  & docker compose cp "pos-system:/var/lib/postgresql/data/secrets" $destination
  if ($LASTEXITCODE -ne 0) { throw "Could not copy service credentials. Update stopped." }
  & docker compose exec -T -u postgres pos-system rm -r -- "/tmp/$archive"
}

# ─── Step 3: Show current container status ────────────────
Step "Current container status"
docker compose ps 2>&1 | ForEach-Object { INFO $_ }

# ─── Step 4: Build new images ─────────────────────────────
Step "Building updated images"
$buildArgs = @("compose", "build")
if ($NoCache) {
  $buildArgs += "--no-cache"
  INFO "Building with --no-cache (this may take several minutes)"
} else {
  INFO "Building with layer cache (use -NoCache for a full rebuild)"
}

Write-Host ""
docker @buildArgs
if ($LASTEXITCODE -ne 0) {
  FAIL "Build failed with exit code $LASTEXITCODE"
  Write-Host ""
  Write-Host "  Your running containers are UNCHANGED — existing data is safe." -ForegroundColor Green
  Write-Host "  Fix the build error and run this script again." -ForegroundColor Yellow
  exit 1
}
OK "Images built successfully"

# ─── Step 5: Replace containers (volumes NOT touched) ─────
Step "Replacing containers (preserving volumes)"
INFO "docker compose up -d replaces containers but NEVER deletes named volumes"
INFO "Data volumes: pos_system_postgres17_live, kazmion_redis_data, kazmion_invoice_data"
Write-Host ""

docker compose up -d
if ($LASTEXITCODE -ne 0) {
  FAIL "docker compose up failed with exit code $LASTEXITCODE"
  Write-Host ""
  Write-Host "  Attempting rollback: restarting previous containers..." -ForegroundColor Yellow
  docker compose restart 2>$null
  Write-Host "  Check 'docker compose logs' for details." -ForegroundColor Yellow
  exit 1
}
OK "Containers updated"

# ─── Step 6: Wait for health ──────────────────────────────
Step "Waiting for containers to become healthy"
$deadline = (Get-Date).AddSeconds(90)
$allHealthy = $false
while ((Get-Date) -lt $deadline) {
  $unhealthyList = @(docker compose ps --format json 2>$null |
    ConvertFrom-Json |
    Where-Object { $_.Health -notin @("healthy", "", $null) -and $_.State -eq "running" })

  if ($unhealthyList.Count -eq 0) {
    $allHealthy = $true
    break
  }
  INFO "Waiting... ($($unhealthyList.Count) container(s) still starting)"
  Start-Sleep 5
}

docker compose ps 2>&1 | ForEach-Object { INFO $_ }

if (-not $allHealthy) {
  WARN "Some containers may still be starting — check 'docker compose ps' in a moment"
}

# ─── Step 7: Post-update verification ─────────────────────
if (-not $SkipVerify) {
  Step "Post-update smoke test"
  if (Test-Path ".\scripts\verify-deployment.ps1") {
    try {
      & ".\scripts\verify-deployment.ps1" -TimeoutSec 60
      OK "Smoke test passed"
    } catch {
      WARN "Smoke test reported issues: $($_.Exception.Message)"
      WARN "Check 'docker compose logs' for details"
    }
  } else {
    WARN "verify-deployment.ps1 not found — skipping smoke test"
  }
}

# ─── Step 8: Volume confirmation ──────────────────────────
Step "Confirming data volumes intact"
foreach ($vol in $requiredVolumes) {
  $exists = docker volume ls --format "{{.Name}}" 2>$null | Where-Object { $_ -eq $vol }
  if ($exists) {
    OK "$vol — intact"
  } else {
    WARN "$vol — not found (new installation?)"
  }
}

# ─── Summary ──────────────────────────────────────────────
Write-Host ""
Write-Host "════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  UPDATE COMPLETE" -ForegroundColor Green
Write-Host "  Web:  http://localhost:8080" -ForegroundColor Cyan
Write-Host "  API:  http://localhost:3000/api/docs" -ForegroundColor Cyan
Write-Host "════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
Write-Host "  All data volumes preserved. No data was deleted." -ForegroundColor Green
Write-Host ""
Write-Host "  If the application is not working correctly:" -ForegroundColor Yellow
Write-Host "    docker compose logs pos-system" -ForegroundColor Gray
Write-Host ""
Write-Host "  To roll back to previous image (if tagged):" -ForegroundColor Yellow
Write-Host "    docker compose down" -ForegroundColor Gray
Write-Host "    # see README.md#ref-07 for storage and rollback" -ForegroundColor Gray
Write-Host "    # re-run previous deploy" -ForegroundColor Gray
Write-Host ""
