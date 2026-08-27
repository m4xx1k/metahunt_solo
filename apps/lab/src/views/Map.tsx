import Graphology from "graphology";
import louvain from "graphology-communities-louvain";
import { useMemo, useState } from "react";
import type { Graph } from "../types";
import { input, label, panel, panelHead, panelNote, panelTitle } from "../ui";
import { Constellation, type ConLink } from "./Constellation";
import { HowItWorks } from "./HowItWorks";

type Cluster = { id: number; size: number; label: string };

/** The whole graph, always in motion. An NPMI floor decides which links are
 *  drawn, Louvain decides what belongs together, and the cluster picker lifts
 *  one group without dropping the rest. Layout and camera live in
 *  <Constellation>; this view is the controls around it. */
export function MapView({
  graph,
  selected,
  onSelectSkill,
  onOpenFaq,
}: {
  graph: Graph;
  selected: number;
  onSelectSkill: (i: number) => void;
  onOpenFaq: () => void;
}) {
  const [minNpmi, setMinNpmi] = useState(0.3);
  const [focus, setFocus] = useState<number | null>(null);

  // Louvain is a pure function of the drawn links and costs 2–7 ms, so it runs
  // per threshold change rather than moving to build time.
  const { links, community, clusters } = useMemo(() => {
    const kept = graph.edges.filter((e) => e.npmi >= minNpmi);
    const g = new Graphology({ type: "undirected" });
    for (const e of kept) {
      for (const idx of [e.a, e.b]) if (!g.hasNode(idx)) g.addNode(idx);
      g.addEdge(e.a, e.b, { weight: e.npmi });
    }
    const community = new Map<number, number>();
    if (g.order > 0) {
      louvain.assign(g, { getEdgeWeight: "weight" });
      g.forEachNode((node, attrs) => community.set(Number(node), attrs.community as number));
    }

    const members = new Map<number, number[]>();
    for (const [idx, c] of community) (members.get(c) ?? members.set(c, []).get(c)!).push(idx);
    const clusters: Cluster[] = [...members.entries()]
      .map(([id, list]) => ({
        id,
        size: list.length,
        label: [...list]
          .sort((a, b) => graph.nodes[b].support - graph.nodes[a].support)
          .slice(0, 3)
          .map((i) => graph.nodes[i].name)
          .join(" · "),
      }))
      .sort((a, b) => b.size - a.size);

    const links: ConLink[] = kept.map((e) => ({ source: e.a, target: e.b }));
    return { links, community, clusters };
  }, [graph, minNpmi]);

  return (
    <>
      <div className="flex flex-wrap items-end gap-x-5 gap-y-3 pb-5">
        <div className="flex flex-col gap-1">
          <label className={label} htmlFor="npmi">
            Minimum NPMI
          </label>
          <div className="flex items-center gap-2">
            <input
              id="npmi"
              type="range"
              className="accent-signal w-44"
              min={0.1}
              max={0.8}
              step={0.05}
              value={minNpmi}
              onChange={(e) => setMinNpmi(Number(e.target.value))}
            />
            <span className="font-mono text-xs text-ink-2 tabular">≥ {minNpmi.toFixed(2)}</span>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className={label} htmlFor="cluster">
            Show cluster
          </label>
          <select
            id="cluster"
            className={input}
            value={focus ?? ""}
            onChange={(e) => setFocus(e.target.value === "" ? null : Number(e.target.value))}
          >
            <option value="">— all clusters (overview) —</option>
            {clusters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label} ({c.size})
              </option>
            ))}
          </select>
        </div>

        <p className="max-w-[42ch] text-xs leading-relaxed text-ink-3">
          <span className="text-trap">Selected</span> · colour groups skills that travel together ·
          hover to light a neighbourhood · click to fly in
        </p>
      </div>

      <div className={panel}>
        <div className={panelHead}>
          <span className={panelTitle}>
            {graph.nodes.length} skills · {links.length} links · {clusters.length} clusters
          </span>
          <span className={panelNote}>Louvain communities · live force layout · click a node</span>
        </div>
        <div className="px-1 py-1">
          <Constellation
            graph={graph}
            selected={selected}
            onSelectSkill={onSelectSkill}
            links={links}
            community={community}
            focusCluster={focus}
            variant="map"
            height={640}
          />
        </div>
      </div>

      <HowItWorks onOpenFaq={onOpenFaq}>
        The map keeps only links above the NPMI floor, then groups the remaining skills by how tightly
        they connect. Raising the floor changes the graph and can split or merge clusters; canvas
        position means only “connected things sit together”.
      </HowItWorks>
    </>
  );
}
