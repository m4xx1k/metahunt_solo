#!/usr/bin/env bash
# Restore a backup (from db-backup.sh) into the local Docker Postgres.
#
# Drops and recreates the target database so a plain pg_dump (no --clean)
# restores into a clean schema without CREATE conflicts.
#
# Usage:
#   ./scripts/db-restore.sh                       # restore latest backups/*.sql.gz
#   ./scripts/db-restore.sh backups/Postgres-XXXX.sql.gz
#
# Override target via env: CONTAINER, DB, DB_USER.

set -euo pipefail

CONTAINER="${CONTAINER:-metahunt-railway-db}"
DB="${DB:-metahunt_railway}"
DB_USER="${DB_USER:-metahunt}"

# Resolve backup file: explicit arg, or newest in backups/.
file="${1:-}"
if [ -z "$file" ]; then
  file="$(ls -t backups/*.sql.gz 2>/dev/null | head -1 || true)"
  [ -n "$file" ] || { echo "no backup found in backups/; pass one explicitly" >&2; exit 1; }
fi
[ -f "$file" ] || { echo "file not found: $file" >&2; exit 1; }

docker ps --format '{{.Names}}' | grep -qx "$CONTAINER" \
  || { echo "container '$CONTAINER' is not running" >&2; exit 1; }

# Decompress .gz, stream plain .sql as-is.
decompress() { case "$file" in *.gz) gzip -dc "$file";; *) cat "$file";; esac; }

echo "Restoring $file -> $CONTAINER:$DB (user $DB_USER)" >&2
read -rp "This DROPS database '$DB'. Continue? [y/N] " ans
[ "$ans" = "y" ] || [ "$ans" = "Y" ] || { echo "aborted" >&2; exit 1; }

# FORCE terminates existing connections (Postgres 13+).
docker exec "$CONTAINER" psql -U "$DB_USER" -d postgres -v ON_ERROR_STOP=1 \
  -c "DROP DATABASE IF EXISTS \"$DB\" WITH (FORCE);" \
  -c "CREATE DATABASE \"$DB\" OWNER \"$DB_USER\";"

decompress | docker exec -i "$CONTAINER" \
  psql -U "$DB_USER" -d "$DB" -v ON_ERROR_STOP=1 --quiet

echo "Done. Tables:" >&2
docker exec "$CONTAINER" psql -U "$DB_USER" -d "$DB" -At \
  -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';"
