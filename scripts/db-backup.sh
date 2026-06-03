#!/usr/bin/env bash
# Dump the Railway Postgres database to a local gzipped .sql file.
#
# Uses `railway run` to inject the DB service's variables into the local env,
# then runs pg_dump locally against the public TCP proxy (DATABASE_PUBLIC_URL).
# pg_dump must be installed locally and ideally match the server major version.
#
# Usage:
#   ./scripts/db-backup.sh                 # service defaults to "Postgres"
#   PG_SERVICE="my-db" ./scripts/db-backup.sh
#   ./scripts/db-backup.sh my-db           # service as first arg
#
# Prereqs: `railway login` once, and `railway link` to the right project.

set -euo pipefail

PG_SERVICE="${1:-${PG_SERVICE:-Postgres}}"
OUT_DIR="${OUT_DIR:-backups}"

command -v railway >/dev/null || { echo "railway CLI not found: npm i -g @railway/cli" >&2; exit 1; }
command -v pg_dump >/dev/null || { echo "pg_dump not found: install postgresql-client" >&2; exit 1; }

mkdir -p "$OUT_DIR"
stamp="$(( $(date +%s%N) / 1000000 ))"   # epoch ms, like Date.now()
out="$OUT_DIR/${PG_SERVICE}-${stamp}.sql.gz"

echo "Dumping service '$PG_SERVICE' -> $out" >&2

# DATABASE_PUBLIC_URL is the externally reachable proxy connection string;
# the internal DATABASE_URL (*.railway.internal) is not resolvable locally.
railway run --service "$PG_SERVICE" -- \
  bash -c 'pg_dump --no-owner --no-privileges "${DATABASE_PUBLIC_URL:?DATABASE_PUBLIC_URL not set on this service}"' \
  | gzip > "$out"

# Guard against a corrupt/empty dump (e.g. auth or proxy failure mid-stream).
if [ ! -s "$out" ] || [ "$(gzip -dc "$out" | head -c 1 | wc -c)" -eq 0 ]; then
  echo "Backup failed: $out is empty" >&2
  rm -f "$out"
  exit 1
fi

echo "Done: $out ($(du -h "$out" | cut -f1))" >&2
