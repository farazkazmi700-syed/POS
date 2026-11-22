# KazmiOn POS - Stop the application container. Data volumes are NEVER touched.
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "../..")
docker compose -f docker/compose/compose.yaml stop
if ($LASTEXITCODE -eq 0) { Write-Host "KazmiOn POS stopped. Data volumes preserved." -ForegroundColor Green }
