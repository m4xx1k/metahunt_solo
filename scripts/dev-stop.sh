#!/usr/bin/env bash
# Kill leftover dev processes from `pnpm dev`.
# Patterns live in this file (not on the shell command line) so pkill doesn't match its own caller.

set -u

# Each pattern targets a distinct dev process. Order: app first, then watchers.
patterns=(
  "apps/etl/dist/main"
  "@nestjs/cli/bin/nest.js start"
  "libs/database/.*tsc .*-w"
  "next dev --port"
  "next-server"
)

killed_any=0
for pat in "${patterns[@]}"; do
  pids=$(pgrep -f "$pat" || true)
  if [ -n "$pids" ]; then
    # Filter out our own PID + parent (the pnpm shell wrapper)
    pids=$(echo "$pids" | grep -vE "^($$|$PPID)$" || true)
  fi
  if [ -n "$pids" ]; then
    echo "killing [$pat]: $pids"
    kill -9 $pids 2>/dev/null || true
    killed_any=1
  fi
done

[ "$killed_any" -eq 0 ] && echo "no dev processes running"
exit 0
