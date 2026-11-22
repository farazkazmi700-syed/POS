# KazmiOn POS - Backup PostgreSQL data + invoice files into the kazmion_backups volume and a host folder.
param([string]$OutputDir = "")
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "../..")
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
if (-not $OutputDir) { $OutputDir = Join-Path (Get-Location) "backups\manual" }
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

Write-Host "== PostgreSQL logical backup ==" -ForegroundColor Cyan
$tempDump = '/tmp/pos-backup-' + [guid]::NewGuid().ToString('N') + '.sql'
try {
    docker compose -f docker/compose/compose.yaml exec -T -u postgres kazmion pg_dump -h 127.0.0.1 -U postgres -d postgres --encoding=UTF8 --clean --if-exists -f $tempDump
    if ($LASTEXITCODE) { throw "pg_dump failed." }
    docker compose -f docker/compose/compose.yaml cp "kazmion:$tempDump" (Join-Path $OutputDir "pos-$stamp.sql")
    if ($LASTEXITCODE) { throw "Could not copy database dump." }
} finally {
    docker compose -f docker/compose/compose.yaml exec -T -u postgres kazmion rm -f $tempDump
}

$businesses = docker compose -f docker/compose/compose.yaml exec -T -u postgres kazmion psql -XAt -v ON_ERROR_STOP=1 -c "SELECT tenant_id FROM kazmion_control.business_databases ORDER BY tenant_id"
if ($LASTEXITCODE) { throw 'Business database inventory failed' }
foreach ($id in $businesses) {
    & (Join-Path $PSScriptRoot "business-backup.ps1") -BusinessId $id -Directory (Join-Path $OutputDir "businesses-$stamp")
}

Write-Host "== Invoice files backup ==" -ForegroundColor Cyan
docker compose -f docker/compose/compose.yaml cp "kazmion:/data/invoices" (Join-Path $OutputDir "invoices-$stamp")
if ($LASTEXITCODE -ne 0) { throw "Invoice copy failed." }

Write-Host "Backup complete:" -ForegroundColor Green
Get-ChildItem $OutputDir | Where-Object { $_.Name -match $stamp } | ForEach-Object { Write-Host "  $($_.FullName)" }
Write-Host "Restore later with: deploy\scripts\restore.ps1 -SqlFile <pos-*.sql>"
