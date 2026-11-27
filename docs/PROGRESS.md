# Kazmion V2 progress

## Repository audit and branch isolation

- Created `feature/kazmion-v2-cloud` in a linked worktree from the committed `release/v1` baseline `e84ae5c`. Existing V1 working files and offline media stay in their original workspace.
- Reuse the React application, NestJS modules, developer console, PDF worker, and deployment and migration utilities. The offline document database gateway and relational SQL are both present. A relational, managed PostgreSQL runtime still needs implementation and migration rehearsal.
- Existing business coverage includes billing-related records, sales, inventory, installments, customers, recovery and reports. Purchases and suppliers need separate functional verification. Existing licensing and developer operations need a SaaS entitlement, authorization and MFA audit.

## Cloud entry point

- Added a Wrangler Worker for React assets and same-origin API routing, with private cache handling. Existing V1 routes and monetary rules are preserved.
- Added Worker tests to the existing CI workflow and separate staging and production dry-run configurations. See [architecture](ARCHITECTURE.md) and [deployment](DEPLOYMENT.md).
- Added a security workflow for dependency advisories and targeted regressions. Made the reconciliation command require explicit rehearsal connection settings and fail on orphaned records. Local checks and findings are in the [test report](TEST_REPORT.md).

## Open work

- Build managed PostgreSQL tenant provisioning and credential lifecycle, private R2 storage, platform authentication and MFA, subscriptions and entitlement enforcement, and remaining business modules.
- Reconcile imports and concurrent payments, verify tenant isolation and encrypted restore with disposable databases, and finish the dedicated security and deployment workflows.
- Verify cloud integration after the account, zone, origin, and isolated services are available. Production deployment and paid resources require approval. No environment URL has been verified.

## Corrections from release QA

- Security CI builds the API before tests that import its compiled modules. The 58 mm template constrains payment and schedule tables and signature columns to the printable width.
- Invoice bytes are flushed before an invoice becomes ready. The download endpoint distinguishes generation in progress from an unavailable stored PDF. The LAN rehearsal checks a ready PDF and verifies it byte for byte after encrypted restore.
- PostgreSQL business roles can no longer delete invoice rows. The provisioner performs deletion after the tenant-trash sweep has validated retention, claimed the tenant, and requested invoice cleanup. The sweep waits for PostgreSQL confirmation before removing tenant records.
- Expired licenses allow sign-in, reads, and authorized export. Business mutations require renewal. Suspended and trashed businesses retain their existing access restrictions.
- Local validation passed all application builds and type checks, the API integration and security suites, and seven print formats in Edge and Chromium. The Docker rehearsal verified concurrent checkout, restart, encrypted backup, byte-identical PDF restore, runtime delete denial, and the privileged purge request. GitHub Actions and cloud deployment have yet to run on these changes.
