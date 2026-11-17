# KazmiOn — Windows Installer Guide

## Deployment Strategy

KazmiOn targets Windows business PCs using **Docker Desktop** as the runtime environment. The recommended installer approach uses **Inno Setup** to:

1. Check/install prerequisites (Docker Desktop)
2. Install KazmiOn files
3. Configure the application
4. Create a desktop shortcut that launches the browser to `http://localhost:8080`

---

## Architecture (Windows Client)

```
C:\KazmiOn\                    ← Installation directory
  docker-compose.yml           ← Services definition
  .env                         ← Business configuration (secrets)
  scripts\
    start.ps1                  ← Start the stack
    stop.ps1                   ← Stop the stack
    update.ps1                 ← Update without data loss
    backup.ps1                 ← Manual backup
  images\
    kazmion-api.tar            ← Pre-built Docker image (optional)
    kazmion-web.tar            ← Pre-built Docker image (optional)
    kazmion-pdf-worker.tar     ← Pre-built Docker image (optional)

Docker Named Volumes (managed by Docker, never in C:\KazmiOn):
  pos-system_mongo_data        ← ALL business data
  pos-system_redis_data        ← Queue persistence
  pos-system_invoice_data      ← Generated PDFs
```

> [!IMPORTANT]
> Docker named volumes are stored by Docker Engine — NOT in `C:\KazmiOn\`. They survive uninstallation of the KazmiOn application files. Only explicitly running `docker volume rm` deletes them.

---

## Inno Setup Script (`installer/kazmion-setup.iss`)

```pascal
[Setup]
AppName=KazmiOn POS
AppVersion=1.0.0
AppPublisher=KazmiOn Technologies
DefaultDirName={autopf}\KazmiOn
DefaultGroupName=KazmiOn
OutputBaseFilename=KazmiOn-Setup-1.0.0
Compression=lzma2
SolidCompression=yes
ArchitecturesInstallIn64BitMode=x64
MinVersion=10.0.19041   ; Windows 10 2004 (required for WSL2)

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
; Docker Compose configuration
Source: "..\docker-compose.yml";   DestDir: "{app}"; Flags: ignoreversion
Source: "..\docker-compose.postgres.yml"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\env.example";          DestDir: "{app}"; DestName: ".env.example"; Flags: ignoreversion

; Scripts
Source: "..\scripts\*"; DestDir: "{app}\scripts"; Flags: ignoreversion recursesubdirs

; Pre-built Docker images (if offline installer)
; Source: "images\*.tar"; DestDir: "{app}\images"; Flags: ignoreversion

[Icons]
Name: "{group}\KazmiOn POS";   Filename: "{app}\scripts\start-browser.bat"; IconFilename: "{app}\assets\icon.ico"
Name: "{group}\Stop KazmiOn";  Filename: "{app}\scripts\stop.bat"
Name: "{group}\Backup Data";   Filename: "{app}\scripts\backup.bat"
Name: "{commondesktop}\KazmiOn POS"; Filename: "{app}\scripts\start-browser.bat"; IconFilename: "{app}\assets\icon.ico"

[Run]
; Generate .env from template if it doesn't exist
Filename: "pwsh.exe"; Parameters: "-NoProfile -File ""{app}\scripts\setup-env.ps1"""; Description: "Configure application"; Flags: runhidden waituntilterminated

; Start the Docker stack
Filename: "pwsh.exe"; Parameters: "-NoProfile -File ""{app}\scripts\first-run.ps1"""; Description: "Starting KazmiOn (first run)..."; Flags: waituntilterminated
```

---

## Prerequisite Check Script (`scripts/check-prerequisites.ps1`)

```powershell
# Check Docker Desktop
$docker = Get-Command docker -ErrorAction SilentlyContinue
if (-not $docker) {
  Write-Host "Docker Desktop is not installed." -ForegroundColor Red
  Write-Host "Download from: https://www.docker.com/products/docker-desktop/" -ForegroundColor Yellow
  Write-Host "After installing, restart your computer and run KazmiOn Setup again." -ForegroundColor Yellow
  exit 1
}

# Check Docker is running
try {
  docker info 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) { throw }
} catch {
  Write-Host "Docker Desktop is installed but not running." -ForegroundColor Red
  Write-Host "Please start Docker Desktop from the Start Menu, wait for it to initialize," -ForegroundColor Yellow
  Write-Host "then run KazmiOn Setup again." -ForegroundColor Yellow
  exit 1
}

