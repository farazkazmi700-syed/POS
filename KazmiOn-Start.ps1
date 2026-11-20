param(
    [ValidateSet('standard','production')][string]$Mode = 'standard',
    [switch]$NoBrowser
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$log = Join-Path $root 'KazmiOn-startup.log'
$base = Join-Path $root 'compose.yaml'
$prod = Join-Path $root 'docker-compose.prod.yml'
$example = Join-Path $root '.env.example'
$envFile = Join-Path $root '.env'
$files = @('-f', $base)
$url = 'http://localhost:8080'
if ($Mode -eq 'production') {
    $files += @('-f', $prod)
}
function Log([string]$message) {
    $line = "$(Get-Date -Format s) $message"
    Write-Host $line
    Add-Content -LiteralPath $log -Value $line
}
function New-Secret {
    $bytes = New-Object byte[] 48
    $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $generator.GetBytes($bytes)
    } finally {
        $generator.Dispose()
    }
    return [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}
function Set-EnvDefault([string]$name, [string]$value) {
    $pattern = '^[ \t]*' + [regex]::Escape($name) + '[ \t]*=(.*)$'
    $lineMatches = @()
    for ($index = 0; $index -lt $script:envLines.Count; $index++) {
        if ($script:envLines[$index] -match $pattern) {
            $lineMatches += $index
        }
    }
    if ($lineMatches.Count -gt 1) { throw "The .env file contains duplicate $name entries." }
    if ($lineMatches.Count -eq 0) {
        $script:envLines.Add("$name=$value")
        return
    }
    $index = $lineMatches[0]
    $currentValue = ($script:envLines[$index] -replace $pattern, '$1').Trim()
    if ([string]::IsNullOrWhiteSpace($currentValue) -or $currentValue -match '^REPLACE_ME') {
        $script:envLines[$index] = "$name=$value"
    }
}
function Save-Environment {
    $contents = [string]::Join($script:newline, $script:envLines.ToArray())
    if ($script:envHasFinalNewline) { $contents += $script:newline }
    [System.IO.File]::WriteAllText($envFile, $contents, [System.Text.UTF8Encoding]::new($false))
}
function Start-DockerDesktop {
    $candidates = @()
    if ($env:ProgramFiles) {
        $candidates += (Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe')
    }
    if ($env:LOCALAPPDATA) {
        $candidates += (Join-Path $env:LOCALAPPDATA 'Programs\Docker\Docker\Docker Desktop.exe')
    }
    foreach ($candidate in $candidates) {
        if (Test-Path -LiteralPath $candidate) {
            Log 'Starting Docker Desktop.'
            Start-Process -FilePath $candidate
            return
        }
    }
}
function Docker-EngineReady {
    & docker info --format '{{.ServerVersion}}' 2>$null | Out-Null
    return ($LASTEXITCODE -eq 0)
}
function Ready([string]$address) {
    try {
        $response = Invoke-WebRequest -Uri $address -UseBasicParsing -TimeoutSec 4
        return ($response.StatusCode -ge 200 -and $response.StatusCode -lt 400)
    } catch { return $false }
}
try {
    if (-not (Test-Path -LiteralPath $base)) { throw 'compose.yaml not found. Place launcher files in the repository root.' }
    if ($Mode -eq 'production' -and -not (Test-Path -LiteralPath $prod)) { throw 'docker-compose.prod.yml not found.' }
    if (-not (Test-Path -LiteralPath $envFile)) {
        if (-not (Test-Path -LiteralPath $example)) { throw '.env and .env.example are both missing.' }
        Copy-Item -LiteralPath $example -Destination $envFile
        Log 'Created .env from .env.example.'
    }
    $envContents = [System.IO.File]::ReadAllText($envFile, [System.Text.Encoding]::UTF8)
    $script:newline = if ($envContents.Contains("`r`n")) { "`r`n" } else { "`n" }
    $script:envHasFinalNewline = $envContents.EndsWith("`n") -or $envContents.EndsWith("`r")
    $envLines = [regex]::Split($envContents, "\r\n|\n|\r")
    if ($script:envHasFinalNewline -and $envLines.Count -gt 0 -and $envLines[$envLines.Count - 1] -eq '') {
        $envLines = $envLines[0..($envLines.Count - 2)]
    }
    $script:envLines = New-Object 'System.Collections.Generic.List[string]'
    foreach ($line in $envLines) { $script:envLines.Add($line) }
    foreach ($secretName in @('JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'PLATFORM_DEVELOPER_SETUP_TOKEN')) {
        Set-EnvDefault $secretName (New-Secret)
    }
    Set-EnvDefault 'CORS_ORIGIN' $url
    Set-EnvDefault 'PASSWORD_RESET_BASE_URL' $url
    Save-Environment

    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw 'Docker CLI not found. Install and start Docker Desktop or a compatible Docker Engine.' }
    Log "Starting KazmiOn mode=$Mode at $url"
    $engineReady = Docker-EngineReady
    if (-not $engineReady) { Start-DockerDesktop }
    for ($i = 1; -not $engineReady -and $i -le 60; $i++) {
        Start-Sleep -Seconds 2
        $engineReady = Docker-EngineReady
    }
    if (-not $engineReady) { throw 'Docker Engine did not become ready. Start Docker Desktop and retry.' }
    & docker compose version | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Docker Compose is unavailable. Update Docker Desktop and retry.' }
    & docker compose @files -p kazmion config --quiet
    if ($LASTEXITCODE -ne 0) { throw 'Docker Compose configuration validation failed. Check required values in .env.' }
    Log 'Building and starting the POS container. The initial build can take several minutes.'
    & docker compose @files -p kazmion up -d --build
    if ($LASTEXITCODE -ne 0) { throw 'Docker Compose failed to build or start the POS. Review Docker Desktop and the startup log.' }
    $isReady = $false
    for ($i = 1; $i -le 300; $i++) {
        if (Ready "$url/health") { $isReady = $true; break }
        Start-Sleep -Seconds 2
    }
    if (-not $isReady) {
        $status = (& docker compose @files -p kazmion ps 2>&1 | Out-String).Trim()
        if ($status) { Log $status }
        $containerLogs = (& docker compose @files -p kazmion logs --tail 80 2>&1 | Out-String).Trim()
        if ($containerLogs) { Log $containerLogs }
        throw "POS did not respond at $url after 10 minutes. Review the startup log."
    }
    Log 'KazmiOn is responding.'
    if (-not $NoBrowser) { Start-Process $url }
    exit 0
} catch {
    Log "ERROR: $($_.Exception.Message)"
    exit 1
}
