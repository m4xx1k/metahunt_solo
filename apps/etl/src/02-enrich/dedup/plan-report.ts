import type { Cluster } from "./clusters";
import { requisitionNo } from "./match-rules";
import type { PartitionDiff } from "./partition";
import type { PostingRow } from "./partition.repository";

const DIGEST_LOOKBACK_MS = 14 * 86_400_000;
const TOP_CLUSTERS = 30;

export interface PlanReport {
  markdown: string;
  stats: {
    groupsBefore: number;
    groupsAfter: number;
    largestAfter: number;
    diff: PartitionDiff;
    sameSourceViolationsBefore: number;
    sameSourceViolationsAfter: number;
    mixedRequisitionGroupsAfter: number;
    newlyDigestEligible: number;
    newlyDigestEligibleUnsent: number;
  };
}

export function buildPlanReport(input: {
  builtAt: string;
  rows: readonly PostingRow[];
  diff: PartitionDiff;
  currentGroups: ReadonlyArray<readonly PostingRow[]>;
  clusters: ReadonlyArray<{ groupId: string; cluster: Cluster }>;
  sentVacancyIds: ReadonlySet<string>;
  violationsBefore: number;
  violationsAfter: number;
  linkCount: number;
  pairCount: number;
  names: ReadonlyMap<string, string>;
}): PlanReport {
  const rowById = new Map(input.rows.map((r) => [r.facts.id, r]));
  const currentGroupIds = new Set(input.rows.map((r) => r.groupId));
  const sizesBefore = input.currentGroups.map((g) => g.length);
  const sizesAfter = input.clusters.map((c) => c.cluster.members.length);
  const cutoff = Date.parse(input.builtAt) - DIGEST_LOOKBACK_MS;

  let newlyDigestEligible = 0;
  let newlyDigestEligibleUnsent = 0;
  const rules = { exact: 0, repost: 0, cross_source: 0 };
  let mixedRequisitionGroupsAfter = 0;
  for (const { groupId, cluster } of input.clusters) {
    for (const m of cluster.members) if (m.via) rules[m.via.evidence.rule]++;
    const requisitions = new Set(
      cluster.members.map((m) => requisitionNo(m.facts.title)).filter((n) => n !== null),
    );
    if (requisitions.size > 1) mixedRequisitionGroupsAfter++;
    if (currentGroupIds.has(groupId)) continue;
    const firstLoaded = Math.min(...cluster.members.map((m) => rowById.get(m.facts.id)!.loadedAt));
    if (firstLoaded < cutoff) continue;
    newlyDigestEligible++;
    if (!cluster.members.some((m) => input.sentVacancyIds.has(m.facts.id))) {
      newlyDigestEligibleUnsent++;
    }
  }

  const stats = {
    groupsBefore: sizesBefore.length,
    groupsAfter: sizesAfter.length,
    largestAfter: maxOf(sizesAfter),
    diff: input.diff,
    sameSourceViolationsBefore: input.violationsBefore,
    sameSourceViolationsAfter: input.violationsAfter,
    mixedRequisitionGroupsAfter,
    newlyDigestEligible,
    newlyDigestEligibleUnsent,
  };

  const name = (id: string | null) => (id ? (input.names.get(id) ?? id) : "—");
  const top = [...input.clusters]
    .sort((a, b) => b.cluster.members.length - a.cluster.members.length)
    .slice(0, TOP_CLUSTERS);

  const lines = [
    `# dedup plan — ${input.builtAt}`,
    "",
    "Read-only. `target.json` is the proposed partition, `current.json` the rollback.",
    "",
    "| | before | after |",
    "|---|---|---|",
    `| groups | ${stats.groupsBefore} | ${stats.groupsAfter} |`,
    `| multi-member groups | ${multi(sizesBefore).groups} | ${multi(sizesAfter).groups} |`,
    `| vacancies in multi-member groups | ${multi(sizesBefore).members} | ${multi(sizesAfter).members} |`,
    `| largest group | ${maxOf(sizesBefore)} | ${stats.largestAfter} |`,
    `| same-source violations | ${stats.sameSourceViolationsBefore} | ${stats.sameSourceViolationsAfter} |`,
    `| groups with two requisition numbers | — | ${stats.mixedRequisitionGroupsAfter} |`,
    "",
    "## Size histogram",
    "",
    "| size | before | after |",
    "|---|---|---|",
    ...histogramRows(sizesBefore, sizesAfter),
    "",
    "## Diff",
    "",
    `- changed groups (target member sets not present today): **${input.diff.changedGroups}**`,
    `- splits (current groups spread over ≥2 targets): ${input.diff.splits}`,
    `- merges (targets assembled from ≥2 current groups): ${input.diff.merges}`,
    `- moved vacancies (group id changes): ${input.diff.moved}`,
    `- candidate pairs: ${input.pairCount}; links: ${input.linkCount}`,
    `- links by rule: exact ${rules.exact}, repost ${rules.repost}, cross_source ${rules.cross_source}`,
    "",
    "## Digest impact",
    "",
    `- positions newly eligible for the digest (new group id, first loaded in the last 14 days): **${newlyDigestEligible}**`,
    `- of those, with no member ever sent: ${newlyDigestEligibleUnsent}`,
    "",
    `## Top ${TOP_CLUSTERS} target groups`,
    "",
    ...top.flatMap(({ groupId, cluster }) => [
      `### ${cluster.members.length} × ${groupId}`,
      "",
      ...cluster.members.map((m) => {
        const via = m.via
          ? ` ← ${m.via.evidence.rule} (title ${m.via.evidence.titleSim}, text ${m.via.evidence.containment}, cos ${m.via.evidence.cosine ?? "—"})`
          : "";
        return `- ${name(m.facts.sourceId)} · ${name(m.facts.companyId)} · ${m.facts.title}${via}`;
      }),
      "",
    ]),
  ];
  return { markdown: lines.join("\n"), stats };
}

function multi(sizes: number[]): { groups: number; members: number } {
  const many = sizes.filter((s) => s > 1);
  return { groups: many.length, members: many.reduce((a, b) => a + b, 0) };
}

function histogramRows(before: number[], after: number[]): string[] {
  const buckets: Array<[string, (n: number) => boolean]> = [
    ["1", (n) => n === 1],
    ["2", (n) => n === 2],
    ["3–4", (n) => n >= 3 && n <= 4],
    ["5–9", (n) => n >= 5 && n <= 9],
    ["10+", (n) => n >= 10],
  ];
  return buckets.map(
    ([label, test]) =>
      `| ${label} | ${before.filter(test).length} | ${after.filter(test).length} |`,
  );
}

function maxOf(xs: number[]): number {
  return xs.reduce((a, b) => Math.max(a, b), 0);
}
