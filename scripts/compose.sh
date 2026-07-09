#!/usr/bin/env bash
set -euo pipefail

# Thin wrapper around `docker compose` for the dev stack. The infra Postgres,
# the Temporal server (POSTGRES_PWD) and the etl container's rebuilt DATABASE_URL
# all need the DB password as a standalone var for interpolation. Rather than
# duplicate the secret, derive POSTGRES_PASSWORD from the single source of truth
# (DATABASE_URL in .env) unless it's already exported. Assumes the password is
# URL-safe; export POSTGRES_PASSWORD yourself if it isn't.
if [ -z "${POSTGRES_PASSWORD:-}" ] && [ -f .env ]; then
  derived="$(sed -nE 's#^DATABASE_URL=postgres(ql)?://[^:]+:([^@]+)@.*#\2#p' .env | head -1)"
  [ -n "$derived" ] && export POSTGRES_PASSWORD="$derived"
fi

exec docker compose "$@"
