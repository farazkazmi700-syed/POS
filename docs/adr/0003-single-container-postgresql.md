# PostgreSQL storage for the single-container POS

The single-container image uses PostgreSQL 17 with the DocumentDB extension. FerretDB translates the existing API and PDF worker's document queries to PostgreSQL. Account provisioning, sign-in, products, orders, counters, and recovery records share that path. This preserves existing public ObjectIds and BSON types. The application continues to enforce business and branch access. Redis handles queues and nginx serves the web app.

This deployment stores business documents in extension-managed PostgreSQL tables. The earlier normalized SQL ETL and per-business invoice databases are separate deployment designs. Native SQL foreign keys and separate physical business databases would require additional application changes. Direct new SQL queries must use an explicitly tenant-scoped repository.

## Existing installations

Keep the current image, database, invoice files and Redis volume available until acceptance. Build the new image with `docker compose -f docker-compose.single.yml build`. Start a candidate with POS_SERVE=false and a separate PostgreSQL volume, Redis volume and invoice directory. This starts the database and gateway before the API can initialize default records. For a source created by the original single-container launcher, run the following against the two *distinct* container names.

```sh
node scripts/migration/copy-single-container.cjs <running-source> <postgres-candidate>
```

The copier reads the source database configured in its container and writes through the candidate's loopback gateway. It preserves ObjectIds and verifies typed field values and collection counts. An existing record must match. It never removes source or destination records. Repeat against a quiescent source for cutover. Stop application writes and drain invoice jobs before the final verification. Review additional historical databases separately before merging overlapping identities.

Persist the complete PostgreSQL data volume, including its generated service credentials, plus invoice files. Capture a consistent stopped-volume backup or a PostgreSQL physical base backup with matching extension versions. Test restoration in an isolated instance. A rollback after new writes requires reconciling those writes before switching clients back.

The database, gateway and Redis bind to loopback. Ports 80 and 3000 are the web and API entry points. POS users are application accounts, distinct from the internal PostgreSQL service role.
