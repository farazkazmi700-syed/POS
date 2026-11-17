# Staging reconciliation status

Date: 2026-11-15. Machine-readable results:
[staging-reconciliation.json](reports/staging-reconciliation.json).

- 16 source collections discovered.
- 519 documents captured and verified in the initial successful staging run.
- Four PostgreSQL staging databases: three business databases and one control plane.
- Each record's PostgreSQL BSON checksum matched its source checksum.
- Counts matched across routed destinations for every source collection.
- Routing, unknown ownership, recovery ownership and database-name validation tests
  passed (four tests). An additional live PostgreSQL test verifies raw BSON
  round trips for Decimal128, Int64, dates, binary, null and missing fields.

The earlier profile counted 517 documents. The source remained live and contained
519 when staging ran; the engine reads current source data rather than treating
the earlier count as an immutable manifest. This reinforces the need for a write
freeze or consistent backup during the final approved cutover.

## Not yet accepted

This is **lossless staging verification only**, not a completed runtime migration.
Normalized financial reconciliation, SQL foreign keys, application authentication,
authorization, concurrent sales, worker behavior, offline startup and backup/restore
validation have not passed against PostgreSQL. The API and PDF worker still use
MongoDB in the running deployment. The new PostgreSQL invoice adapter and worker
path now pass a local integration test with a real generated PDF, tenant isolation,
generation ordering, restricted permissions and API HTTP-503 error propagation.
This covers invoice metadata only. PostgreSQL-only production acceptance remains
pending for all other business domains.

## API baseline repair

The existing password recovery service's duplicate user-model declaration and
obsolete constructor fragment were removed. Missing 15-minute reset and 24-hour
enrollment constants now match the service's documented behavior; the owner-role
query uses the existing enum. API TypeScript checking passes after these repairs.
These changes do not switch the database provider or deploy the API.
