# Cloudflare Pages deployment — KazmiOn POS web

The front end is a static SPA. It is hosted on **Cloudflare Pages** while the
NestJS API, PostgreSQL, Redis and the invoice worker keep running in the Docker
image (`docker/compose/compose.yaml`). Pages serves static assets only; it
cannot run the Node/PostgreSQL stack.

## Folder contents

| File | Purpose |
| --- | --- |
| `deploy.ps1` | Build and deploy `app/web` with `wrangler pages deploy` (CLI path) |
| `wrangler.toml` is kept at `app/web/wrangler.toml` so Pages dashboard builds and the CLI both find it with `--config` |

## Option A — CLI deploy (this folder)

1. Prerequisites: Node.js 24+, a Cloudflare account, and login once with
   `npx wrangler login`.
2. Run from the repository root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File deploy\cloudflare\deploy.ps1
```

The script builds `app/web` (typecheck + Vite) and deploys `dist/` to the
Pages project `kazmion-pos-web`, creating the project on first run.

## Option B — Git integration (dashboard / GitHub Actions)

1. Push the repository to GitHub.
2. In Cloudflare Pages, create a Pages project **connected to the repo** with
   **Root directory** `app/web` — `app/web/wrangler.toml` declares the build
   command (`npm ci && npm run build`), output directory `dist`, SPA fallback
   redirect and immutable asset headers.
3. Or use the provided GitHub Actions workflow
   `.github/workflows/deploy-cloudflare.yml` with repository secrets
   `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.

## Required environment configuration

| Variable | Where | Value |
| --- | --- | --- |
| `VITE_API_BASE_URL` | Pages build env (dashboard) or repo secret | Public API origin incl. `/api`, e.g. `https://api.example.com/api`. Leave empty when the API shares the page origin (Docker/nginx). |
| `CORS_ORIGIN` | API `.env` | The Pages domain, e.g. `https://kazmion-pos-web.pages.dev` |
| `PASSWORD_RESET_BASE_URL` | API `.env` | Pages domain + `/reset-password` |
| HTTPS origin | Cloudflare Tunnel / TLS proxy | The container binds `127.0.0.1:8080` only; expose it over HTTPS. |

## Notes

- The SPA emits relative asset URLs (`base: './'`) and renders routes
  client-side, so it also works under a sub-path such as `/pos`.
- `wrangler.toml`'s `[[redirects]]` rule keeps deep links (`/pos`,
  `/reset-password`, …) working on the static host.
- `/assets/*` is cached immutably; `index.html` is served with `no-cache`.
