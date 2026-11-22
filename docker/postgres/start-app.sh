#!/bin/sh
set -eu
export MONGO_URI="$(cat /run/pos/app-uri)"
until pg_isready -q -h 127.0.0.1 && nc -z 127.0.0.1 27017 && nc -z 127.0.0.1 6379; do sleep 1; done
if [ -n "$BUSINESS_DB_DIRECTORY" ]; then
  until [ -f "$BUSINESS_DB_DIRECTORY/ready" ]; do sleep 1; done
fi
exec node "$1"
