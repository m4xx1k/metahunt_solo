import type { RequirementDatasetCase, RequirementScore } from "../types";

import { summarizeRequirements } from "./scorer";

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
