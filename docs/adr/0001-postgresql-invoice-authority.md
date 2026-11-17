# ADR 0001: Move invoice state to PostgreSQL before other business domains

Status: implemented in code and local preparation; production activation pending.

The user prefers complete MongoDB replacement, but permits a hybrid installation
with PostgreSQL priority while full replacement is incomplete. Existing sales,
inventory and authentication use Mongoose and cannot safely change by replacing
only a connection string. Invoice status is a separable shared API/worker concern.

Use a dedicated PostgreSQL database per business for invoice state, accessed by a
shared package with explicit trusted routing. API authorization remains in the
existing tenant-scoped order queries. PostgreSQL is the sole authority for this
domain once configured; MongoDB remains authoritative for other business domains.
Do not introduce competing synchronous writes or automatic fallback on SQL errors.

Generation tokens protect regeneration against stale worker callbacks. Migration
initialization may insert missing invoice rows but cannot replace existing SQL
state. Existing PDFs retain their paths; new generation paths are independent.

Consequences: operations temporarily require both database systems; new businesses
require explicit SQL provisioning, and rollback must reconcile post-switch invoice
state. This is an incremental boundary, not completion of the normalized financial
database migration. See ../migration/09-hybrid-invoices.md for activation gates.
