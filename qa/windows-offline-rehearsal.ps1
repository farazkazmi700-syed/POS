param(
    [Parameter(Mandatory)][string]$Payload,
    [ValidateRange(1024,65535)][int]$Port = 18088
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$project = 'kazmion-offline-qa' + [guid]::NewGuid().ToString('N').Substring(0,8)
$container = "$project-pos-1"
$stateRoot = Join-Path ([IO.Path]::GetTempPath()) $project
$upgrade = Join-Path $stateRoot 'next-release'
New-Item -ItemType Directory -Path $upgrade -Force | Out-Null
$release = Get-Content -Raw -LiteralPath (Join-Path $Payload 'release.json') | ConvertFrom-Json
$upgradeTag = "kazmion/pos:offline-999.0.$(Get-Random -Minimum 1000 -Maximum 9999)"
$createdImage = $false

function Run-Docker([string[]]$Arguments) {
    $output = & docker @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Docker rehearsal operation failed ($($Arguments[0]))." }
    return $output
}
function Run-Launcher([string]$Path) {
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File $Path -StateRoot $stateRoot -Project $project -Port $Port -NoBrowser
    if ($LASTEXITCODE -ne 0) { throw 'Offline launcher failed.' }
}

try {
    Run-Launcher (Join-Path $Payload 'Start-POS.ps1')
    $stateFile = Join-Path $stateRoot 'state.json'
    $old = Get-Content -Raw -LiteralPath $stateFile | ConvertFrom-Json
    $secrets = (Get-FileHash -LiteralPath (Join-Path $stateRoot '.env')).Hash
    if ($old.imageId -ne $release.imageId) { throw 'Unexpected first-run image.' }
    $ports = Run-Docker @('port', $container)
    if ($ports -ne "8080/tcp -> 127.0.0.1:$Port") { throw 'Unexpected published ports.' }
    Run-Docker @('exec', '--user', 'postgres', $container, 'psql', '-v', 'ON_ERROR_STOP=1', '-d', 'postgres', '-c',
        'CREATE TABLE offline_rehearsal (value integer); INSERT INTO offline_rehearsal VALUES (42);') | Out-Null
    Run-Docker @('exec', $container, 'touch', '/data/invoices/offline-rehearsal.txt') | Out-Null

    Run-Launcher (Join-Path $Payload 'Start-POS.ps1')
    $repeat = Get-Content -Raw -LiteralPath $stateFile | ConvertFrom-Json
    if ($repeat.volumes.pgdata -ne $old.volumes.pgdata) { throw 'Repeated launch changed volumes.' }

    if (& docker image ls -q $upgradeTag) { throw 'The rehearsal image tag already exists.' }
    @("FROM $($release.image)", "LABEL kazmion.offline.rehearsal=$project") |
        & docker build --pull=false --network none -t $upgradeTag -f - $upgrade
    if ($LASTEXITCODE -ne 0) { throw 'Could not build the local upgrade fixture.' }
    $createdImage = $true
    $newImage = Run-Docker @('image', 'inspect', '--format', '{{.Id}}', $upgradeTag)
    foreach ($file in @('Start-POS.ps1', 'compose.yaml')) {
        Copy-Item -LiteralPath (Join-Path $Payload $file) -Destination $upgrade
    }
    [ordered]@{ image = $upgradeTag; imageId = $newImage; postgresMajor = $release.postgresMajor } |
        ConvertTo-Json | Set-Content -Encoding Ascii -LiteralPath (Join-Path $upgrade 'release.json')

    Run-Launcher (Join-Path $upgrade 'Start-POS.ps1')
    $current = Get-Content -Raw -LiteralPath $stateFile | ConvertFrom-Json
    $previous = Get-Content -Raw -LiteralPath (Join-Path $stateRoot 'state.previous.json') | ConvertFrom-Json
    if ($current.imageId -ne $newImage -or $current.volumes.pgdata -eq $old.volumes.pgdata -or
        $previous.volumes.pgdata -ne $old.volumes.pgdata) { throw 'Upgrade did not preserve distinct old and new volume sets.' }
    if ((Get-FileHash -LiteralPath (Join-Path $stateRoot '.env')).Hash -ne $secrets) { throw 'Upgrade changed installation secrets.' }
    if ((Run-Docker @('exec', '--user', 'postgres', $container, 'psql', '-At', '-d', 'postgres', '-c', 'SELECT value FROM offline_rehearsal')) -ne '42') {
        throw 'Upgrade lost a stored PostgreSQL value.'
    }
    Run-Docker @('exec', $container, 'test', '-f', '/data/invoices/offline-rehearsal.txt') | Out-Null
    Run-Docker @('volume', 'inspect', '--format', '{{.Name}}', $old.volumes.pgdata) | Out-Null
    Write-Host 'PASS local image, loopback-only ports, repeat launch, upgrade, PostgreSQL and file persistence.'
} finally {
    $running = @(& docker ps -a --format '{{.Names}}' --filter "label=com.docker.compose.project=$project")
    if ($container -in $running) { & docker rm -f $container | Out-Null }
    foreach ($volume in @(& docker volume ls -q --filter "label=kazmion.offline=$project")) {
        if ($volume -match "^$project-[a-f0-9]{12}-(pgdata|queue|uploads|backups)$") {
            & docker volume rm $volume | Out-Null
        }
    }
    $network = "$($project)_default"
    $networks = @(& docker network ls --format '{{.Name}}' --filter "label=com.docker.compose.project=$project")
    if ($network -in $networks) { & docker network rm $network | Out-Null }
    if ($createdImage) { & docker image rm $upgradeTag | Out-Null }
    foreach ($name in @('Start-POS.ps1', 'compose.yaml', 'release.json')) {
        $file = Join-Path $upgrade $name
        if (Test-Path -LiteralPath $file -PathType Leaf) { Remove-Item -LiteralPath $file }
    }
    if (!(Get-ChildItem -LiteralPath $upgrade -Force)) { Remove-Item -LiteralPath $upgrade }
    foreach ($name in @('.env', 'state.json', 'state.previous.json', 'launcher.lock')) {
        $file = Join-Path $stateRoot $name
        if (Test-Path -LiteralPath $file -PathType Leaf) { Remove-Item -LiteralPath $file }
    }
    if (!(Get-ChildItem -LiteralPath $stateRoot -Force)) { Remove-Item -LiteralPath $stateRoot }
}
