# KazmiOn POS - Restore a PostgreSQL backup produced by backup.ps1.
# DANGER: overwrites current database contents. The container must be running.
param(
    [Parameter(Mandatory = $true)][string]$SqlFile,
    [string]$InvoicesDir = "",
    [string]$BusinessDirectory = ""
)
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "../..")
if (-not (Test-Path $SqlFile)) { throw "Backup file not found: $SqlFile" }

# cron.job is owned by the pg_cron/DocumentDB extension and its rows are re-inserted by the
# server's own background tasks. Restoring them collides on job_pkey, so scheduled-job data is
# stripped from the stream. Runtime never reads these rows from the dump; extensions recreate them.
$filtered = Join-Path ([System.IO.Path]::GetTempPath()) "kazmion-restore-$([guid]::NewGuid().ToString('N')).sql"
Write-Host "Restoring PostgreSQL from $SqlFile" -ForegroundColor Cyan
Write-Host "  (scheduler rows in cron.job are excluded; the scheduler recreates them)" -ForegroundColor DarkGray

# Drop the COPY cron.job block while streaming the dump in UTF-8.
$source = (Resolve-Path -LiteralPath $SqlFile).Path
$writer = [System.IO.StreamWriter]::new($filtered, $false, [System.Text.UTF8Encoding]::new($false))
$skipping = $false
try {
foreach ($line in [System.IO.File]::ReadLines($source, [System.Text.Encoding]::UTF8)) {
    if ($line -match '^COPY cron\.job ') { $skipping = $true; continue }
    if ($skipping) {
        if ($line -eq '\.') { $skipping = $false }
        continue
    }
    $writer.WriteLine($line)
}
if ($skipping) { throw "Incomplete scheduler COPY block in backup." }
} finally { $writer.Dispose() }

$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Get-Content -LiteralPath $filtered -Encoding utf8 -ReadCount 1 | docker compose -f docker/compose/compose.yaml exec -T -u postgres kazmion sh -c 'PGPASSFILE=/var/lib/postgresql/.pgpass; psql -h 127.0.0.1 -U postgres -d postgres --set ON_ERROR_STOP=1'
$restoreExit = $LASTEXITCODE
Remove-Item $filtered -Force -ErrorAction SilentlyContinue
if ($restoreExit -ne 0) { throw "Restore failed partway - review psql output before retrying." }

if ($BusinessDirectory) {
    foreach ($backup in Get-ChildItem -LiteralPath $BusinessDirectory -Filter '*-invoices.csv' -File) {
        if ($backup.Name -notmatch '^([a-f0-9]{24})-invoices\.csv$') { throw 'Invalid business backup name' }
        & (Join-Path $PSScriptRoot "business-backup.ps1") -Restore -BusinessId $Matches[1] -Directory $BusinessDirectory
    }
}
if ($InvoicesDir) {
    if (-not (Test-Path $InvoicesDir)) { throw "Invoice folder not found: $InvoicesDir" }
    Write-Host "Restoring invoice files" -ForegroundColor Cyan
    docker compose -f docker/compose/compose.yaml cp "$InvoicesDir/." "kazmion:/data/invoices/"
    if ($LASTEXITCODE -ne 0) { throw "Invoice restoration failed." }
}

Write-Host "Restore complete. Restart the app: deploy\scripts\start.ps1" -ForegroundColor Green
