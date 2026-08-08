#!/usr/bin/env bash
# One-shot dataset build: lab database → committed artifact.
#
#   pnpm --filter @metahunt/lab lab:data          # → src/data/graph.json
#   pnpm --filter @metahunt/lab lab:data out.json
#
# This is the only thing in the lab that touches a database, and it runs when a
# human asks it to. The app itself reads the emitted JSON, so the UI can never
# drift from numbers that were not reviewed, and no product build depends on a
# database being reachable.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP="$(dirname "$HERE")"
OUT="${1:-$APP/src/data/graph.json}"
PSQL="$HERE/psql.sh"

step() { printf '\n\033[36m▸ %s\033[0m\n' "$1" >&2; }

# Views built on top of the stage tables block their DROP, so unhook them first.
# This is what makes a rebuild repeatable rather than first-run-only.
"$PSQL" -c "DROP VIEW IF EXISTS metalab_grill" -c "DROP VIEW IF EXISTS metalab_edge" >/dev/null

step "02 — position-grain skill and pair tables (both aggregation rules)"
"$PSQL" -f "$HERE/02-pairs.sql" >/dev/null

step "03 — role and source conditioning"
"$PSQL" -f "$HERE/03-confounders.sql" >/dev/null

step "04 — emit artifact"
tmp="$(mktemp)"
# The export joins every role segment against every edge; it runs for several
# minutes and legitimately needs more than the default statement cap.
LAB_TIMEOUT="${LAB_TIMEOUT:-1800s}" "$PSQL" -tAf "$HERE/04-export.sql" > "$tmp"

# A truncated or error-shaped artifact must never overwrite a good one.
# readFileSync, not require: the temp file has no .json extension, so require
# would parse it as JavaScript and fail on the very first artifact it is given.
node -e 'const fs = require("node:fs");
  const g = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  if (!g.nodes?.length || !g.edges?.length) throw new Error("artifact is empty");
  console.error(`  ${g.nodes.length} nodes · ${g.edges.length} edges · ${g.roles.length} roles`);' "$tmp"

mkdir -p "$(dirname "$OUT")"
mv "$tmp" "$OUT"
step "done → $OUT"
