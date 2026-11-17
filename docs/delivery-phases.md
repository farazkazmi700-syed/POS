# KazmiOn delivery phases

Status: in progress. Existing uncommitted work is retained. No production cutover is authorized by this document.

1. Inspect existing routes, persistence, authorization, printing and verification tools; establish baseline checks.
2. Register trusted installed module manifests idempotently, show release states and submodules, enforce runtime availability, and preserve catalog records.
3. Standardize provisioning and entitlement defaults; expose Help and Backup availability with separately authorized export operations and Coming Soon AI registration.
4. Extend invoice layout settings and preview/PDF/browser printing with bounded paper dimensions and safe branding.
5. Strengthen installment decimal arithmetic, append-only payment posting, concurrency/idempotency and audit evidence.
6. Verify isolated restoration and print dimensions; record regression results and deployment gates.

## Database boundary

Current core services inject shared Mongoose models. An existing optional PostgreSQL invoice-state adapter routes that domain to independent business databases. Full database-per-tenant provisioning requires a separate routing, migration and rollback cutover across all core services and workers. It must not be represented as complete by creating empty databases or changing a URI. Existing business data stays in place until a reviewed migration and restore drill permit cutover.

## Release gates

No production deployment, destructive migration, existing-volume reset or business-data restore is part of local verification. Hardware printer testing requires the actual device and driver. SMTP acceptance tests do not prove external inbox delivery. Results below must come from executed checks, not older documentation.
