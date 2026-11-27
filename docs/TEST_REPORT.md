# V2 local verification

| Check | Result |
| --- | --- |
| Locked installs | Root, React, NestJS, PDF worker and migration tooling installed |
| `npm run build` and `npm run typecheck` | All three applications passed |
| API and PDF unit suites | 93 API and 9 PDF tests passed |
| `npm run test:integration` | 63 checks passed across the core API, branches and backup suites. Covered tenant boundaries, concurrent checkout, stock, recovery, and API cache headers. |
| `npm run test:security` | 12 checks passed, including four edge checks plus existing tenant deletion safeguards and backup delivery checks |
| `npm audit --audit-level=high` | No high or critical advisories across the five lockfiles. The API audit reported 20 moderate entries. |
| Wrangler 4.168.0 dry runs | Staging and production bundles and assets validated without credentials |
| Local Wrangler runtime | SPA navigation and security headers passed. API requests returned a non-cacheable 502 when the origin was absent. |
| Local Docker image and browser smoke tests | Image built. Both tests passed for sign-in, API health and cache headers, and configured recovery channels. |
| PostgreSQL rehearsal | BSON precision and populated migration, rollback, exports and outbox checks passed against an isolated local PostgreSQL instance |

Full cloud tenant isolation, payment reconciliation under network failure, private R2, cloud restore, secret scanning, static security analysis, GitHub-hosted workflow execution and staged HTTPS deployment remain open. The local PostgreSQL rehearsal is limited to fixtures and the existing SQL migration path.
