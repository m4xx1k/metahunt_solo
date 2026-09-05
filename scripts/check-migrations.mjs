#!/usr/bin/env node
// Guards the one thing the Drizzle migrator silently trusts: that every .sql in
// the migrations folder is registered in meta/_journal.json. A file that is not
// in the journal never runs — in any environment — and nothing else notices.
// (This check exists because 0039 sat unapplied on disk for a week.)
//
// Also asserts the journal's `when` values strictly increase: the migrator
// applies entries newer than max(created_at) in drizzle.__drizzle_migrations,
// so a squash that reuses older timestamps would quietly apply nothing.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIR = "libs/database/migrations";
const journal = JSON.parse(readFileSync(join(DIR, "meta/_journal.json"), "utf8"));

// Applied everywhere long ago, hand-written with an arbitrary `when` far below
// its neighbours. Rewriting an applied entry's timestamp is riskier than
// recording it, so it is pinned here and any NEW violation still fails.
const KNOWN_HISTORICAL_OUT_OF_ORDER = new Set(["0003_rss_ingests_workflow_run_id"]);

// Hand-written migrations that shipped without a matching meta/<idx>_snapshot.json
// — accepted debt, not to be silently repeated. Discovered 2026-09-05 (MET-145)
// when 0052-0054's missing snapshots made db:generate re-propose their own
// already-applied changes as new. Any NEW gap still fails the check below.
const KNOWN_MISSING_SNAPSHOTS = new Set([3, 8, 9, 18, 19, 26, 52, 53, 54]);

const tags = journal.entries.map((e) => e.tag);
const files = readdirSync(DIR)
  .filter((f) => f.endsWith(".sql"))
  .map((f) => f.slice(0, -4));
const snapshotIdxs = new Set(
  readdirSync(join(DIR, "meta"))
    .filter((f) => /^\d+_snapshot\.json$/.test(f))
    .map((f) => Number(f.split("_")[0])),
);

const orphanFiles = files.filter((f) => !tags.includes(f));
const missingFiles = tags.filter((t) => !files.includes(t));
const outOfOrder = journal.entries
  .slice(1)
  .filter((e, i) => e.when <= journal.entries[i].when)
  .map((e) => e.tag)
  .filter((t) => !KNOWN_HISTORICAL_OUT_OF_ORDER.has(t));
// A migration applied without its matching meta/<idx>_snapshot.json leaves
// drizzle-kit's diff baseline stuck at the last real snapshot — the NEXT
// `db:generate` then re-proposes that migration's own changes as new,
// silently duplicating already-applied DDL (see MET-145: 0052-0054 hand-
// written without one, which resurfaced as bogus CREATE/DROP statements the
// next time anyone ran db:generate). This is what catches that gap early.
const missingSnapshots = journal.entries
  .map((e) => e.idx)
  .filter((idx) => !snapshotIdxs.has(idx) && !KNOWN_MISSING_SNAPSHOTS.has(idx));

const problems = [];
if (orphanFiles.length)
  problems.push(`never applied — .sql present but absent from the journal:\n  ${orphanFiles.join("\n  ")}`);
if (missingFiles.length)
  problems.push(`journal references a missing file:\n  ${missingFiles.join("\n  ")}`);
if (outOfOrder.length)
  problems.push(`journal timestamps not strictly increasing:\n  ${outOfOrder.join("\n  ")}`);
if (missingSnapshots.length)
  problems.push(
    `missing meta/<idx>_snapshot.json for journal idx:\n  ${missingSnapshots.join(", ")}`,
  );

if (problems.length) {
  console.error(`migrations check FAILED\n\n${problems.join("\n\n")}\n`);
  console.error(
    "Fix: regenerate with `pnpm db:generate` rather than hand-writing a .sql,\n" +
      "or move a deliberately-not-applied file to libs/database/gated/.\n" +
      "A missing snapshot: use `drizzle-kit generate --custom` for hand-written\n" +
      "SQL so the paired snapshot is still written.\n",
  );
  process.exit(1);
}

console.log(`migrations check OK — ${files.length} files, all registered, order sane`);
