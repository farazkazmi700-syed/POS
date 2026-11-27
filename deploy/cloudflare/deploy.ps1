# ============================================
# KazmiOn POS - Cloudflare Pages deploy (CLI)
# Builds app/web and deploys dist/ via wrangler.
# ============================================

param([switch]$PilotApproved)

$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$WebDir = Join-Path $RepoRoot "app/web"
$ProjectName = "kazmion-pos-web"
$branch = git -C $RepoRoot branch --show-current
if (!$PilotApproved -or $LASTEXITCODE -ne 0 -or $branch -ne 'main') {
    throw 'Production deployment requires main and recorded test and pilot approval. Use the Release V1 workflow.'
}
git -C $RepoRoot diff --quiet HEAD --
if ($LASTEXITCODE -ne 0 -or (git -C $RepoRoot ls-files --others --exclude-standard)) {
    throw 'Deploy only from the clean, approved revision.'
}

Set-Location $WebDir

try {
    if ([string]::IsNullOrWhiteSpace($env:VITE_API_BASE_URL)) {
        throw "VITE_API_BASE_URL is not set. Set it to the HTTPS API origin ending in /api (see deploy/DEPLOY.md). A production Pages deploy cannot run without a real API origin."
    }
    node -e 'const url = new URL(process.env.VITE_API_BASE_URL); if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || !url.pathname.endsWith("/api")) throw new Error("Set VITE_API_BASE_URL to the HTTPS API origin ending in /api")'
    if ($LASTEXITCODE -ne 0) { throw "Invalid Pages API base URL." }

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
    npx --yes wrangler@4.168.0 pages deploy dist --project-name $ProjectName --config wrangler.toml --branch main
    if ($LASTEXITCODE -ne 0) { throw "wrangler pages deploy failed." }

    Write-Host "Deployment complete." -ForegroundColor Green
}
catch {
    Write-Host ""
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "If authentication failed, run: npx wrangler login" -ForegroundColor Yellow
    exit 1
}
