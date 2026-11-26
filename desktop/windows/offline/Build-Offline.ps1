param(
    [Parameter(Mandatory)][ValidatePattern('^[0-9]+\.[0-9]+\.[0-9]+$')][string]$Version,
    [Parameter(Mandatory)][string]$Image,
    [Parameter(Mandatory)][string]$OutputRoot,
    [string]$Iscc = (Join-Path $env:ProgramFiles 'Inno Setup 7\ISCC.exe')
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if (!(Test-Path -LiteralPath $Iscc -PathType Leaf)) { throw 'Set -Iscc to the local Inno Setup compiler.' }
$root = [IO.Path]::GetFullPath($OutputRoot)
if (Test-Path -LiteralPath $root) { throw 'Choose a new output directory for this release.' }
New-Item -ItemType Directory -Path $root | Out-Null
$payload = (New-Item -ItemType Directory -Path (Join-Path $root 'payload')).FullName
$media = (New-Item -ItemType Directory -Path (Join-Path $root 'media')).FullName

function Run-Docker([string[]]$Arguments) {
    $output = & docker @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Docker operation failed ($($Arguments[0])). Use a locally built Linux x64 image." }
    return $output
}

$imageData = Run-Docker @('image', 'inspect', '--format', '{{json .}}', $Image) | ConvertFrom-Json
if ($imageData.Os -ne 'linux' -or $imageData.Architecture -ne 'amd64') { throw 'The packaged image must be Linux amd64.' }
$releaseTag = "kazmion/pos:offline-$Version"
$previousTag = & docker image ls --no-trunc --format '{{.ID}}' $releaseTag
if ($previousTag -and $previousTag -ne $imageData.Id) { throw 'Choose a new release version. The tag already points to another image.' }
$pg = Run-Docker @('run', '--rm', '--pull', 'never', '--network', 'none', '--entrypoint', 'postgres', $Image, '--version')
if ("$pg" -notmatch 'PostgreSQL\)\s+([0-9]+)\.') { throw 'Could not determine the image PostgreSQL major version.' }
$major = [int]$Matches[1]
Run-Docker @('image', 'tag', $imageData.Id, $releaseTag) | Out-Null
$archive = Join-Path $payload 'pos-image.tar'
Run-Docker @('image', 'save', '--output', $archive, $releaseTag) | Out-Null
$hash = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash
[ordered]@{ version = $Version; image = $releaseTag; imageId = $imageData.Id; archiveSHA256 = $hash; postgresMajor = $major } |
    ConvertTo-Json | Set-Content -Encoding Ascii -LiteralPath (Join-Path $payload 'release.json')
foreach ($file in @('Start-POS.ps1','Firewall.ps1','compose.yaml','OFFLINE-SETUP.txt')) {
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot $file) -Destination $payload
}
& $Iscc "/DPayloadDir=$payload" "/DReleaseVersion=$Version" "/DInstallerOutput=$media" (Join-Path $PSScriptRoot 'KazmiOn-Offline.iss')
if ($LASTEXITCODE -ne 0) { throw 'Inno Setup failed.' }
$parts = @(Get-ChildItem -LiteralPath $media -File)
$parts | ForEach-Object { '{0} *{1}' -f (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant(), $_.Name } |
    Set-Content -Encoding Ascii -LiteralPath (Join-Path $media 'SHA256SUMS.txt')
Write-Host "Keep every installer part together in $media"
