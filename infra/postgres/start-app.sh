#!/bin/sh
set -eu
export MONGO_URI="$(cat /run/pos/app-uri)"
until nc -z 127.0.0.1 27017 && nc -z 127.0.0.1 6379; do sleep 1; done
exec node "$1"
