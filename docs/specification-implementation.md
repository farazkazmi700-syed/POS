# Product specification implementation status

Source: `KazmiOn_SaaS_Product_Specification_Updated.docx`, version 2.0, 12 November 2026. This is an implementation and verification checklist, not a production-readiness or FBR certification claim.

## Implemented foundation

| Specification area | Implementation | Practical limits |
| --- | --- | --- |
| Tenant isolation | Existing tenant filters retained; real API checks exercise cross-tenant reads and writes | Full penetration testing remains outstanding |
| Branch isolation | Branch registry, assignments, branch selector, branch-limit enforcement, branch-scoped operational queries and aggregates | Legacy records without a branch belong to the first/default branch; terminal/device registration is pending |
| Action permissions | Server-side action mapping denies unknown routes/roles; optional action grants restrict role defaults; module rights remain enforced | Owner/admin/cashier are implemented; specialized roles and maker-checker policies remain pending |
| User lifecycle | Staff activation/deactivation, branch/action grants, session-version revocation | MFA, per-device session registry, refresh-token rotation and periodic access reviews remain pending |
| Developer authentication | Private hashed developer PIN separate from tenant PIN, lockout, setup-token authorization; hardcoded credential removed | Privileged MFA and secure secret provisioning are deployment gates |
| Checkout | Atomic stock reservations, optional idempotency keys, mixed cash/card/wallet tender, held carts, server-calculated totals | Held carts are browser-memory state; partial refunds/exchanges and offline checkout are not implemented |
| Full refunds and voids | Atomic order-state transitions and replay-safe stock restoration; refund reason/approver/time retained | Installment settlement, credit-note documents, crash-recovery drills and configurable approval thresholds remain pending |
| Inventory adjustments | Reasoned, replay-safe adjustments with nonnegative stock checks and persisted adjustment records | This is an adjustment ledger, not a complete purchasing/transfer/stocktake ledger |
| Barcode catalog | First-class barcode field, exact lookup, branch-scoped uniqueness, malformed-input validation | Weighted barcodes, GS1 lot/serial parsing, physical scanners/scales and label-printer compatibility require further work/testing |
| Business types | Retail, supermarket, grocery, pharmacy, electronics and restaurant categories supported | Category selection does not implement the specialized workflows listed below |
| Platform settings | Deployment entitlement, branch limit and license expiry; tenant cannot self-edit platform settings | Offline/hybrid entitlement is configuration only; no local-first sync engine or signed device licensing yet |
| Audit | Append-only application collection and audit endpoint for successful authenticated mutations; no request bodies/secrets stored | Database-level WORM retention, all denied actions and cryptographic tamper evidence are not yet established |
| Readiness | Public API health endpoint checks MongoDB connectivity | Redis/queue/worker health, load tests and centralized incident monitoring remain pending |
| Footer | KazmiOn development/copyright footer and WhatsApp contact `0331-6276186` | External messaging is opened only on user click |
| Receipt security | Mixed tenders in receipts, HTML escaping, embedded-image-only logos, PDF JavaScript/network disabled | Remote logo URLs must be replaced by uploaded embedded images; hardware compatibility remains unverified |
| CI | API unit/build checks, disposable-database integration test job, frontend build/browser checks, worker build | Hosted CI execution itself must be verified after pushing |

## Important transaction boundary

The current MongoDB deployment is standalone. Sales use conditional stock updates and compensating rollback rather than multi-document replica-set transactions. Idempotency and refund races are exercised by API tests, but process-kill recovery, partial infrastructure failures, long-term replay-marker growth, and multi-entity durability are not certified. Migrate to a supported transaction/outbox design and run fault-injection tests before production approval.

## Remaining specification work

