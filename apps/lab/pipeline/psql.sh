#!/usr/bin/env bash
# psql into the lab database — a full local restore of a prod dump that is safe
# to mutate. Never reaches prod: the guard below refuses any URL whose database
# name isn't the lab one.
#
#   pipeline/psql.sh -c "select count(*) from vacancies"
#   pipeline/psql.sh -f pipeline/01-audit.sql
#   pipeline/psql.sh                                   # interactive shell
#
# The lab reads LAB_DATABASE_URL and never DATABASE_URL. That separation is the
# point: every other command in this repo resolves its database from whichever
# `.env` sits in the working directory, so a `.env` written to satisfy the lab
# used to silently retarget the taxonomy CLI too (MET-133).
#
# Set it in the environment, or in apps/lab/.env (gitignored, lab-only):
#   LAB_DATABASE_URL=postgres://user:pass@localhost:5432/metahunt_lab
#
# Creating indexes and matviews here is fine — that is the point of a copy.
# See README.md for how the lab database is loaded.
set -euo pipefail

LAB_DB="${LAB_DB:-metahunt_lab}"
APP="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

url="${LAB_DATABASE_URL:-}"
if [ -z "$url" ] && [ -f "$APP/.env" ]; then
  url="$(grep -E '^LAB_DATABASE_URL=' "$APP/.env" | head -1 | cut -d= -f2- | tr -d '"'"'"'')"
fi

if [ -z "$url" ]; then
  echo "lab: LAB_DATABASE_URL is not set." >&2
  echo "     Export it, or put it in $APP/.env:" >&2
  echo "       LAB_DATABASE_URL=postgres://user:pass@localhost:5432/$LAB_DB" >&2
  exit 1
fi

# The guard. A lab query must never be able to hit prod or the dev database.
case "$url" in
  */"$LAB_DB"|*/"$LAB_DB"\?*) ;;
  *)
    echo "lab: refusing to run — LAB_DATABASE_URL does not target '$LAB_DB'." >&2
    echo "     (host/db: $(echo "$url" | sed -E 's#(://[^:]+:)[^@]+@#\1***@#'))" >&2
    exit 1 ;;
esac

# Long analytical scans are expected; the cap just stops a runaway cartesian join.
# Set via PGOPTIONS rather than `-c SET ...`: a -c statement prints its "SET"
# command tag to stdout, which corrupts any run whose stdout is a data artifact.
exec env PGOPTIONS="-c statement_timeout=${LAB_TIMEOUT:-300s}" psql "$url" \
  -v ON_ERROR_STOP=1 \
  "$@"
