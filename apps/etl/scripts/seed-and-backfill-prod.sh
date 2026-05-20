#!/usr/bin/env bash
# Seed taxonomy + backfill silver vacancies on prod.
#
# Usage:
#   bash apps/etl/scripts/seed-and-backfill-prod.sh
#
# Isolation:
#   DATABASE_URL is exported inline only on the seed subprocess. When the
#   script exits, your parent shell never sees prod creds. Re-run any
#   time — both seed and backfill are idempotent.
#
# Requires:
#   * `railway` CLI logged in + project `intelligent-harmony` linked
#   * `pnpm`, `curl`, `python3` on PATH

set -euo pipefail

API_URL="${API_URL:-https://api.metahunt.app}"
PG_SERVICE="${PG_SERVICE:-Postgres}"
BATCH_SIZE="${BATCH_SIZE:-500}"

mask_url() { sed -E 's|://[^@]+@|://***@|'; }

# Read JSON from stdin and print "<attempted> <succeeded> <failed>" space-
# separated. Defaults each missing field to 0. Fails (non-zero exit) if
# stdin isn't valid JSON.
parse_backfill() {
  python3 -c "import sys, json
d = json.load(sys.stdin)
print(d.get('attempted', 0), d.get('succeeded', 0), d.get('failed', 0))"
}

echo "→ resolving DATABASE_PUBLIC_URL from railway service '$PG_SERVICE'"
db_url="$(railway variables --service "$PG_SERVICE" --kv \
  | grep '^DATABASE_PUBLIC_URL=' \
  | cut -d= -f2-)"
if [[ -z "$db_url" ]]; then
  echo "ERROR: DATABASE_PUBLIC_URL not found on service '$PG_SERVICE'."
  echo "       Generate it: Railway UI → Postgres → Settings → Networking → Public Networking → Generate Domain"
  exit 1
fi
echo "  target: $(echo "$db_url" | mask_url)"
echo "  api:    $API_URL"

if [[ "${NO_CONFIRM:-0}" != "1" ]]; then
  read -r -p "Proceed with seed + backfill against prod? [y/N] " ans
  [[ "$ans" =~ ^[Yy]$ ]] || { echo "aborted"; exit 0; }
fi

echo
echo "── 1. seeding taxonomy ──────────────────────────────────────"
DATABASE_URL="$db_url" pnpm db:seed

echo
echo "── 2. backfilling silver (loop, batch=$BATCH_SIZE) ──────────"
total_attempted=0
total_succeeded=0
total_failed=0
iter=0
while :; do
  iter=$((iter + 1))
  out="$(curl -sfX POST "$API_URL/loader/backfill?limit=$BATCH_SIZE")"
  read -r attempted succeeded failed <<<"$(echo "$out" | parse_backfill)"
  total_attempted=$((total_attempted + attempted))
  total_succeeded=$((total_succeeded + succeeded))
  total_failed=$((total_failed + failed))
  printf '  iter %02d  attempted=%-4s succeeded=%-4s failed=%s\n' \
    "$iter" "$attempted" "$succeeded" "$failed"
  [[ "$attempted" -eq 0 ]] && break
  sleep 1
done
echo "  total — attempted=$total_attempted succeeded=$total_succeeded failed=$total_failed"

echo
echo "── 3. health check ──────────────────────────────────────────"
echo "stats:"
curl -sf "$API_URL/monitoring/stats" | python3 -m json.tool
echo
echo "taxonomy coverage:"
curl -sf "$API_URL/admin/taxonomy/coverage" | python3 -m json.tool
echo
echo -n "vacancies.total: "
curl -sf "$API_URL/vacancies?pageSize=1" \
  | python3 -c "import sys, json; print(json.load(sys.stdin).get('total', 0))"

echo
echo "done."
