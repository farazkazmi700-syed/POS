
# KazmiOn POS - Docker Startup and Polling
# For Windows client installations

$ErrorActionPreference = "Stop"

$AppName = "KazmiOn POS"
$AppUrl = "http://localhost:8080"
$HealthUrl = "http://localhost:8080/health"

$ComposeFile = Join-Path $PSScriptRoot "docker-compose.prod.yml"

$MaxAttempts = 60
$RetrySeconds = 2

function Show-Error($Message) {
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show(
        $Message,
        $AppName,
        'OK',
        'Error'
    ) | Out-Null
}

function Test-PosHealth {
    try {
        $response = Invoke-WebRequest `
            -Uri $HealthUrl `
            -UseBasicParsing `
            -TimeoutSec 3

        return $response.StatusCode -eq 200
    }
    catch {
        return $false
    }
}

try {
    # 1. Check whether POS is already running
    if (Test-PosHealth) {
        Start-Process $AppUrl
        exit 0
    }

    # 2. Verify Docker CLI
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        throw "Docker is not installed or not in PATH."
    }

    # 3. Verify Docker Engine
    docker info --format '{{.ServerVersion}}' 2>$null | Out-Null

    if ($LASTEXITCODE -ne 0) {
        throw "Docker Engine is not running or accessible."
    }

    # 4. Verify Compose file
    if (-not (Test-Path $ComposeFile)) {
        throw "KazmiOn production Compose file is missing."
    }

    # 5. Start existing containers
    docker compose `
        -f $ComposeFile `
        -p kazmion `
        up -d --no-build

    if ($LASTEXITCODE -ne 0) {
        throw "Unable to start KazmiOn containers."
    }

    # 6. Poll POS health endpoint
    $Ready = $false

    for ($i = 1; $i -le $MaxAttempts; $i++) {
        if (Test-PosHealth) {
            $Ready = $true
            break
        }

        Start-Sleep -Seconds $RetrySeconds
    }

    if (-not $Ready) {
        throw "KazmiOn did not become ready within the startup timeout."
    }

    # 7. Open POS
    Start-Process $AppUrl
}
catch {
    Show-Error "KazmiOn startup failed: $($_.Exception.Message)"
    exit 1
}