# Check WSL2 (required for Docker Desktop on Windows 10/11)
$wsl = wsl --status 2>&1
if ($LASTEXITCODE -ne 0) {
  Write-Host "WSL2 is not enabled." -ForegroundColor Red
  Write-Host "Run in an Administrator PowerShell: wsl --install" -ForegroundColor Yellow
  Write-Host "Then restart your computer." -ForegroundColor Yellow
  exit 1
}

Write-Host "All prerequisites satisfied." -ForegroundColor Green
exit 0
```

---

## First-Run Script (`scripts/first-run.ps1`)

```powershell
Set-Location $PSScriptRoot\..

# Generate secrets if .env doesn't exist
if (-not (Test-Path ".env")) {
  $accessSecret  = -join ((65..90)+(97..122)+(48..57) | Get-Random -Count 64 | ForEach-Object {[char]$_})
  $refreshSecret = -join ((65..90)+(97..122)+(48..57) | Get-Random -Count 64 | ForEach-Object {[char]$_})
  $setupToken    = -join ((65..90)+(97..122)+(48..57) | Get-Random -Count 32 | ForEach-Object {[char]$_})

  $env_content = Get-Content ".env.example" -Raw
  $env_content = $env_content `
    -replace "REPLACE_ME_WITH_STRONG_SECRET", $accessSecret `   # first occurrence
    -replace "REPLACE_ME_WITH_STRONG_SECRET", $refreshSecret `  # second occurrence
    -replace "REPLACE_ME_WITH_SETUP_TOKEN", $setupToken `
    -replace "REPLACE_ME_WITH_RESET_URL", "http://localhost:8080"

  Set-Content ".env" $env_content
  Write-Host "Generated secure .env configuration" -ForegroundColor Green
}

# Pull/load images and start
Write-Host "Starting KazmiOn (this may take a few minutes on first run)..." -ForegroundColor Cyan
docker compose up -d

# Wait for health
$deadline = (Get-Date).AddMinutes(5)
while ((Get-Date) -lt $deadline) {
  try {
    $r = Invoke-WebRequest -Uri "http://localhost:3000/api/health" -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
    if ($r.StatusCode -eq 200) {
      Write-Host "KazmiOn is ready!" -ForegroundColor Green
      Start-Process "http://localhost:8080"
      exit 0
    }
  } catch {}
  Start-Sleep 5
}

Write-Host "KazmiOn took longer than expected to start." -ForegroundColor Yellow
Write-Host "Check status with: docker compose ps" -ForegroundColor Gray
```

---

## Desktop Shortcut (`scripts/start-browser.bat`)

```batch
@echo off
cd /d "%~dp0.."
docker compose up -d
timeout /t 3 /nobreak >nul
start http://localhost:8080
```

---

## Update Without Data Loss (`scripts/update.bat`)

```batch
@echo off
cd /d "%~dp0.."
pwsh -NoProfile -File scripts\update-docker.ps1
pause
```

---

## Uninstall Notes

> [!WARNING]
> The Inno Setup uninstaller removes application files from `C:\KazmiOn\` but does **NOT** delete Docker volumes. Business data is safe after uninstall.

To permanently delete all data (factory reset):
```powershell
docker compose down -v   # WARNING: deletes all volumes including business data
```

---

## Alternative: Native Deployment (Without Docker)

If Docker Desktop licensing or WSL2 compatibility is an issue, consider:

1. **MongoDB Community** — install as a Windows service
2. **Redis for Windows** (via Memurai or WSL)
3. **Node.js** — run API and PDF worker as Windows services via NSSM
4. **Nginx** — serve the production React build

This approach avoids Docker but requires manual service management. Docker is strongly preferred for reliability and ease of updates.

---

## System Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| OS | Windows 10 Pro 2004 | Windows 11 Pro |
| CPU | 4 cores | 8 cores |
| RAM | 8 GB | 16 GB |
| Disk | 20 GB free | 50 GB SSD |
| Network | LAN for local access | — |

> Docker Desktop requires Windows 10 Pro/Enterprise/Education or Windows 11. Home editions require WSL2 backend.
