# KazmiOn POS — CI, release and Cloudflare Pages deployment

Last verified against `main` @ `e84ae5c` (2026-11-28) by a local audit + build run.
See also the README sections **CI and deployment** and **Cloudflare Pages**.

## What was verified (2026-11-28)

- `app/web`: `npm ci` exit 0, `npm run build` (`tsc --noEmit && vite build`) exit 0
  — `✓ built in 3.43s`, `dist/` complete (`index.html`, `_headers`, `_redirects`,
  `assets/`, `appearance-boot.js`). `npm run typecheck` exit 0.
- `app/api`: `npm ci` exit 0, `npm run build` (`nest build`) exit 0, `dist/main.js` present.
- `app/pdf-worker`: `npm ci` exit 0 (with `PUPPETEER_SKIP_DOWNLOAD=true`),
  `npm run build` exit 0, `npm test` exit 0 — **9 pass, 0 fail**.
- Every workspace has its own `package-lock.json`, so `npm ci` works in CI.
- `.github/scripts/setup-node.sh` pins Node 24.15.0 and its SHA-256 checksum
  matches the official `nodejs.org/dist/v24.15.0/SHASUMS256.txt`.
- The GitHub MCP has **no tool to list workflow runs or read repo
  secrets/variables**, so CI history and the `VITE_API_BASE_URL` variable could
  not be verified from here. CI itself must be the proof: open a PR and watch
  the checks (see below).

## CI — what runs where

| Workflow | Trigger | Jobs |
| --- | --- | --- |
| `.github/workflows/ci.yml` | push to `main`/`dev`/`release/**`, PR, manual, called by release | `repository` (diff + shell syntax), `api` (jest + build + standalone + live API regression + Postgres sync rehearsal, with mongo:7 / redis:7 / postgres:16 services), `pdf-worker` (build + test), `web` (build + API build + Playwright Chromium), `docker` (image build + container smoke + LAN/recovery rehearsal) |
| `.github/workflows/release.yml` | manual dispatch from `main` only, `pilot_approved` must be true | approval gate → full CI → publish container to GHCR **or** call the Pages workflow |
| `.github/workflows/deploy-cloudflare.yml` | called by `release.yml` only (`workflow_call`) | build `app/web`, deploy `dist/` to Pages project `kazmion-pos-web` |

**Repository-only Actions policy.** The repo deliberately uses no third-party
GitHub Actions (see commits `e99208c` / `6b196f16` / `e3ad16f`): every job
checks out the exact revision with `git init` + `git fetch $GITHUB_SHA`
instead of `actions/checkout`, and Node is installed by
`.github/scripts/setup-node.sh`. Do not reintroduce external actions without
changing that policy first.

## Cloudflare Pages — production deploy

Prerequisites (only Faraz can set these — they live in GitHub/Cloudflare
settings, not in the repo):

1. **Repo secrets** (`Settings → Secrets and variables → Actions`, environment
   `production`): `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.
2. **Repo variable** (`Settings → Secrets and variables → Actions →
   Variables`): `VITE_API_BASE_URL` — the HTTPS API origin **ending in `/api`**,
   e.g. `https://api.kazmion.example/api`.
3. **GitHub `production` environment** configured with required reviewers and
   restricted to `main` (see README).
4. **A deployed API origin.** There is **no deployed API today** — every
   `VITE_API_BASE_URL` in the repo is a placeholder (`api.example.com`,
   `api.kazmion.example`). Until a real API exists, a production Pages deploy
   cannot run: the workflow now fails with a clear message instead of a
   cryptic `TypeError: Invalid URL`.
5. On the API side, set `CORS_ORIGIN` to the Pages origin and
   `PASSWORD_RESET_BASE_URL` to the Pages URL ending in `/reset-password`.

Production path: dispatch **Release V1** from `main`, target `pages`,
`pilot_approved` = true. The workflow reruns CI, then deploys
`app/web/dist` to `kazmion-pos-web` (production branch `main`).
Local equivalent on Windows (requires `main`, clean tree, pilot approval):
`.\deploy\cloudflare\deploy.ps1 -PilotApproved` with
`$env:VITE_API_BASE_URL` set.

## Cloudflare Pages — preview deploy (no API needed)

The Pages workflow now accepts a `preview` input. A preview build uses the
relative `/api` base, so the app loads and renders, but **login and every API
call fail until an API is deployed**. The workflow deploys to the calling
branch (`--branch=${{ github.ref_name }}`), so non-`main` branches get preview
URLs and `main` gets the production URL.

## Known blockers (2026-11-28)

- **No deployed API origin.** Frontend-only preview is the most that can go
  live until the NestJS API is hosted somewhere (VPS / Render / Fly.io, or
  the single-container Docker host) and `VITE_API_BASE_URL` is set.
- **Cloudflare connection lacks Pages scopes.** The connected Cloudflare
  account (`kazmitech142@gmail.com`) returned HTTP 403 `insufficient_scope`
  for both `page.read` (list Pages projects) and `page.write` (create a
  project). No Pages project could be created or deployed from this session.
  Fix: reconnect Cloudflare with Pages permissions, or supply a Cloudflare
  API token with Pages:Edit. The project `kazmion-pos-web` does not exist yet
  (`https://kazmion-pos-web.pages.dev/` returns an empty reply).
- **GitHub App write access.** Creating the fix branch via the GitHub API
  failed with `403 Resource not accessible by integration` — the installed
  Muse GitHub App can read the repo but cannot create branches/push. Fix:
  adjust the App installation for `farazkazmi700-syed/POS` to grant Contents
  write, then the branch/PR can be pushed. The fixes are also saved as a patch
  (see the PR description / `~/workspace/pos-work/`).

## Open items (not changed by this fix)

- `deploy/windows-installer/` is **not in the remote repo** — the offline
  Windows installer source delivered 2026-11-26 (patch
  `~/workspace/your_files/KazmiOn-POS-Windows-Installer/`) was never pushed.
  Applying it is a separate decision.
- **MongoDB vs FerretDB is undecided.** Live data runs on Mongoose over
  FerretDB/DocumentDB on Postgres (see `docker/Dockerfile`); FerretDB has no
  Windows build, so the unpushed installer substitutes native MongoDB 8.0 on
  Windows. That substitution is **unapproved and provisional** — do not treat
  it as settled.
- `app/api/wrangler.toml` (`kazmion-pos-api`, NestJS on Workers with
  `nodejs_compat`) is experimental and not part of the Pages deploy.
