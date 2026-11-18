# KazmiOn POS - Stop the application container. Data volumes are NEVER touched.
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")
docker compose stop
if ($LASTEXITCODE -eq 0) { Write-Host "KazmiOn POS stopped. Data volumes preserved." -ForegroundColor Green }
