import { assignGroupIds, buildClusters, type Link } from "./clusters";
import {
  DEFAULT_THRESHOLDS,
  isSame,
  vetoes,
  type MatchContext,
  type MatchEvidence,
  type PostingFacts,
} from "./match-rules";

const DAY = 86_400_000;

function facts(id: string, day: number, over: Partial<PostingFacts> = {}): PostingFacts {
  return {
    id,
    sourceId: "dou",
    companyId: null,
    title: "Backend Engineer",
    titleKey: "backend engineer",
    seniority: null,
    roleNodeId: null,
    publishedAt: day * DAY,
    fingerprint: `fp-${id}`,
    shingles: new Uint32Array(),
    ...over,
  };
}

const cross: MatchEvidence = { rule: "cross_source", titleSim: 1, containment: 0.9, cosine: 0.95 };
const exact: MatchEvidence = { rule: "exact", titleSim: 1, containment: 1, cosine: 1 };

function link(a: string, b: string, evidence = cross): Link {
  return { a, b, evidence };
}

const noVeto = () => null;

function ids(clusters: ReturnType<typeof buildClusters>): string[][] {
  return clusters.map((c) => c.members.map((m) => m.facts.id).sort()).sort();
}

describe("buildClusters", () => {
  it("never puts two vetoed postings together through a chain", () => {
    const a = facts("a", 0, { sourceId: "dou" });
    const b = facts("b", 1, { sourceId: "djinni" });
    const c = facts("c", 2, { sourceId: "dou" });
    const veto = (x: PostingFacts, y: PostingFacts) =>
      x.sourceId === y.sourceId ? ("same_source_content" as const) : null;

    const clusters = buildClusters([a, b, c], [link("a", "b"), link("b", "c")], veto);

    expect(ids(clusters)).toEqual([["a", "b"], ["c"]]);
  });

  it("a manual override splits an otherwise linked pair", () => {
    const a = facts("a", 0);
    const b = facts("b", 1, { sourceId: "djinni" });
    const ctx: MatchContext = {
      thresholds: DEFAULT_THRESHOLDS,
      cosine: () => 0.99,
      isOverridden: (x, y) => [x.id, y.id].sort().join() === "a,b",
    };
    const clusters = buildClusters([a, b], [link("a", "b")], (x, y) => vetoes(x, y, ctx));
    expect(ids(clusters)).toEqual([["a"], ["b"]]);
  });

  it("is deterministic under input and link order", () => {
    const postings = Array.from({ length: 30 }, (_, i) =>
      facts(`p${String(i).padStart(2, "0")}`, i % 7, { sourceId: i % 2 ? "dou" : "djinni" }),
    );
    const links: Link[] = [];
    for (let i = 0; i < 30; i++) {
      for (let j = i + 1; j < 30; j += 3) links.push(link(postings[i].id, postings[j].id));
    }
    const veto = (x: PostingFacts, y: PostingFacts) =>
      x.sourceId === y.sourceId && (Number(x.id.slice(1)) + Number(y.id.slice(1))) % 5 === 0
        ? ("same_source_content" as const)
        : null;
    const reference = buildClusters(postings, links, veto);
    for (let run = 0; run < 5; run++) {
      const shuffled = shuffle(postings, run);
      const shuffledLinks = shuffle(links, run + 11).map((l, k) =>
        k % 2 ? { a: l.b, b: l.a, evidence: l.evidence } : l,
      );
      const again = buildClusters(shuffled, shuffledLinks, veto);
      expect(
        again.map((c) => c.members.map((m) => [m.facts.id, m.via?.matchedAgainstVacancyId])),
      ).toEqual(
        reference.map((c) => c.members.map((m) => [m.facts.id, m.via?.matchedAgainstVacancyId])),
      );
    }
  });

  it("prefers the strongest link, then the older cluster", () => {
    const a = facts("a", 0);
    const b = facts("b", 1, { sourceId: "x" });
    const c = facts("c", 2, { sourceId: "y" });
    const vetoAB = (x: PostingFacts, y: PostingFacts) =>
      [x.id, y.id].sort().join() === "a,b" ? ("company" as const) : null;
    const clusters = buildClusters([a, b, c], [link("c", "a"), link("c", "b", exact)], vetoAB);
    expect(ids(clusters)).toEqual([["a"], ["b", "c"]]);
    expect(clusters[1].members[1].via).toEqual({ matchedAgainstVacancyId: "b", evidence: exact });
  });

  it("an edited vacancy leaves its group once its content no longer links", () => {
    const ctx: MatchContext = {
      thresholds: DEFAULT_THRESHOLDS,
      cosine: () => null,
      isOverridden: () => false,
    };
    const a = facts("a", 0, { fingerprint: "same" });
    const b = facts("b", 1, { fingerprint: "same", sourceId: "djinni" });
    const edited = { ...b, fingerprint: "changed" };
    const linksFor = (xs: PostingFacts[]) => {
      const out: Link[] = [];
      for (let i = 0; i < xs.length; i++)
        for (let j = i + 1; j < xs.length; j++) {
          const ev = isSame(xs[i], xs[j], ctx);
          if (ev) out.push({ a: xs[i].id, b: xs[j].id, evidence: ev });
        }
      return out;
    };
    const veto = (x: PostingFacts, y: PostingFacts) => vetoes(x, y, ctx);
    expect(ids(buildClusters([a, b], linksFor([a, b]), veto))).toEqual([["a", "b"]]);
    expect(ids(buildClusters([a, edited], linksFor([a, edited]), veto))).toEqual([["a"], ["b"]]);
  });

  it("ignores self links and unknown ids", () => {
    const a = facts("a", 0);
    expect(ids(buildClusters([a], [link("a", "a"), link("a", "zz")], noVeto))).toEqual([["a"]]);
  });
});

describe("assignGroupIds", () => {
  it("keeps the oldest member's group and mints ids for split-outs", () => {
    const current: Record<string, string> = { a: "g1", b: "g1", c: "g1", d: "g2" };
    const clusters = [
      { members: [{ facts: facts("a", 0), via: null }] },
      {
        members: [
          { facts: facts("b", 1), via: null },
          { facts: facts("d", 2), via: null },
        ],
      },
      { members: [{ facts: facts("e", 3), via: null }] },
    ];
    let n = 0;
    const out = assignGroupIds(
      clusters,
      (id) => current[id] ?? null,
      () => `new-${++n}`,
    );
    expect(out.map((o) => o.groupId)).toEqual(["g1", "new-1", "new-2"]);
  });
});

function shuffle<T>(xs: readonly T[], seed: number): T[] {
  const out = [...xs];
  let s = seed + 1;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 16807) % 2147483647;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
