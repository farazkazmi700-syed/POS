#!/bin/sh
(
set -eu

set -- -c 'CREATE TABLE IF NOT EXISTS pos_sql_migrations (
  filename TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
)'
for migration in /opt/pos/sql-migrations/*.sql; do
  filename=${migration##*/}
  case "$filename" in
    *[!a-zA-Z0-9_.-]*) echo 'Invalid PostgreSQL migration filename' >&2; exit 1 ;;
  esac
  set -- "$@" -f "$migration" -c "INSERT INTO pos_sql_migrations (filename) VALUES ('$filename')"
done

psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --no-psqlrc --single-transaction --set ON_ERROR_STOP=1 "$@"
)
