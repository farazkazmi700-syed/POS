#!/bin/sh
# Container health: web page, API health endpoint and internal PostgreSQL readiness.
set -u
curl --fail --silent --show-error http://127.0.0.1/health >/dev/null || exit 1
curl --fail --silent --show-error http://127.0.0.1/ >/dev/null       || exit 1
pg_isready -h 127.0.0.1 -p 5432 -q || exit 1
exit 0
