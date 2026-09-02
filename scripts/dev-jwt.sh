#!/usr/bin/env bash
# Mint a local-dev session JWT so an agent (or you) can hit any @metahunt/etl
# endpoint directly — curl, httpie, whatever — with no browser login round-trip.
#
# Signs the exact payload issueSession() signs (`sub`, `tid`, `roles`), using
# the same JWT_SECRET the local etl container reads from `.env`. That secret is
# a local placeholder, not Railway's — so this token verifies against the LOCAL
# API only and is worthless against prod. Nothing here creates a user or
# touches the database beyond one SELECT.
#
# Usage:
#   scripts/dev-jwt.sh                  # mint for the first ADMIN_TELEGRAM_IDS entry
#   scripts/dev-jwt.sh 123456789        # mint for a specific Telegram user id
#   scripts/dev-jwt.sh --print          # stdout only, don't touch .dev-admin.jwt
#
# Prereqs: local infra up (`pnpm docker:infra`) and that Telegram id has logged
# in at least once through the real flow — this never creates a user, only
# signs a token for one that already exists.

set -euo pipefail

CONTAINER="${CONTAINER:-metahunt-db}"
DB="${DB:-metahunt_railway}"
DB_USER="${DB_USER:-metahunt}"
ENV_FILE="${ENV_FILE:-.env}"

print_only=0
tid=""
for arg in "$@"; do
  case "$arg" in
    --print) print_only=1 ;;
    *) tid="$arg" ;;
  esac
done

[ -f "$ENV_FILE" ] || { echo "dev-jwt: $ENV_FILE not found" >&2; exit 1; }
jwt_secret="$(grep -m1 '^JWT_SECRET=' "$ENV_FILE" | cut -d= -f2-)"
[ -n "$jwt_secret" ] || { echo "dev-jwt: JWT_SECRET not set in $ENV_FILE" >&2; exit 1; }

if [ -z "$tid" ]; then
  tid="$(grep -m1 '^ADMIN_TELEGRAM_IDS=' "$ENV_FILE" | cut -d= -f2- | cut -d, -f1)"
  [ -n "$tid" ] || { echo "dev-jwt: no ADMIN_TELEGRAM_IDS in $ENV_FILE and no id given" >&2; exit 1; }
fi

docker ps --format '{{.Names}}' | grep -qx "$CONTAINER" \
  || { echo "dev-jwt: container '$CONTAINER' is not running (pnpm docker:infra)" >&2; exit 1; }

row="$(docker exec "$CONTAINER" psql -U "$DB_USER" -d "$DB" -Atc \
  "select u.id, u.roles from users u join auth_identities ai on ai.user_id = u.id
   where ai.provider = 'telegram' and ai.provider_user_id = '$tid';")"
[ -n "$row" ] || { echo "dev-jwt: no user for telegram id $tid — log in once first" >&2; exit 1; }

user_id="${row%%|*}"
roles_raw="${row#*|}"                                    # postgres array literal: {user,admin}
roles_json="[$(echo "${roles_raw:1:-1}" | sed -E 's/([a-z]+)/"\1"/g')]"

token="$(JWT_SECRET="$jwt_secret" SUB="$user_id" TID="$tid" ROLES="$roles_json" node -e '
  const crypto = require("crypto");
  const b64url = (buf) => Buffer.from(buf).toString("base64url");
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({
    sub: process.env.SUB,
    tid: process.env.TID,
    roles: JSON.parse(process.env.ROLES),
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
  }));
  const sig = crypto.createHmac("sha256", process.env.JWT_SECRET)
    .update(`${header}.${payload}`).digest("base64url");
  console.log(`${header}.${payload}.${sig}`);
')"

if [ "$print_only" -eq 1 ]; then
  printf '%s\n' "$token"
else
  printf '%s\n' "$token" > .dev-admin.jwt
  echo "Wrote .dev-admin.jwt (user $user_id, tid $tid, roles $roles_raw)" >&2
  echo "  curl -H \"Authorization: Bearer \$(cat .dev-admin.jwt)\" http://localhost:3333/me" >&2
fi
