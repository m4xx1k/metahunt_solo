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

const tags = journal.entries.map((e) => e.tag);
const files = readdirSync(DIR)
  .filter((f) => f.endsWith(".sql"))
  .map((f) => f.slice(0, -4));

const orphanFiles = files.filter((f) => !tags.includes(f));
const missingFiles = tags.filter((t) => !files.includes(t));
const outOfOrder = journal.entries
  .slice(1)
  .filter((e, i) => e.when <= journal.entries[i].when)
  .map((e) => e.tag)
  .filter((t) => !KNOWN_HISTORICAL_OUT_OF_ORDER.has(t));

const problems = [];
if (orphanFiles.length)
  problems.push(`never applied — .sql present but absent from the journal:\n  ${orphanFiles.join("\n  ")}`);
if (missingFiles.length)
  problems.push(`journal references a missing file:\n  ${missingFiles.join("\n  ")}`);
if (outOfOrder.length)
  problems.push(`journal timestamps not strictly increasing:\n  ${outOfOrder.join("\n  ")}`);

if (problems.length) {
  console.error(`migrations check FAILED\n\n${problems.join("\n\n")}\n`);
  console.error(
    "Fix: regenerate with `pnpm db:generate` rather than hand-writing a .sql,\n" +
      "or move a deliberately-not-applied file to libs/database/gated/.\n",
  );
  process.exit(1);
}

console.log(`migrations check OK — ${files.length} files, all registered, order sane`);
