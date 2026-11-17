# MongoDB migration: repository audit

Date: 2026-11-15. Scope: current working tree, including uncommitted application
work. This is a discovery report, not approval for production cutover.

## Existing architecture

- API: TypeScript, NestJS, Mongoose, MongoDB. `apps/api/src/app.module.ts`
  creates one connection from `MONGO_URI`. Modules inject concrete Mongoose
  models; there is no interchangeable database repository layer.
- Web: React, Vite, TypeScript, React Query and Zustand. API identifiers and
  response shapes must remain compatible during the database transition.
- Worker: BullMQ/Redis plus the native MongoDB driver. `worker.ts` opens `orders`;
  `queue/invoice.processor.ts` updates invoice status using an ObjectId.
- Python analytics and chatbot applications are future-service stubs.
- Docker Compose runs MongoDB 7, Redis, API, PDF worker and web. Named volumes
  hold MongoDB, Redis and invoice files. Production overlay removes database
  host ports. Existing containers were running during discovery.
- Application and platform data currently share the `pos` database. A tenant
  filter and branch context isolate logical businesses; there are no per-business
  database credentials or installation database registry yet.

## Boundaries that must change together

1. Authentication currently looks up globally unique email addresses and users
   in the shared database. JWT validation reloads users and checks session/PIN
   versions. A trusted installation-local business directory is needed before
   tenant-local authentication; a caller-supplied database name is not acceptable.
2. Business creation creates tenant and owner records through the existing shared
   models. Provisioning must become an explicit, restartable operation. Starting
   an API process must never provision another database.
3. `common/branch-scope.ts` injects branch filters into Mongoose operations using
   AsyncLocalStorage. Legacy missing/null branch IDs belong to a default branch.
   SQL repositories must reproduce this explicitly.
4. Order creation conditionally decrements stock, increments invoice counters,
   inserts orders and installment plans, and compensates on errors. It does not
   use a multi-document MongoDB transaction. PostgreSQL must wrap these changes
   in one transaction, with durable post-commit PDF dispatch.
5. Checkout and stock adjustment idempotency records, payment receipt identities,
   stock-restoration markers and refund snapshots are migration data, not caches.
6. Reporting uses aggregation, date bucketing and configured report timezone.
   Preserve date-only installment due dates separately from timestamp instants.
7. The PDF worker currently updates by order ID in a single shared collection.
   Jobs need an authenticated installation/business resolution path after the
   split; existing queued jobs and stored PDF paths must be accounted for.
8. Developer backup exports deliberately remove credentials and omit Redis and
   external files. They cannot serve as a lossless migration source or rollback
   backup. Use verified database and file backups before cutover.

## Authentication and financial preservation

Preserve bcrypt/Argon2 hashes as opaque values, together with roles, permissions,
session versions, lockouts and recovery state. Do not copy business passwords to
the developer server. Existing password recovery code has compile errors from
before migration work; a green backend baseline remains a prerequisite.

Source monetary fields are JavaScript/Mongoose numbers. Target NUMERIC precision
and conversion rules must be based on observed values and business rounding,
with exact-decimal reconciliation. Do not silently round historical values to
two places. Quantities may be fractional. Existing invoice/customer snapshots
must survive normalization even when current product/customer data changes.

## Confirmed user decisions

- Existing businesses will be distributed across different client PCs.
- Each business gets its own local PostgreSQL database.
- The developer control plane is separate from business databases.
- Offline sales continue when a cached license expires; administrators see a
  renewal notice. No online developer-server dependency may gate ordinary sales.
- The business-to-client-PC mapping and control-plane host are still required.

## Status and risks

Repository dependency discovery is recorded in reports 02 and 03. Live initial
profiling is recorded in reports 04 and 05. Full nested-field, financial and
cross-installation discovery is not yet complete. No PostgreSQL runtime switch,
schema deployment, data migration or source deletion has been performed.

Do not remove MongoDB volumes or dependencies. Before cutover: complete the
destination mapping, profile every nested financial field, resolve anomalies,
prove backup restoration, implement and test the SQL backend and ETL, freeze
source writes for a consistent final snapshot, reconcile, then obtain explicit
production-cutover approval. Rollback must account for post-cutover sales.
