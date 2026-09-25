import { assignGroupIds, buildClusters, type Cluster, type Link } from "./clusters";
import type { DedupReason } from "./dedup.contract";
import {
  cosineOf,
  DEFAULT_THRESHOLDS,
  isRepost,
  isSame,
  vetoes,
  type MatchContext,
  type PostingFacts,
  type Thresholds,
} from "./match-rules";
import type { PartitionEntry, PostingRow } from "./partition.repository";

export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function matchContext(opts: {
  overrides: ReadonlyArray<readonly [string, string]>;
  cosines?: ReadonlyMap<string, number>;
  embeddings?: ReadonlyMap<string, Float32Array>;
  thresholds?: Thresholds;
}): MatchContext {
  const overridden = new Set(opts.overrides.map(([a, b]) => pairKey(a, b)));
  return {
    thresholds: opts.thresholds ?? DEFAULT_THRESHOLDS,
    isOverridden: (a, b) => overridden.has(pairKey(a.id, b.id)),
    cosine: (a, b) => {
      const known = opts.cosines?.get(pairKey(a.id, b.id));
      if (known !== undefined) return known;
      const ea = opts.embeddings?.get(a.id);
      const eb = opts.embeddings?.get(b.id);
      return ea && eb ? cosineOf(ea, eb) : null;
    },
  };
}

export function linksFor(
  facts: ReadonlyMap<string, PostingFacts>,
  pairs: Iterable<readonly [string, string]>,
  ctx: MatchContext,
): Link[] {
  const seen = new Set<string>();
  const links: Link[] = [];
  for (const [a, b] of pairs) {
    const key = pairKey(a, b);
    if (a === b || seen.has(key)) continue;
    seen.add(key);
    const fa = facts.get(a);
    const fb = facts.get(b);
    if (!fa || !fb) continue;
    const evidence = isSame(fa, fb, ctx);
    if (evidence) links.push({ a, b, evidence });
  }
  return links;
}

export function* allPairs(ids: readonly string[]): Generator<[string, string]> {
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) yield [ids[i], ids[j]];
  }
}

/** Clusters → entries with stable ids and fresh reasons. Unembedded vacancies stay pending. */
export function targetPartition(
  rows: readonly PostingRow[],
  links: readonly Link[],
  ctx: MatchContext,
  opts: { newId: () => string; decidedAt: string },
): { entries: PartitionEntry[]; clusters: Array<{ groupId: string; cluster: Cluster }> } {
  const byId = new Map(rows.map((r) => [r.facts.id, r]));
  const clusters = buildClusters(
    rows.map((r) => r.facts),
    links,
    (a, b) => vetoes(a, b, ctx),
  );
  const assigned = assignGroupIds(clusters, (id) => byId.get(id)?.groupId ?? null, opts.newId);
  const entries: PartitionEntry[] = [];
  for (const { groupId, cluster } of assigned) {
    for (const member of cluster.members) {
      const row = byId.get(member.facts.id)!;
      const reason: DedupReason | null = member.via && {
        rule: member.via.evidence.rule,
        matchedAgainstVacancyId: member.via.matchedAgainstVacancyId,
        titleSim: member.via.evidence.titleSim,
        containment: member.via.evidence.containment,
        cosine: member.via.evidence.cosine,
        decidedAt: opts.decidedAt,
      };
      entries.push({
        vacancyId: row.facts.id,
        groupId,
        version: row.version,
        dedupReason: reason,
        deduplicatedAt: row.hasEmbedding ? opts.decidedAt : null,
      });
    }
  }
  return { entries, clusters: assigned };
}

/** Groups holding two same-board postings of different content that are not a repost. */
export function sameSourceViolations(
  groups: ReadonlyArray<readonly PostingFacts[]>,
  ctx: MatchContext,
): number {
  let violations = 0;
  for (const members of groups) {
    let bad = false;
    for (let i = 0; i < members.length && !bad; i++) {
      for (let j = i + 1; j < members.length && !bad; j++) {
        const a = members[i];
        const b = members[j];
        bad = a.sourceId === b.sourceId && a.fingerprint !== b.fingerprint && !isRepost(a, b, ctx);
      }
    }
    if (bad) violations++;
  }
  return violations;
}

export function groupsOf(assignment: ReadonlyMap<string, string>): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const [vacancyId, groupId] of assignment) {
    const list = groups.get(groupId);
    if (list) list.push(vacancyId);
    else groups.set(groupId, [vacancyId]);
  }
  return groups;
}

export interface PartitionDiff {
  /** Target groups whose exact member set does not exist in the current partition. */
  changedGroups: number;
  /** Current groups whose members end up in two or more target groups. */
  splits: number;
  /** Target groups assembled from two or more current groups. */
  merges: number;
  /** Vacancies whose group id changes. */
  moved: number;
}

export function diffPartitions(
  current: ReadonlyMap<string, string>,
  target: ReadonlyMap<string, string>,
): PartitionDiff {
  const signature = (members: string[]) => [...members].sort().join(",");
  const currentSets = new Set([...groupsOf(current).values()].map(signature));
  const targetGroups = groupsOf(target);
  let changedGroups = 0;
  let merges = 0;
  for (const members of targetGroups.values()) {
    if (!currentSets.has(signature(members))) changedGroups++;
    if (new Set(members.map((m) => current.get(m))).size > 1) merges++;
  }
  let splits = 0;
  for (const members of groupsOf(current).values()) {
    if (new Set(members.map((m) => target.get(m))).size > 1) splits++;
  }
  let moved = 0;
  for (const [vacancyId, groupId] of target) if (current.get(vacancyId) !== groupId) moved++;
  return { changedGroups, splits, merges, moved };
}
