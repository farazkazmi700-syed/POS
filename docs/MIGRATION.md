# V1 to V2 migration

Start with an encrypted backup and a restored copy in an isolated environment. Preserve the source database and its identifiers. Use the existing profiling and staging utilities under `deploy/scripts/migration` with the copy. The migration reports in this repository describe earlier rehearsals and do not establish acceptance for a cloud database or a customer's records.

Install the locked tooling with `npm ci --prefix deploy/scripts/migration`. The `npm run db:validate` command requires explicit `MONGO_URI` and `POSTGRES_URL` values for the rehearsal databases. It fails on count and sampled total mismatches or orphaned records. This legacy comparison reports selected checks. Complete the per-tenant ledger and payment reconciliation below before cutover.

Record source and destination totals by tenant and branch for stock, sales, installment principal and payments, balances, and invoice references. Reject unexpected differences and investigate duplicate source IDs before retrying an import. Rehearse a second import of the same snapshot to prove idempotence. Keep live sync disabled. A future transactional outbox needs versioned events and explicit conflict handling for financial records.

Cutover requires a validated restore, a controlled write stop, an approved reconciliation report, and a documented return to the intact V1 system. Reverting application artifacts alone cannot reconcile transactions accepted after cutover.
