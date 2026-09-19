import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { and, eq } from "drizzle-orm";

import { schema } from "@metahunt/database";
import type { DrizzleDB } from "@metahunt/database";

import { sha256 } from "../../02-enrich/dedup/content-fingerprint";
import { normalizeAliasName } from "../../platform/shared/normalize-alias";
import type { ScorerAliasMap } from "../types";

const SNAPSHOT_PATH = join(__dirname, "aliases.snapshot.json");

/**
 * The alias map feeds the scorer, so a moving taxonomy silently changes scores
 * between runs. Freezing it is what makes two runs comparable; `sha` goes in
 * the run file so a stale snapshot is visible rather than assumed.
 */
export type AliasSnapshot = {
  sha: string;
  generatedAt: string;
  entries: Array<[string, string]>;
};

export function loadAliases(): { aliases: ScorerAliasMap; sha: string } {
  let snapshot: AliasSnapshot;
  try {
    snapshot = JSON.parse(readFileSync(SNAPSHOT_PATH, "utf8")) as AliasSnapshot;
  } catch {
    throw new Error(
      "missing dataset/aliases.snapshot.json — run `pnpm eval --refresh-aliases` with DATABASE_URL set",
    );
  }
  return { aliases: new Map(snapshot.entries), sha: snapshot.sha };
}

export async function refreshAliasSnapshot(db: DrizzleDB): Promise<AliasSnapshot> {
  const rows = await db
    .select({ alias: schema.nodeAliases.name, canonical: schema.nodes.canonicalName })
    .from(schema.nodeAliases)
    .innerJoin(schema.nodes, eq(schema.nodeAliases.nodeId, schema.nodes.id))
    .where(and(eq(schema.nodeAliases.type, "SKILL"), eq(schema.nodes.type, "SKILL")));
  const canonical = await db
    .select({ name: schema.nodes.canonicalName })
    .from(schema.nodes)
    .where(and(eq(schema.nodes.type, "SKILL"), eq(schema.nodes.status, "VERIFIED")));
  const entries = [
    ...rows.map(({ alias, canonical: name }) => [alias, name] as [string, string]),
    ...canonical.map(({ name }) => [normalizeAliasName(name), name] as [string, string]),
  ].sort(([a], [b]) => a.localeCompare(b));
  const snapshot: AliasSnapshot = {
    sha: sha256(entries.map((entry) => entry.join("\t")).join("\n")),
    generatedAt: new Date().toISOString(),
    entries,
  };
  writeFileSync(SNAPSHOT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`);
  return snapshot;
}
