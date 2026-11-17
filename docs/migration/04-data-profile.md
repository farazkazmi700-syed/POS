# Initial live data profile

Read-only discovery ran on 2026-11-15 against the existing local Compose MongoDB.
The exact timestamp, counts, observed top-level BSON types, index metadata and
relationship results are in [data-profile.json](reports/data-profile.json).

The server exposes `admin`, `config`, `local` and `pos`. System databases are not
business migration targets. `pos` is the only application database discovered.

| Collection | Documents |
| --- | ---: |
| adminaudits | 45 |
| auditevents | 413 |
| branches | 0 |
| checkoutrequests | 6 |
| customers | 4 |
| installmentplans | 5 |
| installmentproducts | 0 |
| installmentsales | 0 |
| invoicecounters | 2 |
| orders | 23 |
| products | 9 |
| recoverychallenges | 0 |
| stockadjustments | 0 |
| subscriptionplans | 2 |
| tenants | 3 |
| users | 5 |

The three tenant records are source identities, not automatically three client
installations. Explicit mapping must distinguish business ownership and any
platform account tenant before distribution. No source tenant is discarded.

## Repeat discovery (PowerShell, repository root)

```powershell
Get-Content scripts/migration/profile-mongodb.js -Raw |
  docker compose exec -T mongo mongosh --quiet --file /dev/stdin
```

The script does not load Mongoose models or trigger index creation. It performs
database/collection listing, counts, index reads and aggregation without `$out`
or `$merge`. It emits no document values, hashes, credentials or customer samples.
Aggregation operations have a 60-second time limit. Run with a database account
limited to read/metadata permissions when the installation has authentication.

This is an initial live profile, not a consistent backup. Concurrent writes can
change counts between operations. The report is not sufficient evidence for
cutover. Nested array schemas, exact monetary values, duplicate business keys,
special BSON values inside nested fields and file integrity still require
dedicated profiling. No source-to-target reconciliation has occurred.
