# Documentation

## Architecture and repository

- [Project structure and placement conventions](project-structure.md)
- [Data model](erd.md)
- [API specification](api-spec.yaml)
- [Module registration](module-registration.md)
- [Specification implementation](specification-implementation.md)
- [PostgreSQL invoice architecture decision](adr/0001-postgresql-invoice-authority.md)

## Features and operations

- [Account recovery](account-recovery.md)
- [Backup and production validation](backup-and-production-validation.md)
- [Barcode module](barcode-module.md)
- [Design system](design-system.md)
- [Installment pricing](installment-pricing.md)

## Database migration

- [Repository audit](migration/01-repository-audit.md)
- [MongoDB inventory](migration/02-mongodb-inventory.md)
- [Dependency map](migration/03-dependency-map.md)
- [Data profile](migration/04-data-profile.md)
- [Data quality findings](migration/05-data-quality-report.md)
- [ETL guide](migration/07-etl-guide.md)
- [Reconciliation status](migration/08-reconciliation-report.md)
- [Hybrid invoice setup and activation](migration/09-hybrid-invoices.md)

Machine-readable evidence lives in `migration/reports/`. Runtime secrets and
business files belong in ignored `storage/`; generated screenshots, test PDFs and
traces belong in ignored `qa/artifacts/`.
