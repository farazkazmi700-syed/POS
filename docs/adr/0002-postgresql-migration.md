# ADR 0002: Migrate Primary Data Store from MongoDB to PostgreSQL

**Status:** Proposed  
**Date:** 2026-11-17  
**Deciders:** Principal Software Architect, Senior Full-Stack Engineer, DevOps Lead, Cybersecurity Engineer, Senior SaaS Product Engineer

## Context

The KazmiOn POS currently uses MongoDB as its primary operational database via Mongoose. The project objective requires PostgreSQL as the target operational database to support:
- Per-client independent databases (tenancy design)
- Referential integrity and foreign key constraints
- ACID transactions for inventory and payments
- NUMERIC/DECIMAL for money (no floating point)
- Row-level security for tenant isolation
- Offline-capable local client databases

## Decision

Migrate the primary data store from MongoDB to PostgreSQL 16 (pinned version). The API will transition from Mongoose to a PostgreSQL client (Drizzle ORM or `pg`) with migration tooling. MongoDB remains available during a dual-write transition period and is never deleted automatically.

## Alternatives Considered

| Option | Pros | Cons |
|--------|------|------|
| **PostgreSQL (chosen)** | ACID, referential integrity, RLS, NUMERIC money, per-tenant databases | Requires schema design, migration ETL, team learning curve |
| MongoDB (status quo) | No migration needed, flexible schema | No referential integrity, no RLS, no per-tenant DB pattern, floating-point risk |
| Hybrid (Mongo + PostgreSQL) | Gradual migration, lower risk | Dual-write complexity, eventual consistency, two operational databases |
| DocumentDB / CosmosDB | MongoDB-compatible, managed | Vendor lock-in, cost, doesn't solve relational requirements |

## Consequences

### Positive
- Strong data consistency for financial transactions
- Row-level security enforces tenant boundaries at the database level
- Per-client database independence for offline operation
- NUMERIC type eliminates floating-point money errors
- Standard SQL tooling for backups, reporting, analytics

### Negative
- Migration effort and risk (ETL, validation, rollback)
- Schema rigidity vs MongoDB flexibility (mitigated with JSONB for dynamic attributes)
- Two databases during transition (operational complexity)
- Need to rewrite Mongoose-based repository code

### Risks (Mitigation)
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Data loss during migration | Medium | Critical | Backups before every step, idempotent ETL, rollback plan |
| Schema mismatch causing app errors | High | High | Parallel run, feature flags, comprehensive tests |
| Performance regression | Medium | Medium | Connection pooling, indexes, query optimization |
| Team unfamiliarity with PostgreSQL | Medium | Medium | Documentation, training, ADRs |

## Related
- ADR 0001: PostgreSQL invoice authority (hybrid, already implemented in code)
- Docs: `docs/migration/09-hybrid-invoices.md`