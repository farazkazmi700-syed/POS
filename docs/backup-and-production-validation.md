# Backup and production validation

The developer Backup tab produces a ZIP with JSON records, README and a SHA-256 manifest. Download fetches fresh data rather than reusing the preview. It includes tenants, sanitized accounts, subscription plans, modules, full platform audit records, branches, products, customers, orders, invoice counters, installment plans/products/sales, stock adjustments and business audit events. Access remains developer-only; responses disable HTTP caching.

Offline mode (default BACKUP_MODE=offline) enables local ZIP download. The local API must remain running; a disconnected cloud client cannot access server records. Cloud mode (BACKUP_MODE=cloud) also enables user-triggered email and Drive delivery after configuration. No scheduled delivery is implemented.

Email uses SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASSWORD, optional SMTP_FROM and BACKUP_EMAIL_TO. Gmail requires suitable SMTP credentials, such as an app password; other SMTP providers also work. TLS is required. Drive uses BACKUP_DRIVE_CLIENT_ID, BACKUP_DRIVE_CLIENT_SECRET, BACKUP_DRIVE_REFRESH_TOKEN and BACKUP_DRIVE_FOLDER_ID. Provision OAuth consent with permission to create files in that folder and keep secrets only in server environment/secret storage. Pass these environment variables into the API container when using Docker. Direct delivery limits are 15 MiB for email and 5 MiB for Drive; larger archives use manual ZIP upload. Provider failures are not retried automatically because acceptance may be ambiguous. Email success means accepted by SMTP, not confirmed inbox delivery. Each API process permits one delivery at a time; multi-replica scheduling/deduplication requires a durable job queue.

Drive multipart protocol: https://developers.google.com/workspace/drive/api/guides/manage-uploads

## Recovery limits

This is a logical export, not a consistent point-in-time snapshot. Credentials, authentication challenges, sessions, Redis jobs and external files are excluded. No automated restore is implemented. Retain native MongoDB backups and file-storage backups, test restores into an isolated environment and arrange account recovery before migration. Export currently materializes records in API/browser memory; high-volume installations need a streaming background export with encrypted storage before relying on this workflow at scale.

## Verification

Run API Jest tests, the root build, PDF renderer tests, qa/api-integration.cjs (isolated MongoDB/Redis), and the Playwright suite. Browser checks independently decode CODE128, CODE39, EAN13, EAN8, UPC-A, QR, Data Matrix, PDF417 and Aztec fixtures. They exercise camera stream cleanup, denied camera permission, keyboard scan entry, POS additions and ZIP integrity. This does not certify every barcode symbology or physical camera/USB scanner. Codes must be registered product identifiers, currently 1-80 printable ASCII characters. Confirm the deployment's actual scanner hardware and HTTPS camera behavior before release.
