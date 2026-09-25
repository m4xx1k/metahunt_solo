import type { MatchEvidence, PostingFacts, VetoReason } from "./match-rules";

export interface Link {
  a: string;
  b: string;
  evidence: MatchEvidence;
}

export interface ClusterMember {
  facts: PostingFacts;
  /** How this member joined; null for the member that founded the cluster. */
  via: { matchedAgainstVacancyId: string; evidence: MatchEvidence } | null;
}

export interface Cluster {
  members: ClusterMember[];
}

const RULE_RANK: Record<MatchEvidence["rule"], number> = { exact: 3, repost: 2, cross_source: 1 };

function stronger(x: MatchEvidence, y: MatchEvidence): boolean {
  if (RULE_RANK[x.rule] !== RULE_RANK[y.rule]) return RULE_RANK[x.rule] > RULE_RANK[y.rule];
  return x.containment > y.containment;
}

export function compareByAge(a: PostingFacts, b: PostingFacts): number {
  if (a.publishedAt !== b.publishedAt) return a.publishedAt - b.publishedAt;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Oldest-first greedy placement. A posting joins the linked cluster with the
 * strongest link unless ANY member vetoes it — complete-veto is what stops
 * A~B~C chaining when A and C are provably different jobs.
 */
export function buildClusters(
  postings: readonly PostingFacts[],
  links: readonly Link[],
  veto: (a: PostingFacts, b: PostingFacts) => VetoReason | null,
): Cluster[] {
  const sorted = [...postings].sort(compareByAge);
  const adjacency = new Map<string, Array<{ other: string; evidence: MatchEvidence }>>();
  for (const link of links) {
    if (link.a === link.b) continue;
    push(adjacency, link.a, { other: link.b, evidence: link.evidence });
    push(adjacency, link.b, { other: link.a, evidence: link.evidence });
  }

  const clusters: Cluster[] = [];
  const clusterOf = new Map<string, number>();

  for (const p of sorted) {
    const best = new Map<number, { other: string; evidence: MatchEvidence }>();
    for (const edge of adjacency.get(p.id) ?? []) {
      const idx = clusterOf.get(edge.other);
      if (idx === undefined) continue;
      const current = best.get(idx);
      if (!current || stronger(edge.evidence, current.evidence) || tie(edge, current)) {
        best.set(idx, edge);
      }
    }

    let chosen: { idx: number; other: string; evidence: MatchEvidence } | null = null;
    for (const [idx, edge] of [...best.entries()].sort(([x], [y]) => x - y)) {
      if (clusters[idx].members.some((m) => veto(p, m.facts) !== null)) continue;
      if (!chosen || stronger(edge.evidence, chosen.evidence)) chosen = { idx, ...edge };
    }

    if (chosen) {
      clusters[chosen.idx].members.push({
        facts: p,
        via: { matchedAgainstVacancyId: chosen.other, evidence: chosen.evidence },
      });
      clusterOf.set(p.id, chosen.idx);
    } else {
      clusterOf.set(p.id, clusters.length);
      clusters.push({ members: [{ facts: p, via: null }] });
    }
  }
  return clusters;
}

function tie(
  x: { other: string; evidence: MatchEvidence },
  y: { other: string; evidence: MatchEvidence },
): boolean {
  return (
    !stronger(y.evidence, x.evidence) && !stronger(x.evidence, y.evidence) && x.other < y.other
  );
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/**
 * Stable id rule: a cluster keeps the current group id of its oldest member
 * unless an older cluster already claimed it.
 */
export function assignGroupIds(
  clusters: readonly Cluster[],
  currentGroupOf: (vacancyId: string) => string | null,
  newId: () => string,
): Array<{ groupId: string; cluster: Cluster }> {
  const claimed = new Set<string>();
  return clusters.map((cluster) => {
    const inherited = currentGroupOf(cluster.members[0].facts.id);
    const groupId = inherited && !claimed.has(inherited) ? inherited : newId();
    claimed.add(groupId);
    return { groupId, cluster };
  });
}
