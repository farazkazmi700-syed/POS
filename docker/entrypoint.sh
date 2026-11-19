#!/bin/sh
set -eu
umask 077
store=/var/lib/postgresql/data
install -d -o postgres -g postgres -m 0700 "$store/secrets"
queue=/data/redis/pos-redis7
if [ ! -d "$queue" ]; then
  staging=$(mktemp -d /data/redis/.redis-upgrade.XXXXXX)
  if [ -s /data/redis/appendonly.aof ]; then
    cp /data/redis/appendonly.aof "$staging/"
  elif [ -d /data/redis/appendonlydir ]; then
    cp -R /data/redis/appendonlydir "$staging/"
  elif [ -s /data/redis/dump.rdb ]; then
    cp /data/redis/dump.rdb "$staging/"
  fi
  chown -R redis:redis "$staging"
  mv "$staging" "$queue"
fi
install -d -o node -g node /data/invoices
install -d -o node -g node -m 0700 /home/node
install -d -m 0755 /run/pos
install -d -o ferret -g ferret -m 0700 /run/pos/gateway
for role in postgres pos_app; do
  file="$store/secrets/$role"
  if [ ! -s "$file" ]; then
    if [ -s "$PGDATA/PG_VERSION" ]; then
      echo "Existing cluster is missing its $role credential" >&2
      exit 1
    fi
    node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))" > "$file.tmp"
    chown postgres:postgres "$file.tmp"
    mv "$file.tmp" "$file"
  fi
done
# pg_cron and DocumentDB open internal libpq connections under the server OS account.
for role in postgres pos_app; do
  printf '*:5432:*:%s:%s\n' "$role" "$(cat "$store/secrets/$role")"
done > /var/lib/postgresql/.pgpass
chown postgres:postgres /var/lib/postgresql/.pgpass
export POSTGRES_USER=postgres POSTGRES_DB=postgres POSTGRES_PASSWORD_FILE="$store/secrets/postgres"
export POSTGRES_INITDB_ARGS="--auth-host=scram-sha-256 --auth-local=peer"
printf 'postgres://postgres:%s@127.0.0.1:5432/postgres' "$(cat "$POSTGRES_PASSWORD_FILE")" > /run/pos/gateway-uri
chown ferret:ferret /run/pos/gateway-uri
printf 'mongodb://pos_app:%s@127.0.0.1:27017/pos?authMechanism=SCRAM-SHA-256&authSource=admin&retryWrites=false' "$(cat "$store/secrets/pos_app")" > /run/pos/app-uri
chown node:node /run/pos/app-uri
install -d -o postgres -g node -m 2750 /run/pos/businesses
rm -f /run/pos/businesses/ready
umask 022
export POS_SERVE="${POS_SERVE:-true}"
exec /usr/bin/supervisord -n -c /etc/supervisor/supervisord.conf
