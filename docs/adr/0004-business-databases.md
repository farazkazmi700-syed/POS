# Physical business databases, first deployment stage

Each business has a separate PostgreSQL database in the existing cluster. Invoice status, PDF references and generation tokens are authoritative in that database. Tenant metadata, credentials, sale line items, stock, installments and other operational records still use the shared DocumentDB store. Invoice PDF bytes use the existing tenant-specific file paths.

The supervised provisioner connects locally using the postgres operating-system identity. It polls committed tenant metadata, reserves the tenant ID in kazmion_control.business_databases, creates a dedicated login and database, applies the invoice schema and checks the stored business identity. Database creation is outside a SQL transaction. A persistent reservation allows startup to retry interrupted provisioning. The API waits for an atomically published route before returning from business creation. Failed account provisioning can leave a reserved database for operator review. The provisioner never drops a business database.

Tenant logins have CONNECT on their own database, read access to its identity and read/write invoice state. The host authentication file also restricts these logins to their matching database. The API and worker load routes from a postgres-owned directory. Only the provisioner has administrative access. The POS API remains responsible for authorizing users and selecting their tenant from the authenticated session.

## Operations

Run scripts/backup.ps1 for a management dump, invoice files and a separate invoice-state CSV per business. For a single export use scripts/business-backup.ps1 -BusinessId <id> -Directory <new-directory>. Use the same arguments with -Restore to import into a provisioned business with an empty invoice table. A failed import rolls back. For a coordinated recovery, pause writes and workers while taking the backups, preserve the management metadata and restore the matching PDF files. The business CSV covers invoice metadata only.

Retain the pre-upgrade management backup and previous image. After new invoices are issued, reconcile the per-business invoice status, generation and file paths before reverting to a shared-store image. Drain queued invoice jobs before changing invoice modes. Keep database volumes through rollback.

