import type { Metadata } from "next";

import {
  findNode,
  findRole,
  graph,
  neighborhood,
  searchNodes,
  type SortMetric,
} from "@/lib/metalab/graph";
import { PageBody } from "@/ui/layout/PageBody";
import { PageHeader } from "@/ui/layout/PageHeader";
import { Panel } from "@/ui/layout/Panel";
import { Controls } from "./_components/Controls";
import { Methodology } from "./_components/Methodology";
import { NeighborGraph } from "./_components/NeighborGraph";
import { NeighborTable } from "./_components/NeighborTable";
import { SkillPicker } from "./_components/SkillPicker";

export const metadata: Metadata = { title: "Metalab" };

const SORTS: SortMetric[] = ["npmi", "lift", "pairs", "conditional"];
const DEFAULT_SKILL = "Python";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

// Metalab: the exploratory skill-market graph (MET-129). Reads a committed
// artifact, never the database — the screen and the reviewed numbers cannot
// drift apart, and rendering it touches no production system.
export default async function MetalabPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;

  const focus = findNode(one(sp.skill) ?? DEFAULT_SKILL) ?? graph.nodes[0];
  const role = findRole(one(sp.role) ?? null);
  const sortParam = one(sp.sort) as SortMetric | undefined;
  const sort = sortParam && SORTS.includes(sortParam) ? sortParam : "npmi";
  const minPairs = Number(one(sp.minPairs) ?? graph.contract.minPairSupport) || 0;
  const q = one(sp.q) ?? "";

  const view = neighborhood(focus, { role, minPairs, sort });
  const matches = searchNodes(q);

  return (
    <>
      <PageHeader
        title="Metalab"
        hint={`observed association · ${graph.provenance.nPositions.toLocaleString("en-US")} canonical positions · snapshot ${graph.provenance.corpusEnd}`}
      />

      <PageBody>
        <Panel
          title="Not a recommendation engine"
          bodyClassName="text-sm leading-relaxed text-text-muted"
        >
          Every number here describes how skills{" "}
          <strong>co-appear in MetaHunt&apos;s own corpus</strong> of{" "}
          {graph.provenance.postings.toLocaleString("en-US")} postings collapsed into{" "}
          {graph.provenance.positions.toLocaleString("en-US")} canonical positions. It is not
          causal, not advice, and not a picture of the labour market — the corpus is two job boards
          over {graph.provenance.corpusStart} – {graph.provenance.corpusEnd}, and skills are read
          out of vacancy text by an LLM extractor. No claim is made that any position is currently
          open.
        </Panel>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
          <div className="flex flex-col gap-4">
            <SkillPicker query={q} matches={matches} focus={focus} />
            <Controls role={role} sort={sort} minPairs={minPairs} focus={focus} />
          </div>

          <div className="flex min-w-0 flex-col gap-4">
            <NeighborGraph view={view} />
            <NeighborTable view={view} sort={sort} focus={focus} role={role} minPairs={minPairs} />
          </div>
        </div>

        <Methodology />
      </PageBody>
    </>
  );
}
