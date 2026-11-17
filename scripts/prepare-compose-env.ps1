<#
.SYNOPSIS
  Ensures the local Docker Compose environment has the required setup token.

.DESCRIPTION
  Generates PLATFORM_DEVELOPER_SETUP_TOKEN only when it is blank or absent.
  The token is written to the ignored root .env file and is never printed.
#>
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $root '.env'
$exampleFile = Join-Path $root '.env.example'

if (-not (Test-Path -LiteralPath $envFile)) {
  if (-not (Test-Path -LiteralPath $exampleFile)) { throw 'Neither .env nor .env.example exists.' }
  Copy-Item -LiteralPath $exampleFile -Destination $envFile
  Write-Host 'Created .env from .env.example.' -ForegroundColor Green
}

$lines = @(Get-Content -LiteralPath $envFile)
$keyPattern = '^\s*PLATFORM_DEVELOPER_SETUP_TOKEN\s*='
$hasToken = $false
foreach ($line in $lines) {
  if ($line -match $keyPattern -and $line -notmatch '^\s*PLATFORM_DEVELOPER_SETUP_TOKEN\s*=\s*$') {
    $hasToken = $true
    break
  }
}

if (-not $hasToken) {
  $bytes = New-Object byte[] 48
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $token = [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
  $replacement = "PLATFORM_DEVELOPER_SETUP_TOKEN=$token"
  $replaced = $false
  $updated = foreach ($line in $lines) {
    if (-not $replaced -and $line -match $keyPattern) {
      $replaced = $true
      $replacement
    } else {
      $line
    }
  }
  if (-not $replaced) { $updated += $replacement }
  Set-Content -LiteralPath $envFile -Value $updated -Encoding UTF8
  $lines = @($updated)
  Write-Host 'Generated and stored PLATFORM_DEVELOPER_SETUP_TOKEN in the ignored .env file.' -ForegroundColor Green
} else {
  Write-Host 'PLATFORM_DEVELOPER_SETUP_TOKEN is already configured.' -ForegroundColor Green
}

foreach ($secretName in @('JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET')) {
  $secretPattern = "^\\s*$secretName\\s*="
  $hasSecret = $false
  foreach ($line in $lines) {
    if ($line -match $secretPattern -and $line -notmatch "^\\s*$secretName\\s*=\\s*$") {
      $hasSecret = $true
      break
    }
  }
  if ($hasSecret) { continue }

  $secretBytes = New-Object byte[] 48
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($secretBytes)
  $secret = [Convert]::ToBase64String($secretBytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
  $secretReplacement = "$secretName=$secret"
  $secretReplaced = $false
  $lines = @($lines | ForEach-Object {
    if (-not $secretReplaced -and $_ -match $secretPattern) {
      $secretReplaced = $true
      $secretReplacement
    } else {
      $_
    }
  })
  if (-not $secretReplaced) { $lines += $secretReplacement }
  Set-Content -LiteralPath $envFile -Value $lines -Encoding UTF8
  Write-Host "Generated and stored $secretName in the ignored .env file." -ForegroundColor Green
}
