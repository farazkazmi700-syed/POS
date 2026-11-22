#!/bin/sh
set -eu
export POS_APP_PASSWORD="$(cat /var/lib/postgresql/data/secrets/pos_app)"
psql -v ON_ERROR_STOP=1 --username postgres --dbname postgres <<'SQL'
\getenv app_password POS_APP_PASSWORD
CREATE ROLE pos_app LOGIN PASSWORD :'app_password';
SQL
