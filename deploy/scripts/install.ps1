# KazmiOn POS - One-time installation for Windows clients (Docker Desktop).
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File deploy\scripts\install.ps1
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "../..")

function OK($m) { Write-Host "  OK  $m" -ForegroundColor Green }
function Step($m) { Write-Host "`n== $m ==" -ForegroundColor Cyan }

Step "Checking prerequisites"
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw "Docker Desktop is not installed or not in PATH." }
docker info *> $null
if ($LASTEXITCODE -ne 0) { throw "Docker Engine is not running. Start Docker Desktop and retry." }
OK "Docker Engine reachable"

Step "Preparing environment file"
if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    # Generate strong random secrets for this installation.
    function RandHex { -join ((1..64) | ForEach-Object { '{0:x}' -f (Get-Random -Max 16) }) }
    $jwt  = RandHex; $jwt2 = RandHex; $setup = RandHex
    $reset = "http://localhost:8080"
    (Get-Content ".env") `
        -replace "JWT_ACCESS_SECRET=.*", "JWT_ACCESS_SECRET=$jwt" `
        -replace "JWT_REFRESH_SECRET=.*", "JWT_REFRESH_SECRET=$jwt2" `
        -replace "PLATFORM_DEVELOPER_SETUP_TOKEN=.*", "PLATFORM_DEVELOPER_SETUP_TOKEN=$setup" `
        -replace "PASSWORD_RESET_BASE_URL=.*", "PASSWORD_RESET_BASE_URL=$reset" |
        Set-Content ".env"
    OK ".env created with generated secrets"
} else { OK ".env already exists - kept unchanged" }

Step "Building production image"
docker compose -f docker/compose/compose.yaml build
if ($LASTEXITCODE -ne 0) { throw "Image build failed." }
OK "kazmion/pos:latest built"

Step "Starting container"
docker compose -f docker/compose/compose.yaml up -d
if ($LASTEXITCODE -ne 0) { throw "Container start failed." }

Step "Waiting for application health"
$ready = $false
foreach ($i in 1..60) {
    try {
        if ((Invoke-WebRequest -Uri "http://localhost:8080/health" -UseBasicParsing -TimeoutSec 3).StatusCode -eq 200) { $ready = $true; break }
    } catch { }
    Start-Sleep -Seconds 2
}
if (-not $ready) {
    docker compose -f docker/compose/compose.yaml logs --tail 50
    throw "Application did not become healthy within the startup timeout."
}
OK "Application healthy at http://localhost:8080"

Write-Host "`nKazmiOn POS installation complete." -ForegroundColor Green
Write-Host "Open http://localhost:8080 (shortcut: deploy\scripts\start.ps1 or desktop/windows/KazmiOn-Launch.bat)."
