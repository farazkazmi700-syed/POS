# KazmiOn POS - Safe update: rebuild image, replace container, PRESERVE all data volumes.
# Never runs 'docker compose down -v' and never prunes volumes.
param([switch]$NoCache)
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

Write-Host "== Pre-update backup ==" -ForegroundColor Cyan
& (Join-Path $PSScriptRoot "backup.ps1")
if ($LASTEXITCODE -ne 0) { throw "Pre-update backup failed. Update aborted; running container unchanged." }

Write-Host "== Building updated image ==" -ForegroundColor Cyan
$args = @("compose", "build"); if ($NoCache) { $args += "--no-cache" }
docker @args
if ($LASTEXITCODE -ne 0) { throw "Build failed. Running container is UNCHANGED and data is safe." }

Write-Host "== Replacing container (volumes preserved) ==" -ForegroundColor Cyan
docker compose up -d
if ($LASTEXITCODE -ne 0) { throw "Container replacement failed. Check 'docker compose logs'." }

Write-Host "== Waiting for health ==" -ForegroundColor Cyan
foreach ($i in 1..60) {
    try { if ((Invoke-WebRequest -Uri "http://localhost:8080/health" -UseBasicParsing -TimeoutSec 3).StatusCode -eq 200) {
        Write-Host "Update complete. Data volumes preserved. http://localhost:8080" -ForegroundColor Green; exit 0 } } catch { }
    Start-Sleep -Seconds 2
}
docker compose logs --tail 50
throw "Application not healthy after update. Previous data volumes remain intact."
