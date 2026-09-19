import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { and, eq } from "drizzle-orm";

import { schema } from "@metahunt/database";
import type { DrizzleDB } from "@metahunt/database";

import { sha256 } from "../02-enrich/dedup/content-fingerprint";
import { normalizeAliasName } from "../platform/shared/normalize-alias";

import type {
  RequirementDatasetCase,
  RequirementScore,
  ScorerAliasMap,
} from "./extraction-eval.types";
import { summarizeRequirements } from "./extraction.scorer";

const DATASET_PATH = join(__dirname, "vacancy-requirements-v2.dataset.json");
const ALIASES_PATH = join(__dirname, "aliases.snapshot.json");

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

export function loadDataset(): RequirementDatasetCase[] {
  const raw = JSON.parse(readFileSync(DATASET_PATH, "utf8")) as unknown;
  if (!Array.isArray(raw)) throw new Error("dataset must be a JSON array of cases");
  return raw.map(parseDatasetCase);
}

export function loadAliases(): { aliases: ScorerAliasMap; sha: string } {
  let snapshot: AliasSnapshot;
  try {
    snapshot = JSON.parse(readFileSync(ALIASES_PATH, "utf8")) as AliasSnapshot;
  } catch {
    throw new Error(
      "missing eval/aliases.snapshot.json — run `pnpm eval --refresh-aliases` with DATABASE_URL set",
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
  writeFileSync(ALIASES_PATH, `${JSON.stringify(snapshot, null, 2)}\n`);
  return snapshot;
}

export function parseDatasetCase(item: {
  input?: unknown;
  expectedOutput?: unknown;
  metadata?: unknown;
}): RequirementDatasetCase {
  const input = item.input as RequirementDatasetCase["input"];
  const expectedOutput = item.expectedOutput as RequirementDatasetCase["expectedOutput"];
  const metadata = item.metadata as RequirementDatasetCase["metadata"];
  if (
    !input ||
    typeof input.id !== "string" ||
    typeof input.title !== "string" ||
    typeof input.text !== "string" ||
    !expectedOutput ||
    !Array.isArray(expectedOutput.requirements) ||
    !metadata ||
    !["draft", "approved", "rejected"].includes(metadata.reviewStatus) ||
    !Array.isArray(metadata.slices)
  ) {
    throw new Error(
      "dataset row must use the Requirements v2 input, expectedOutput, and metadata shape",
    );
  }
  return { input, expectedOutput, metadata };
}

/** Release gates apply only to human-approved dataset rows. */
export function assertReleaseGate(
  scores: RequirementScore[],
  items: RequirementDatasetCase[],
): void {
  if (scores.length === 0) throw new Error("release gate: no approved dataset items");
  const summary = summarizeRequirements(scores);
  if (summary.providerFailureRate !== 0)
    throw new Error("release gate: provider failures must be resolved separately");
  if (summary.schemaValidRate !== 1) throw new Error("release gate: schema validity must be 100%");
  if (summary.orSplitErrors !== 0)
    throw new Error("release gate: explicit OR requirement was split into singleton requirements");
  const approvedOrCases = items.filter(
    (item) => item.metadata.reviewStatus === "approved" && item.metadata.slices.includes("or"),
  );
  if (approvedOrCases.length === 0)
    throw new Error("release gate: no approved explicit OR boundary case");
}
