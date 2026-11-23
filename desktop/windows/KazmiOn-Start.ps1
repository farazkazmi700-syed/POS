
# ============================================
# KazmiOn POS - Docker Startup & Polling
# ============================================

$ErrorActionPreference = "Stop"

$ProjectDir = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$ComposeFile = Join-Path $ProjectDir "docker/compose/compose.yaml"

$AppUrl = "http://localhost:8080"
$MaxAttempts = 90
$RetrySeconds = 2

Set-Location $ProjectDir

function Test-Docker {
    try {
        docker info --format '{{.ServerVersion}}' 2>$null | Out-Null
        return ($LASTEXITCODE -eq 0)
    }
    catch {
        return $false
    }
}

function Test-KazmiOn {
    try {
        $response = Invoke-WebRequest `
            -Uri $AppUrl `
            -UseBasicParsing `
            -TimeoutSec 3

        return ($response.StatusCode -ge 200 -and
                $response.StatusCode -lt 400)
    }
    catch {
        return $false
    }
}

try {
    Write-Host "Starting KazmiOn POS..." -ForegroundColor Cyan

    # Check Docker installation
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        throw "Docker CLI not found. Install Docker Desktop."
    }

    # Start Docker Desktop if Engine is unavailable
    if (-not (Test-Docker)) {
        $DockerDesktop = Join-Path `
            $env:ProgramFiles `
            "Docker\Docker\Docker Desktop.exe"

        if (Test-Path $DockerDesktop) {
            Write-Host "Starting Docker Desktop..."
            Start-Process -FilePath $DockerDesktop
        }
        else {
            throw "Docker Desktop was not found."
        }

        $DockerReady = $false

        for ($i = 1; $i -le 60; $i++) {
            if (Test-Docker) {
                $DockerReady = $true
                break
            }

            Start-Sleep -Seconds 2
        }

        if (-not $DockerReady) {
            throw "Docker Engine startup timed out."
        }
    }

    Write-Host "Docker Engine is ready." -ForegroundColor Green

    # Verify Compose configuration
    if (-not (Test-Path $ComposeFile)) {
        throw "docker/compose/compose.yaml not found."
    }

    # Check if POS is already running
    if (Test-KazmiOn) {
        Write-Host "KazmiOn is already running."
        Start-Process $AppUrl
        exit 0
    }

    # Start existing Docker services
    Write-Host "Starting KazmiOn containers..."

    docker compose `
        -f $ComposeFile `
        --env-file (Join-Path $ProjectDir ".env") `
        -p kazmion `
        up -d --no-build

    if ($LASTEXITCODE -ne 0) {
        throw "Docker Compose failed to start."
    }

    # Wait until the application responds
    Write-Host "Waiting for KazmiOn POS..."

    $AppReady = $false

    for ($i = 1; $i -le $MaxAttempts; $i++) {
        if (Test-KazmiOn) {
            $AppReady = $true
            break
        }

        Write-Host "Checking POS ($i/$MaxAttempts)..."
        Start-Sleep -Seconds $RetrySeconds
    }

    if (-not $AppReady) {
        throw "KazmiOn POS did not become ready."
    }

    Write-Host "KazmiOn POS is ready!" -ForegroundColor Green

    # Open application
    Start-Process $AppUrl
}
catch {
    Write-Host ""
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
