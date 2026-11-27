# V2 database boundaries

Use separate platform and business databases. The platform stores tenant registration, subscription state and an opaque reference to each tenant's credentials. The business connection authenticates with a role that can connect only to its own database. The request's authenticated tenant ID selects that connection. A provisioning identity performs schema and role administration outside the web request path. Ordinary API and queue workers must have no provisioning privileges.

The V1 image has a document-compatible PostgreSQL gateway and per-business invoice databases. The SQL under `deploy/database/postgresql/migrations` is also used by existing migration and rehearsal tooling. Verify each target schema against the active write paths before enabling its use. PostgreSQL row-level security inside one database can reinforce access boundaries, but the V2 target still requires separate tenant databases and credentials.

Before enabling onboarding, test provisioning retries, connection pool limits and credential rotation, migration compatibility, failed provisioning cleanup, and attempted cross-database connections using two disposable tenant databases. Managed database connection and secret storage settings are environment-specific and remain open.

The local PostgreSQL provisioner revokes direct invoice deletion from existing business roles at startup. The permanent tenant-trash flow requests privileged deletion after the retention window and records completion in the business database. Standalone PostgreSQL registries require an equivalent privileged cleanup operator before the API can finalize tenant purges.
