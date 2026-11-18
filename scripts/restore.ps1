# KazmiOn POS - Restore a PostgreSQL backup produced by backup.ps1.
# DANGER: overwrites current database contents. The container must be running.
param(
    [Parameter(Mandatory = $true)][string]$SqlFile,
    [string]$InvoicesDir = ""
)
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")
if (-not (Test-Path $SqlFile)) { throw "Backup file not found: $SqlFile" }

Write-Host "Restoring PostgreSQL from $SqlFile" -ForegroundColor Cyan
Get-Content $SqlFile -Raw | docker compose exec -T kazmion sh -c "psql -U postgres -d postgres --set ON_ERROR_STOP=1"
if ($LASTEXITCODE -ne 0) { throw "Restore failed partway - review psql output before retrying." }

if ($InvoicesDir) {
    if (-not (Test-Path $InvoicesDir)) { throw "Invoice folder not found: $InvoicesDir" }
    Write-Host "Restoring invoice files" -ForegroundColor Cyan
    docker compose cp "$InvoicesDir/." "kazmion:/data/invoices/"
}

Write-Host "Restore complete. Restart the app: scripts\start.ps1" -ForegroundColor Green
