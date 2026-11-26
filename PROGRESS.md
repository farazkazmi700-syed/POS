# KazmiOn POS Upgrade Progress

## Decisions
- Keep existing stack (React + Vite, NestJS/Node.js, BullMQ + Redis, PostgreSQL + FerretDB/DocumentDB + `@pos/invoice-store`) and working business features; upgrade in place with incremental migrations, tests, and small commits.
- **Developer Business Tenants UX:** Refactored the Businesses tab (`Developer.tsx`, `Developer.css`) into dedicated toolbar, sort/status bar, header + plan assignment, non-clipping full-width action bar (`Details`, `Accounts`, `Suspend/Reactivate`, `Delete tenant`), and uniform `Module Entitlements` toggle grid across desktop, tablet, and mobile.
- **Dashboard in Module Entitlements:** Promoted `dashboard` (`MOD-DASHBOARD`) to a first-class `FeatureKey` and `ModuleManifest` while preserving legacy fallback from `reports` when `featureFlags.dashboard` is unset, and allowing `orders/stats/summary` for either `dashboard` or `reports`.
- **V1 (Offline):** Default to `BACKUP_MODE=offline`, `STORAGE_MODE=local`, offline recovery codes, and offline-capable installation/runtime without external network dependencies.
- **V2 (Online Developer Management & Cloud Sync):** Built upon `0b026fe` (`deploymentMode`, `DataSync`, `OperationalModules`, encrypted Cloudflare D1/R2 snapshots, tenant trash/30-day recovery, installment collection forecast, and developer profile/security).

## Changed Paths
- `app/api/src/common/features.ts`, `app/api/src/common/provisioning-rights.ts`, `app/api/src/modules/auth/auth.service.ts`, `app/api/src/modules/order/order.controller.ts`
- `app/api/src/modules/super-admin/{dto/super-admin.dto.ts,module-manifests.ts,module-manifests.spec.ts,schemas/subscription-plan.schema.ts,super-admin.service.ts}`
- `app/api/src/modules/tenant/schemas/tenant.schema.ts`
- `app/packages/shared-types/src/index.ts`
- `app/web/src/components/{Layout.tsx,ProtectedRoute.tsx}`, `app/web/src/utils/access.ts`
- `app/web/src/pages/{Developer.tsx,Developer.css,SuperAdmin.tsx}`
- `qa/developer-ui.spec.cjs`
- `PROGRESS.md`

## Test Results
- Pending verification run after final `module-manifests.spec.ts` and `qa/developer-ui.spec.cjs` test additions.

## Blockers
- None.
