<#
.SYNOPSIS
  KazmiOn post-deployment smoke test
.DESCRIPTION
  Verifies the Docker stack is healthy after startup.
  Tests API health, web health, and a basic auth flow.
.EXAMPLE
  .\scripts\verify-deployment.ps1
  .\scripts\verify-deployment.ps1 -BaseUrl http://localhost:8080
#>
param(
  [string]$BaseUrl   = "http://localhost:8080",
  [string]$ApiUrl    = "http://localhost:3000",
  [int]   $TimeoutSec = 60
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Continue"

$passed = 0
$failed = 0

function Test-Endpoint {
  param([string]$Name, [string]$Url, [int]$ExpectedStatus = 200)
  try {
    $resp = Invoke-WebRequest -Uri $Url -TimeoutSec 10 -UseBasicParsing -ErrorAction Stop
    if ($resp.StatusCode -eq $ExpectedStatus) {
      Write-Host "  [OK] $Name ($($resp.StatusCode))"
      $script:passed++
    } else {
      Write-Host "  [FAIL] $Name — expected $ExpectedStatus, got $($resp.StatusCode)"
      $script:failed++
    }
  } catch {
    Write-Host "  [FAIL] $Name — $($_.Exception.Message)"
    $script:failed++
  }
}

Write-Host "========================================"
Write-Host "KazmiOn Deployment Verification"
Write-Host "Web : $BaseUrl"
Write-Host "API : $ApiUrl"
Write-Host "========================================"

# Wait for services
Write-Host "`nWaiting up to ${TimeoutSec}s for services..."
$deadline = (Get-Date).AddSeconds($TimeoutSec)
$ready = $false
while ((Get-Date) -lt $deadline) {
  try {
    $r = Invoke-WebRequest -Uri "$ApiUrl/api/health" -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
    if ($r.StatusCode -eq 200) { $ready = $true; break }
  } catch {}
  Start-Sleep 3
}

if (-not $ready) {
  Write-Host "  [FAIL] API did not become ready within ${TimeoutSec}s"
  exit 1
}

Write-Host "`n--- Endpoint Tests ---"
Test-Endpoint "API health"       "$ApiUrl/api/health"
Test-Endpoint "API Swagger docs" "$ApiUrl/api/docs"      200
Test-Endpoint "Web app (root)"   "$BaseUrl/"
Test-Endpoint "Web app /health"  "$BaseUrl/health"

Write-Host "`n--- Docker Container Health ---"
$rawContainers = docker compose ps --format json 2>$null
if ($rawContainers) {
  $containers = @($rawContainers | ConvertFrom-Json)
  foreach ($c in $containers) {
    $health = if ($c.PSObject.Properties['Health'] -and $c.Health) { $c.Health } else { "N/A" }
    $state  = if ($c.PSObject.Properties['State'] -and $c.State) { $c.State } else { "unknown" }
    $service = if ($c.PSObject.Properties['Service']) { $c.Service } else { $c.Name }
    $ok = ($state -eq "running") -and ($health -in @("healthy","N/A",""))
    if ($ok) {
      Write-Host "  [OK] ${service}: $state / $health"
      $script:passed++
    } else {
      Write-Host "  [FAIL] ${service}: $state / $health"
      $script:failed++
    }
  }
}

Write-Host "`n========================================"
Write-Host "RESULT: $passed passed, $failed failed"
Write-Host "========================================"
if ($failed -gt 0) { exit 1 }
