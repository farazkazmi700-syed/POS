# KazmiOn POS Upgrade Progress

## Decisions
- Keep existing stack (React + Vite, NestJS/Node.js, BullMQ + Redis, PostgreSQL + FerretDB/DocumentDB + `@pos/invoice-store`) and working business features; upgrade in place with incremental migrations, tests, and small commits.
- **V1 (Offline):** Default to `BACKUP_MODE=offline`, `STORAGE_MODE=local`, offline recovery codes, and offline-capable installation/runtime without external network dependencies.
- **V2 (Online Developer Management & Cloud Sync):** Built upon `0b026fe` (`deploymentMode`, `DataSync`, `OperationalModules`, encrypted Cloudflare D1/R2 snapshots, tenant trash/30-day recovery, installment collection forecast, and developer profile/security).

## Changed Paths (Current Working Tree Ready for Push)
- `PROGRESS.md` — Updated test results and current milestone status.
- `README.md`, `docker/Dockerfile`, `docker/postgres/provision-businesses.cjs`, `deploy/scripts/migration/prepare-invoice-store.cjs`
- `app/api/**` — Permissions/security access, developer tenant trash (`tenant-trash.service.ts`), installment collection forecast (`collection-forecast.ts`), encrypted data-sync destination (`data-sync-destination.ts`), super-admin/module manifests, invoice/product/auth/support updates.
- `app/packages/{api-contracts,invoice-store,shared-types}/**` & `app/pdf-worker/**` — Shared contracts, invoice store updates, and bilingual 58mm receipt template/renderer tests.
- `app/web/**` — `AccountSecurity.tsx`, `DataSync.tsx`, `OperationalModules.tsx`, `DeveloperProfileMenu.tsx`, `InstallmentCapabilities.tsx`, `useRecoveryCooldown.ts`, `InvoicePaper.css`, `Login.tsx`/`Login.css`, `Developer.tsx`/`Developer.css`, `Settings.tsx`, `SuperAdmin.tsx`, `Backup.tsx`, `Help.tsx`, `Recovery.tsx`, `Register.tsx`, `InstallmentDetail.tsx`.
- `deploy/cloudflare/data-sync/**` — Encrypted snapshot migration `0002_encrypted_snapshots.sql`, `worker.mjs`, `worker.test.mjs`.
- `qa/**` — Updated & added tests (`tenant-trash.test.cjs`, `sign-in.spec.cjs`, `recovery.spec.cjs`, `developer-ui.spec.cjs`, `delivery-ui.spec.cjs`, `installment-invoice-view.test.cjs`).

## Test Results
- `npm run test:api`: **PASS** (`18/18` suites, `90/90` tests).
- `npm run test:pdf`: **PASS** (`8/8` tests).
- `npm run build`: **PASS** (`app/api`, `app/pdf-worker`, `app/web` built cleanly).
- `npm run test:web:typecheck`: **PASS** (`tsc --noEmit` exited `0`).
- `node --test qa/tenant-trash.test.cjs`: **PASS** (`4/4` tests).
- `node --test deploy/cloudflare/data-sync/worker.test.mjs`: **PASS** (`4/4` tests).
- `node --test qa/backup-delivery.test.cjs`: **PASS** (`4/4` tests).
- `qa/sign-in.spec.cjs`: **PASS** (`13/13` tests across `320x568`–`2560x1080` light/dark & developer security step).

## Blockers
- None blocking push to `origin/main`. Next V1/V2 work: offline Windows bundle/installer verification (`deploy/scripts/install.ps1` without internet) and any remaining V2 developer fleet management / sync polish.
