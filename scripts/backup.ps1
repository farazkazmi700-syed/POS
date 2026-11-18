# KazmiOn POS - Backup PostgreSQL data + invoice files into the kazmion_backups volume and a host folder.
param([string]$OutputDir = "")
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
if (-not $OutputDir) { $OutputDir = Join-Path (Get-Location) "backups\manual" }
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

Write-Host "== PostgreSQL logical backup ==" -ForegroundColor Cyan
docker compose exec -T kazmion sh -c "pg_dump -U postgres --clean --if-exists" | Out-File -Encoding utf8 (Join-Path $OutputDir "pos-$stamp.sql")
if ($LASTEXITCODE -ne 0) { throw "pg_dump failed." }

Write-Host "== Invoice files backup ==" -ForegroundColor Cyan
docker compose cp "kazmion:/data/invoices" (Join-Path $OutputDir "invoices-$stamp")
if ($LASTEXITCODE -ne 0) { throw "Invoice copy failed." }

Write-Host "Backup complete:" -ForegroundColor Green
Get-ChildItem $OutputDir | Where-Object { $_.Name -match $stamp } | ForEach-Object { Write-Host "  $($_.FullName)" }
Write-Host "Restore later with: scripts\restore.ps1 -SqlFile <pos-*.sql>"
