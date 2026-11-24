# ============================================
# KazmiOn POS - Full Cloudflare Deployment
# Deploys Web (Pages), API (Workers), PDF Worker (Workers)
# ============================================

$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path

function Write-Status($msg) { Write-Host $msg -ForegroundColor Cyan }
function Write-Success($msg) { Write-Host $msg -ForegroundColor Green }
function Write-Error($msg) { Write-Host $msg -ForegroundColor Red }
function Write-Warning($msg) { Write-Host $msg -ForegroundColor Yellow }

# Check prerequisites
Write-Status "Checking prerequisites..."
$nodeVersion = node --version
if (-not $nodeVersion) { throw "Node.js not found. Please install Node.js 24+" }
Write-Status "Node.js version: $nodeVersion"

# Check wrangler
try {
    $wranglerVersion = npx wrangler --version 2>$null
    Write-Status "Wrangler version: $wranglerVersion"
} catch {
    throw "Wrangler not found. Run: npm install -g wrangler"
}

# Check Cloudflare authentication
try {
    npx wrangler whoami | Out-Null
    Write-Status "Cloudflare authentication: OK"
} catch {
    Write-Warning "Not authenticated with Cloudflare. Run: npx wrangler login"
    exit 1
}

# Deploy Web to Cloudflare Pages
Write-Status "`n=== Deploying Web to Cloudflare Pages ==="
$WebDir = Join-Path $RepoRoot "app/web"
Set-Location $WebDir

try {
    Write-Status "Installing web dependencies..."
    npm ci
    if ($LASTEXITCODE -ne 0) { throw "npm ci failed for web." }

    Write-Status "Building web app..."
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "Web build failed." }

    if (-not (Test-Path (Join-Path $WebDir "dist/index.html"))) {
        throw "dist/index.html not found after web build."
    }

    Write-Status "Deploying to Cloudflare Pages project 'kazmion-pos-web'..."
    npx wrangler pages deploy dist --project-name kazmion-pos-web --config-name wrangler.toml
    if ($LASTEXITCODE -ne 0) { throw "wrangler pages deploy failed for web." }

    Write-Success "Web deployment complete."
} catch {
    Write-Error "Web deployment failed: $($_.Exception.Message)"
    exit 1
}

# Deploy API to Cloudflare Workers
Write-Status "`n=== Deploying API to Cloudflare Workers ==="
$ApiDir = Join-Path $RepoRoot "app/api"
Set-Location $ApiDir

try {
    Write-Status "Installing API dependencies..."
    npm ci
    if ($LASTEXITCODE -ne 0) { throw "npm ci failed for API." }

    Write-Status "Building API..."
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "API build failed." }

    Write-Status "Building Worker entry..."
    npm run build:worker
    if ($LASTEXITCODE -ne 0) { throw "Worker build failed." }

    Write-Status "Deploying to Cloudflare Workers project 'kazmion-pos-api'..."
    npx wrangler deploy
    if ($LASTEXITCODE -ne 0) { throw "wrangler deploy failed for API." }

    Write-Success "API deployment complete."
} catch {
    Write-Error "API deployment failed: $($_.Exception.Message)"
    exit 1
}

# Deploy PDF Worker to Cloudflare Workers
Write-Status "`n=== Deploying PDF Worker to Cloudflare Workers ==="
$PdfWorkerDir = Join-Path $RepoRoot "app/pdf-worker"
Set-Location $PdfWorkerDir

try {
    Write-Status "Installing PDF Worker dependencies..."
    npm ci
    if ($LASTEXITCODE -ne 0) { throw "npm ci failed for PDF Worker." }

    Write-Status "Building PDF Worker..."
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "PDF Worker build failed." }

    Write-Status "Deploying to Cloudflare Workers project 'kazmion-pos-pdf-worker'..."
    npx wrangler deploy
    if ($LASTEXITCODE -ne 0) { throw "wrangler deploy failed for PDF Worker." }

    Write-Success "PDF Worker deployment complete."
} catch {
    Write-Error "PDF Worker deployment failed: $($_.Exception.Message)"
    exit 1
}

Write-Success "`n=== All Cloudflare deployments completed successfully! ==="
Write-Status "Web: https://kazmion-pos-web.pages.dev"
Write-Status "API: https://kazmion-pos-api.<your-subdomain>.workers.dev"
Write-Status "PDF Worker: https://kazmion-pos-pdf-worker.<your-subdomain>.workers.dev"