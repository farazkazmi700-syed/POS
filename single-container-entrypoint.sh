#!/bin/sh
set -eu

mkdir -p /data/mongo /data/redis /data/postgres /data/invoices
chown mongodb:mongodb /data/mongo
chown redis:redis /data/redis
chown postgres:postgres /data/postgres
chown node:node /data/invoices

if [ ! -s /data/postgres/PG_VERSION ]; then
  su postgres -s /bin/sh -c '/usr/lib/postgresql/15/bin/initdb -D /data/postgres --auth-local=trust --auth-host=trust'
  su postgres -s /bin/sh -c '/usr/lib/postgresql/15/bin/pg_ctl -D /data/postgres -o "-c listen_addresses=127.0.0.1" -w start'
  su postgres -s /bin/sh -c '/usr/bin/createdb -U postgres pos'
  su postgres -s /bin/sh -c '/usr/lib/postgresql/15/bin/pg_ctl -D /data/postgres -m fast -w stop'
fi

exec /usr/bin/supervisord -n -c /etc/supervisor/supervisord.conf
