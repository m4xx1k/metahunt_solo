#!/usr/bin/env bash
# psql into the data-lab database — a full local restore of prod that is safe to
# mutate. Never reaches prod: the guard below refuses any DATABASE_URL whose
# database name isn't the lab one.
#
#   analytics/lab.sh -c "select count(*) from vacancies"
#   analytics/lab.sh -f analytics/experiments/001-skill-frequency/query.sql
#   analytics/lab.sh                                  # interactive shell
#
# EXPLAIN and index/matview creation are fine here — that's the point of a copy.
set -euo pipefail

LAB_DB="${LAB_DB:-metahunt_lab}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

[ -f "$ROOT/.env" ] || { echo "lab: $ROOT/.env missing" >&2; exit 1; }
url="$(grep -E '^DATABASE_URL=' "$ROOT/.env" | head -1 | cut -d= -f2- | tr -d '"'"'"'')"

# The guard. A lab query must never be able to hit prod or the dev database.
case "$url" in
  */"$LAB_DB"|*/"$LAB_DB"\?*) ;;
  *)
    echo "lab: refusing to run — DATABASE_URL does not target '$LAB_DB'." >&2
    echo "     (host/db: $(echo "$url" | sed -E 's#(://[^:]+:)[^@]+@#\1***@#'))" >&2
    exit 1 ;;
esac

# Long analytical scans are expected; the cap just stops a runaway cartesian join.
exec psql "$url" \
  -v ON_ERROR_STOP=1 \
  -c "SET statement_timeout = '${LAB_TIMEOUT:-300s}'" \
  "$@"
