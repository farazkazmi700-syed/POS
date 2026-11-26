param(
    [string]$StateRoot = (Join-Path $env:LOCALAPPDATA 'KazmiOn\OfflinePOS'),
    [ValidatePattern('^kazmion-offline(?:-[a-z0-9]+)?$')][string]$Project = 'kazmion-offline',
    [ValidateRange(1024,65535)][int]$Port = 8080,
    [switch]$NoBrowser,
    [switch]$UsePrevious
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$composeFile = Join-Path $PSScriptRoot 'compose.yaml'
$envFile = Join-Path $StateRoot '.env'
$stateFile = Join-Path $StateRoot 'state.json'
$container = "$Project-pos-1"
$baseUrl = "http://127.0.0.1:$Port"
$paths = [ordered]@{ pgdata = '/var/lib/postgresql/data'; queue = '/data/redis'; uploads = '/data/invoices'; backups = '/app/backups' }

function Invoke-Docker([string[]]$Arguments) {
    $result = & docker @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Docker operation failed ($($Arguments[0]))." }
    return $result
}

function Get-InstalledImage([string]$Image) {
    return Invoke-Docker @('image', 'ls', '--no-trunc', '--format', '{{.ID}}', $Image)
}

function Assert-Release($Release) {
    if ($Release.image -notmatch '^kazmion/pos:offline-[0-9]+[.][0-9]+[.][0-9]+$' -or
        $Release.imageId -notmatch '^sha256:[a-f0-9]{64}$' -or
        "$($Release.postgresMajor)" -notmatch '^[0-9]{1,2}$') { throw 'Invalid offline release metadata.' }
}

function Import-Release($Release) {
    Assert-Release $Release
    $existing = Get-InstalledImage $Release.image
    if ($existing -and $existing -ne $Release.imageId) { throw 'The release tag already points to a different image.' }
    if (!$existing) {
        $archive = Join-Path $PSScriptRoot 'pos-image.tar'
        if ((Get-FileHash -Algorithm SHA256 -LiteralPath $archive).Hash -ine $Release.archiveSHA256) {
            throw 'The packaged image archive failed its SHA-256 check.'
        }
        Invoke-Docker @('image', 'load', '--input', $archive) | Out-Host
    }
    if ((Get-InstalledImage $Release.image) -ne $Release.imageId) { throw 'The loaded image does not match this release.' }
}

function New-RandomHex {
    $bytes = New-Object byte[] 32
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    return ([BitConverter]::ToString($bytes)).Replace('-', '').ToLowerInvariant()
}

function Write-State($Record) {
    $temporary = Join-Path $StateRoot ("state-" + [guid]::NewGuid().ToString('N') + '.tmp')
    [IO.File]::WriteAllText($temporary, ($Record | ConvertTo-Json -Depth 5))
    if (Test-Path -LiteralPath $stateFile) {
        [IO.File]::Replace($temporary, $stateFile, (Join-Path $StateRoot 'state.previous.json'))
    } else { [IO.File]::Move($temporary, $stateFile) }
}

function New-Volumes {
    $prefix = "$Project-" + [guid]::NewGuid().ToString('N').Substring(0, 12)
    $volumes = [ordered]@{}
    foreach ($key in $paths.Keys) {
        $name = "$prefix-$key"
        Invoke-Docker @('volume', 'create', '--label', "kazmion.offline=$Project", $name) | Out-Null
        $volumes[$key] = $name
    }
    return [pscustomobject]$volumes
}

function Assert-Volumes($Record) {
    foreach ($key in $paths.Keys) {
        $name = $Record.volumes.$key
        if ($name -notmatch "^$([regex]::Escape($Project))-[a-f0-9]{12}-$key$") { throw 'Unexpected volume name in offline POS state.' }
        $labels = Invoke-Docker @('volume', 'inspect', '--format', '{{json .Labels}}', $name) | ConvertFrom-Json
        if (!$labels -or $labels.'kazmion.offline' -ne $Project) { throw 'Volume ownership does not match this installation.' }
    }
}

function Start-Release($Record) {
    Assert-Release $Record
    Assert-Volumes $Record
    if ((Get-InstalledImage $Record.image) -ne $Record.imageId) { throw 'The required installed image is missing or changed.' }
    $env:KAZMION_IMAGE = $Record.image
    $env:KAZMION_ENV_FILE = $envFile
    $env:KAZMION_PORT = "$Port"
    $env:KAZMION_PG_VOLUME = $Record.volumes.pgdata
    $env:KAZMION_QUEUE_VOLUME = $Record.volumes.queue
    $env:KAZMION_UPLOAD_VOLUME = $Record.volumes.uploads
    $env:KAZMION_BACKUP_VOLUME = $Record.volumes.backups
    Invoke-Docker @('compose', '-p', $Project, '-f', $composeFile, 'up', '-d', '--no-build', '--pull', 'never', '--wait', '--wait-timeout', '150') | Out-Host
    $id = Invoke-Docker @('inspect', '--format', '{{.Image}}', $container)
    if ($id -ne $Record.imageId) { throw 'Unexpected active POS image.' }
    $response = Invoke-WebRequest -Uri "$baseUrl/api/health" -UseBasicParsing -TimeoutSec 5
    if ($response.StatusCode -ne 200) { throw 'The local POS health check failed.' }
}

function Copy-Volumes($Old, $New) {
    $state = Invoke-Docker @('run', '--rm', '--pull', 'never', '--network', 'none',
        '--mount', "type=volume,src=$($Old.volumes.pgdata),dst=/var/lib/postgresql/data,readonly",
        '--env', 'LC_ALL=C', '--entrypoint', 'pg_controldata', $Old.image, '/var/lib/postgresql/data/cluster')
    if (-not ($state -match '^Database cluster state:\s+shut down\s*$')) { throw 'The old PostgreSQL cluster must be cleanly shut down before upgrade.' }
    foreach ($key in $paths.Keys) {
        if (Invoke-Docker @('ps', '-q', '--filter', "volume=$($Old.volumes.$key)")) { throw 'An old POS volume is still in use.' }
        Invoke-Docker @('run', '--rm', '--pull', 'never', '--network', 'none',
            '--mount', "type=volume,src=$($Old.volumes.$key),dst=/source,readonly",
            '--mount', "type=volume,src=$($New.volumes.$key),dst=/destination,volume-nocopy",
            '--entrypoint', 'bash', $Old.image, '-o', 'pipefail', '-c',
            'tar -C /source -cpf - . | tar -C /destination -xpf -') | Out-Null
    }
}

if (!(Get-Command docker -ErrorAction SilentlyContinue)) { throw 'Install your approved offline Docker Desktop and WSL prerequisites, then open the shortcut again.' }
$context = Invoke-Docker @('context', 'show')
$contextData = @(Invoke-Docker @('context', 'inspect', $context) | Out-String | ConvertFrom-Json)
$dockerEndpoint = $contextData[0].Endpoints.docker.Host
if ($env:DOCKER_HOST -or "$dockerEndpoint" -notmatch '^npipe:////\./pipe/(docker_engine|dockerDesktopLinuxEngine)$') {
    throw 'Select the local Docker Desktop context. Remote Docker endpoints are unsupported.'
}
try { $engine = & docker info --format '{{.OSType}} {{.Architecture}}' 2>$null } catch { $engine = $null }
if ($LASTEXITCODE -ne 0 -or "$engine" -notmatch '^linux (x86_64|amd64)$') {
    throw 'Start the local Docker Desktop Linux x64 engine before launching POS.'
}
$composeVersion = Invoke-Docker @('compose', 'version', '--short')
if ("$composeVersion" -notmatch '^v?([0-9]+\.[0-9]+\.[0-9]+)' -or [version]$Matches[1] -lt [version]'2.30.0') {
    throw 'Use Docker Desktop with Docker Compose 2.30.0 or later.'
}

New-Item -ItemType Directory -Path $StateRoot -Force | Out-Null
$lock = [IO.File]::Open((Join-Path $StateRoot 'launcher.lock'), [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
try {
    $release = Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'release.json') | ConvertFrom-Json
    Assert-Release $release
    $current = if (Test-Path -LiteralPath $stateFile) { Get-Content -Raw -LiteralPath $stateFile | ConvertFrom-Json }
    $existingService = $container -in @(Invoke-Docker @('ps', '-a', '--format', '{{.Names}}'))
    if ($existingService) {
        if (!$current) { throw 'This Docker project already exists without offline installer state. Keep its volumes and contact your operator.' }
        $mountJson = Invoke-Docker @('inspect', '--type', 'container', '--format', '{{json .Mounts}}', $container)
        $existingMounts = "$mountJson" | ConvertFrom-Json
        foreach ($key in $paths.Keys) {
            $oldVolume = $current.volumes.$key
            if (-not ($existingMounts | Where-Object { $_.Destination -eq $paths[$key] -and $_.Name -eq $oldVolume })) {
                throw 'The project volumes differ from saved state. Check the previous and copied volumes before restarting.'
            }
        }
    }

    if ($current -and !(Test-Path -LiteralPath $envFile -PathType Leaf)) {
        throw 'The protected POS environment is missing. Recover it before restarting.'
    }
    if (!(Test-Path -LiteralPath $envFile)) {
        $setup = New-RandomHex
        [IO.File]::WriteAllLines($envFile, [string[]]@(
            "JWT_ACCESS_SECRET=$(New-RandomHex)", "JWT_REFRESH_SECRET=$(New-RandomHex)",
            "CORS_ORIGIN=$baseUrl", "PASSWORD_RESET_BASE_URL=$baseUrl/reset-password",
            'PLATFORM_DEVELOPER_EMAIL=developer@pos.local', "PLATFORM_DEVELOPER_SETUP_TOKEN=$setup"
        ))
    }

    if ($UsePrevious -and !$current) { throw 'No saved offline release exists.' }
    if (!$UsePrevious) { Import-Release $release }
    if (!$current) {
        $current = [pscustomobject]@{ image = $release.image; imageId = $release.imageId; postgresMajor = $release.postgresMajor; volumes = New-Volumes }
        Write-State $current
    }
    if ($UsePrevious -or $current.imageId -eq $release.imageId) {
        Start-Release $current
    } else {
        Assert-Release $current
        Assert-Volumes $current
        if ($current.postgresMajor -ne $release.postgresMajor) { throw 'A PostgreSQL major-version change requires a separate database migration.' }
        if ((Get-InstalledImage $current.image) -ne $current.imageId) { throw 'The previous image is required for a safe upgrade.' }
        $candidate = [pscustomobject]@{ image = $release.image; imageId = $release.imageId; postgresMajor = $release.postgresMajor; volumes = New-Volumes }
        if ($existingService) { Invoke-Docker @('stop', '-t', '120', $container) | Out-Null }
        try {
            Copy-Volumes $current $candidate
            Start-Release $candidate
            Write-State $candidate
        } catch {
            Start-Release $current
            throw 'The upgrade did not complete. The previous release and original data volumes are active.'
        }
        Write-Host 'Upgrade succeeded. Previous data volumes remain available for recovery.'
    }
    if (!$NoBrowser) { Start-Process $baseUrl }
    Write-Host "KazmiOn POS is running at $baseUrl"
} finally { $lock.Dispose() }
