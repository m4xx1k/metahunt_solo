#!/usr/bin/env bash
# Print the PROD (Railway) Postgres connection URL to stdout — and nothing else.
#
# This is a credential PROVIDER, not a tool. Inject it into any CLI that reads
# DATABASE_URL to run that CLI against prod, without ever storing the secret:
#
#   DATABASE_URL=$(scripts/prod-db-url.sh) pnpm dedup:resolve
#   DATABASE_URL=$(scripts/prod-db-url.sh) pnpm classify-skills
#   DATABASE_URL=$(scripts/prod-db-url.sh) psql            # ad-hoc recheck
#
# The URL is fetched fresh from the Railway service env on every call and only
# lives in that one command's environment — nothing lands in the repo, shell
# history, or a file. An injected DATABASE_URL wins over .env (Node's --env-file
# and dotenv both defer to vars already set in the environment).
#
# Prereqs: `railway login` once + `railway link` to the project.
# Override the DB service name with PG_SERVICE=... (defaults to "Postgres").
set -euo pipefail

PG_SERVICE="${PG_SERVICE:-Postgres}"

command -v railway >/dev/null || {
  echo "prod-db-url: railway CLI not found (npm i -g @railway/cli)" >&2
  exit 1
}

# *.railway.internal isn't resolvable from a laptop, so we need the public proxy
# URL (DATABASE_PUBLIC_URL). railway sends its own chatter to stderr; tail -n1
# guards against any trailing line on stdout.
url="$(railway run --service "$PG_SERVICE" -- printenv DATABASE_PUBLIC_URL \
        | tail -n1 | tr -d '[:space:]')"

case "$url" in
  postgres*://*) printf '%s\n' "$url" ;;
  *)
    echo "prod-db-url: could not resolve DATABASE_PUBLIC_URL from service '$PG_SERVICE'" >&2
    echo "  (is railway linked? try: railway status)" >&2
    exit 1
    ;;
esac
