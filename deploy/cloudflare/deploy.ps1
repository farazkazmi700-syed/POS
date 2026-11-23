# ============================================
# KazmiOn POS - Cloudflare Pages deploy (CLI)
# Builds app/web and deploys dist/ via wrangler.
# ============================================

$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$WebDir = Join-Path $RepoRoot "app/web"
$ProjectName = "kazmion-pos-web"

Set-Location $WebDir

try {
    Write-Host "Installing web dependencies..." -ForegroundColor Cyan
    npm ci
    if ($LASTEXITCODE -ne 0) { throw "npm ci failed." }

    Write-Host "Building web app (typecheck + vite)..." -ForegroundColor Cyan
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "Web build failed." }

    if (-not (Test-Path (Join-Path $WebDir "dist/index.html"))) {
        throw "dist/index.html not found after build."
    }

    Write-Host "Deploying to Cloudflare Pages project '$ProjectName'..." -ForegroundColor Cyan
    npx wrangler pages deploy dist --project-name $ProjectName --config-name wrangler.toml
    if ($LASTEXITCODE -ne 0) { throw "wrangler pages deploy failed." }

    Write-Host "Deployment complete." -ForegroundColor Green
}
catch {
    Write-Host ""
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "If authentication failed, run: npx wrangler login" -ForegroundColor Yellow
    exit 1
}