| Priority | Work still required |
| --- | --- |
| P0 | Full sales/refund/stock ledger and partial-return accounting; specialized role policies; maker-checker approvals; privileged MFA; refresh-token rotation; comprehensive negative-path, failed-audit and fault-injection coverage |
| P1 purchasing | Suppliers, purchase orders, goods receipts, supplier returns, landed cost and payables |
| P1 finance | Cash drawers, shifts, expenses, reconciliation, daily close, loyalty/credit limits and accounting exports |
| P1 supermarket/grocery | Scale PLU, weighted labels, multi-lane registers, promotions, conversions, perishables and high-volume stock counts |
| P1 pharmacy | Per-lot stock, FEFO, expiry/recall controls, prescription references and pharmacist approvals |
| P1 electronics | Unique serial/IMEI lifecycle, warranty eligibility, service/repair tickets and device history |
| P1 retail | Variant matrix, exchanges/store credit, loyalty, transfers and reservations |
| P1 restaurant | Tables, kitchen tickets/display, modifiers, recipes, waiter assignments, split bills and tips |
| P1 offline/hybrid | Local API/database packaging, encrypted local writes, append-only sync queue, idempotent cloud reconciliation, conflict policy, clock-drift handling and 24-hour interruption tests |
| P1 resilience/hardware | Encrypted backup/restore implementation and restore drill, signed updates, device loss recovery and tested printer/drawer/scanner/scale adapters |
| P2 | Applicable current official FBR pathway, credentials, sandbox adapter, response/QR/reference storage, idempotent retry/reconciliation, authorized tax/legal validation and production approval |
| P3 | Billing/trials, signed licenses/device revocation, support tickets, audited/time-bound support access, metrics, incident management and scaling tests |

No transaction is marked FBR-confirmed. Existing invoice QR codes contain local receipt information and are not FBR acknowledgements.

## Verification commands

```powershell
npm --prefix apps/api test -- --runInBand
npm --prefix apps/api run build
node qa/api-integration.cjs
npm --prefix apps/pdf-worker run build
node --test apps/pdf-worker/dist/services/invoice-renderer.test.js
npm --prefix apps/web run build
npm exec --yes --package=@playwright/test -- playwright test --config=qa/playwright.config.cjs
docker compose up -d --build api pdf-worker web
npm exec --yes --package=@playwright/test -- playwright test --config=qa/runtime.config.cjs
```

The integration harness creates a unique `pos_spec_test_*` database and `spec-test-*` Redis namespace. Cleanup validates these exact generated names before removing them. It does not use the business database for test fixtures. Browser smoke checks use isolated demo responses and do not prove live API integration.

## Verification results — 12 November 2026 (Asia/Karachi)

- All three production builds passed through `npm run build`.
- API: 9 suites, 40 unit tests passed after the final dependency updates.
- Real API integration: 22 checks passed, including tenant/branch isolation, role restrictions, session revocation, checkout concurrency, void/refund races, mixed tender, barcode validation, stock adjustments, platform-only licensing and audit redaction. Disposable fixtures were cleaned up.
- Browser UI: 56 checks passed across 28 routes in desktop/light and mobile/dark modes. POS hold/resume, mixed-tender calculation and modal keyboard behavior are included. These use mocked API responses.
- Deployed-stack browser check passed against port 8080: sign-in renders, the supplied hero image loads, password visibility works, MongoDB health is reachable through the web proxy, and invalid credentials produce a visible error with the submit button re-enabled.
- Receipt renderer: 3 tests passed. The rebuilt worker also generated a valid 13,577-byte PDF using its installed Chromium without writing a business record.
- Production API dependency audit: zero reported vulnerabilities. The development dependency tree still reports 4 low and 16 moderate findings; the suggested forced Jest downgrade was not applied.
- Final Docker deployment: updated API, web and PDF-worker containers are running; MongoDB and Redis are healthy. After the final API replacement, `/login`, `/api/health` through port 8080, and `/api/docs` on port 3000 returned successfully. Existing persistent volumes were retained.

These results cover the named scenarios, not every requirement or failure mode in the specification. Hosted CI, real payment/hardware providers, FBR, prolonged offline operation and disaster recovery remain unverified.

## Running and setup

The local container UI is exposed at `http://localhost:8080`; the API at `http://localhost:3000/api`; readiness at `/api/health`; OpenAPI at `/api/docs`. Container status and HTTP responses must be checked after rebuilding.

Existing business accounts remain in the preserved MongoDB volume. Developer access now requires `PLATFORM_DEVELOPER_EMAIL` and a private setup token configured in the environment, followed by the authorized setup flow to generate a private PIN. There is no hardcoded fallback PIN. Never commit the token or generated PIN.
