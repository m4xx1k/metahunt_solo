#!/usr/bin/env bash
# psql into the lab database — a full local restore of a prod dump that is safe
# to mutate. Never reaches prod: the guard below refuses any DATABASE_URL whose
# database name isn't the lab one.
#
#   pipeline/psql.sh -c "select count(*) from vacancies"
#   pipeline/psql.sh -f pipeline/01-audit.sql
#   pipeline/psql.sh                                   # interactive shell
#
# Creating indexes and matviews here is fine — that is the point of a copy.
# See pipeline/README.md for how the lab database is loaded.
set -euo pipefail

LAB_DB="${LAB_DB:-metahunt_lab}"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

[ -f "$REPO/.env" ] || { echo "lab: $REPO/.env missing" >&2; exit 1; }
url="$(grep -E '^DATABASE_URL=' "$REPO/.env" | head -1 | cut -d= -f2- | tr -d '"'"'"'')"

# The guard. A lab query must never be able to hit prod or the dev database.
case "$url" in
  */"$LAB_DB"|*/"$LAB_DB"\?*) ;;
  *)
    echo "lab: refusing to run — DATABASE_URL does not target '$LAB_DB'." >&2
    echo "     (host/db: $(echo "$url" | sed -E 's#(://[^:]+:)[^@]+@#\1***@#'))" >&2
    exit 1 ;;
esac

# Long analytical scans are expected; the cap just stops a runaway cartesian join.
# Set via PGOPTIONS rather than `-c SET ...`: a -c statement prints its "SET"
# command tag to stdout, which corrupts any run whose stdout is a data artifact.
exec env PGOPTIONS="-c statement_timeout=${LAB_TIMEOUT:-300s}" psql "$url" \
  -v ON_ERROR_STOP=1 \
  "$@"
