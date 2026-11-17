# KazmiOn — Docker Deployment Guide (Windows)

## Prerequisites

| Requirement | Minimum | Notes |
|-------------|---------|-------|
| Windows | 10 / 11 (64-bit) | WSL2 required for Docker |
| Docker Desktop | Latest stable | Enable WSL2 backend |
| RAM | 8 GB | 16 GB recommended |
| Disk | 20 GB free | For images + MongoDB data |
| Git | Any recent | For cloning |

## Quick Start

```powershell
# 1. Clone
git clone <repo-url> kazmion
Set-Location kazmion

# 2. Configure
Copy-Item .env.example .env
# Open .env and set all REPLACE_ME values (see Configuration section)

# 3. Build + Start (takes 3–5 min on first run)
npm run docker:rebuild

# 4. Open
Start-Process "http://localhost:8080"
```

## Configuration (.env)

Minimum required values — replace all `REPLACE_ME_*`:

```env
# Secrets (generate with PowerShell below)
JWT_ACCESS_SECRET=<64-char random string>
JWT_REFRESH_SECRET=<different 64-char random string>
PLATFORM_DEVELOPER_SETUP_TOKEN=<32+ char random string>

# URLs
CORS_ORIGIN=http://localhost:5173,http://localhost:8080
PASSWORD_RESET_BASE_URL=http://localhost:8080

# Optional: PostgreSQL (for migration only)
# POSTGRES_PASSWORD=<password>
```

**Generate secrets in PowerShell:**
```powershell
-join ((65..90)+(97..122)+(48..57) | Get-Random -Count 64 | ForEach-Object {[char]$_})
```
Run twice — once for JWT_ACCESS_SECRET, once for JWT_REFRESH_SECRET.

## Commands

| Command | Description |
|---------|-------------|
| `npm run docker:rebuild` | Build fresh images + start (after code changes) |
| `npm run docker:start` | Start existing images |
| `npm run docker:stop` | Stop all containers |
| `npm run docker:logs` | Tail all container logs |
| `.\scripts\verify-deployment.ps1` | Post-startup smoke test |

## Ports

| Port | Service | Access |
|------|---------|--------|
| **8080** | Web app (Nginx + React SPA) | `http://localhost:8080` |
| 3000 | NestJS API | Dev/debug only |
| 27017 | MongoDB | Dev/debug only |
| 6379 | Redis | Dev/debug only |

> **Security:** In production, expose only port 8080 externally. The other ports are for local development.

## Persistent Volumes

| Volume | Contents | Location |
|--------|---------|---------|
| `mongo_data` | All business data | Managed by Docker |
| `redis_data` | Queue persistence | Managed by Docker |
| `invoice_data` | Generated PDFs | Managed by Docker |

## Updating the Application

```powershell
# 1. Backup first (always!)
.\scripts\backup\mongo-backup.ps1

# 2. Pull latest code
git pull origin main

# 3. Rebuild with new source
npm run docker:rebuild

# 4. Verify
.\scripts\verify-deployment.ps1
```

## Troubleshooting

| Symptom | Diagnosis | Fix |
|---------|-----------|-----|
| Port 8080 shows old UI | Stale Docker image | `npm run docker:rebuild` |
| `401 Unauthorized` on all routes | Wrong JWT secret | Check `JWT_ACCESS_SECRET` in `.env` |
| PDF not generating | Worker error | `docker compose logs pdf-worker` |
| Cannot connect to MongoDB | Service not healthy | `docker compose logs mongo` |
| `set JWT_ACCESS_SECRET in .env` error | Missing env var | Edit `.env`, set the value |
| Containers keep restarting | Startup failure | `docker compose logs <service>` |

**Full reset (WARNING — deletes all data):**
```powershell
docker compose down -v          # remove containers + volumes
npm run docker:rebuild          # rebuild from scratch
```

## Health Endpoints

| Endpoint | Expected response |
|----------|-------------------|
| `http://localhost:3000/api/health` | `{"status":"ok"}` |
| `http://localhost:8080/health` | `200 OK` (Nginx static) |

## First-Time Setup After Deploy

1. Navigate to `http://localhost:8080`
2. Use the developer setup flow to create the platform developer account (requires `PLATFORM_DEVELOPER_SETUP_TOKEN`)
3. Create a tenant/business through the developer console
4. Log in as the business owner
5. Configure products, staff, and business settings
