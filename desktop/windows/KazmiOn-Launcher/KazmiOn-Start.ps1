param(
    [ValidateSet('standard','production')][string]$Mode = 'standard',
    [switch]$NoBrowser
)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$log = Join-Path $root 'KazmiOn-startup.log'
$base = Join-Path $root 'docker/compose/compose.yaml'
$prod = Join-Path $root 'docker/compose/docker-compose.prod.yml'
$files = @('-f', $base, '--env-file', (Join-Path $root '.env'))
$url = 'http://localhost:8080'
if ($Mode -eq 'production') {
    $files += @('-f', $prod)
    $url = 'http://localhost:8080'
}
function Log([string]$message) {
    $line = "$(Get-Date -Format s) $message"
    Write-Host $line
    Add-Content -LiteralPath $log -Value $line
}
function Ready([string]$address) {
    try {
        $response = Invoke-WebRequest -Uri $address -UseBasicParsing -TimeoutSec 4
        return ($response.StatusCode -ge 200 -and $response.StatusCode -lt 400)
    } catch { return $false }
}
try {
    if (-not (Test-Path -LiteralPath $base)) { throw 'docker/compose/compose.yaml not found. Run the launcher from a KazmiOn POS checkout.' }
    if ($Mode -eq 'production' -and -not (Test-Path -LiteralPath $prod)) { throw 'docker/compose/docker-compose.prod.yml not found.' }
    if (-not (Test-Path -LiteralPath (Join-Path $root '.env'))) { throw '.env missing. Copy .env.example to .env and configure required secrets before running.' }
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw 'Docker CLI not found. Install and start Docker Desktop or a compatible Docker Engine.' }
    Log "Starting KazmiOn mode=$Mode at $url"
    $engineReady = $false
    for ($i = 1; $i -le 30; $i++) {
        & docker info --format '{{.ServerVersion}}' 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) { $engineReady = $true; break }
        Start-Sleep -Seconds 2
    }
    if (-not $engineReady) { throw 'Docker Engine not ready after 60 seconds. Start Docker Desktop and retry.' }
    & docker compose @files -p kazmion config --quiet
    if ($LASTEXITCODE -ne 0) { throw 'Docker Compose configuration validation failed.' }
    # --build is intentionally omitted; build images separately for first deployment.
    & docker compose @files -p kazmion up -d --no-build
    if ($LASTEXITCODE -ne 0) { throw 'Docker Compose failed to start. Build or load the images first.' }
    $isReady = $false
    for ($i = 1; $i -le 90; $i++) {
        if (Ready $url) { $isReady = $true; break }
        Start-Sleep -Seconds 2
    }
    if (-not $isReady) {
        & docker compose @files -p kazmion ps | Out-String | ForEach-Object { Log $_ }
        throw "POS did not respond at $url after 180 seconds. Review Docker logs."
    }
    Log 'KazmiOn is responding.'
    if (-not $NoBrowser) { Start-Process $url }
    exit 0
} catch {
    Log "ERROR: $($_.Exception.Message)"
    exit 1
}
