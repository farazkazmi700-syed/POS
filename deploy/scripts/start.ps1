# KazmiOn POS - Start (idempotent). Opens the app when healthy.
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "../..")
$Url = "http://localhost:8080"

function Test-Health {
    try { return (Invoke-WebRequest -Uri "$Url/health" -UseBasicParsing -TimeoutSec 3).StatusCode -eq 200 } catch { return $false }
}

if (Test-Health) { Start-Process $Url; exit 0 }

docker compose -f docker/compose/compose.yaml up -d
if ($LASTEXITCODE -ne 0) { throw "Unable to start kazmion-pos. Is Docker Desktop running?" }

foreach ($i in 1..60) {
    if (Test-Health) { Start-Process $Url; exit 0 }
    Start-Sleep -Seconds 2
}
docker compose -f docker/compose/compose.yaml logs --tail 50
throw "KazmiOn POS did not become healthy within the startup timeout."
