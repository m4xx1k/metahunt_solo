import Graphology from "graphology";
import louvain from "graphology-communities-louvain";
import forceAtlas2 from "graphology-layout-forceatlas2";
import { useEffect, useMemo, useRef, useState } from "react";
import Sigma from "sigma";
import type { Graph } from "../types";
import { fmt } from "../lib/graph";
import { input, label, panel, panelHead, panelNote, panelTitle } from "../ui";
import { HowItWorks } from "./HowItWorks";

const token = (name: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#888";

type Cluster = { id: number; members: number[]; label: string };

/** The whole graph at once is 4,140 lines of hairball. This view earns its
 *  keep by filtering first and grouping second: an NPMI floor decides what is
 *  drawn, Louvain decides what belongs together, and only one cluster is ever
 *  emphasised at a time. */
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
  const host = useRef<HTMLDivElement>(null);
  const sigmaRef = useRef<Sigma | null>(null);
  const previousSelected = useRef<number | null>(null);
  const [minNpmi, setMinNpmi] = useState(0.3);
  const [focus, setFocus] = useState<number | null>(null);
  const [showLabels, setShowLabels] = useState(true);
  const [hover, setHover] = useState<{ x: number; y: number; text: string } | null>(null);

  /** Layout and community detection are pure functions of the filter, so they
   *  run once per filter change rather than on every render. */
  const model = useMemo(() => {
    const build = (edges: typeof graph.edges) => {
      const g = new Graphology({ type: "undirected" });
      for (const e of edges) {
        for (const idx of [e.a, e.b]) {
          const id = String(idx);
          if (!g.hasNode(id)) {
            const n = graph.nodes[idx];
            g.addNode(id, { idx, label: n.name, support: n.support });
          }
        }
        g.addEdge(String(e.a), String(e.b), { weight: e.npmi });
      }
      return g;
    };

    const kept = graph.edges.filter((e) => e.npmi >= minNpmi);
    const full = build(kept);
    if (full.order === 0) return { g: full, clusters: [] as Cluster[] };

    louvain.assign(full, { getEdgeWeight: "weight" });

    const community = new Map<number, number>();
    full.forEachNode((_n, a) => community.set(a.idx as number, a.community as number));

    // Drawing every cluster at once is a disc no matter how good the layout is —
    // a dense graph genuinely looks like that. Choosing a cluster therefore
    // filters the canvas rather than merely recolouring it.
    const g =
      focus === null ? full : build(kept.filter((e) => community.get(e.a) === focus && community.get(e.b) === focus));

    if (g !== full) g.forEachNode((n) => g.setNodeAttribute(n, "community", focus));

    // ForceAtlas2 refines existing positions — it does not invent them. Seed a
    // circle first, or every node reaches the renderer without x/y.
    let i = 0;
    g.forEachNode((node) => {
      const angle = (2 * Math.PI * i++) / g.order;
      g.setNodeAttribute(node, "x", Math.cos(angle) * 100);
      g.setNodeAttribute(node, "y", Math.sin(angle) * 100);
    });

    // LinLog + outbound attraction distribution is what turns a hairball into
    // visibly separate communities; default settings pack everything into one
    // disc regardless of how good the clustering underneath is.
    forceAtlas2.assign(g, {
      iterations: 600,
      settings: {
        ...forceAtlas2.inferSettings(g),
        barnesHutOptimize: true,
        linLogMode: true,
        outboundAttractionDistribution: true,
        gravity: 0.05,
        scalingRatio: 10,
        slowDown: 6,
      },
    });

    // Cluster list always describes the FULL filtered graph, so the picker does
    // not shrink to a single option once a cluster is selected.
    const byCommunity = new Map<number, number[]>();
    full.forEachNode((_node, attrs) => {
      const c = attrs.community as number;
      const list = byCommunity.get(c);
      if (list) list.push(attrs.idx as number);
      else byCommunity.set(c, [attrs.idx as number]);
    });

    // A cluster is named by its most-demanded members — an auto-label from the
    // data, never a hand-written stack name.
    const clusters: Cluster[] = [...byCommunity.entries()]
      .map(([id, members]) => {
        const top = [...members]
          .sort((a, b) => graph.nodes[b].support - graph.nodes[a].support)
          .slice(0, 3)
          .map((i) => graph.nodes[i].name);
        return { id, members, label: top.join(" · ") };
      })
      .sort((a, b) => b.members.length - a.members.length);

    return { g, clusters };
  }, [graph, minNpmi, focus]);

  useEffect(() => {
    if (!host.current || model.g.order === 0) return;

    const signal = token("--color-signal");
    const trap = token("--color-trap");
    const muted = token("--color-ink-3");
    const rule = token("--color-rule-strong");

    const relation = new Map<string, "core" | "periphery">();
    for (const edge of graph.edges) {
      if (edge.a !== selected && edge.b !== selected) continue;
      const other = edge.a === selected ? edge.b : edge.a;
      const p = edge.a === selected ? edge.pBgivenA : edge.pAgivenB;
      if (p >= 0.6) relation.set(String(other), "core");
      else if (p >= 0.2) relation.set(String(other), "periphery");
    }

    model.g.forEachNode((node, attrs) => {
      const idx = attrs.idx as number;
      const kind = relation.get(node);
      const inFocus = focus === null || attrs.community === focus;
      const base = 2 + Math.sqrt(attrs.support as number) / 9;
      model.g.setNodeAttribute(node, "color", idx === selected ? trap : kind ? signal : muted);
      model.g.setNodeAttribute(node, "size", idx === selected ? base + 4 : kind === "core" ? base + 1.5 : base);
      model.g.setNodeAttribute(node, "zIndex", idx === selected ? 3 : kind ? 2 : inFocus ? 1 : 0);
    });
    model.g.forEachEdge((edge, _attrs, source, target) => {
      const touchesSelected = source === String(selected) || target === String(selected);
      const other = source === String(selected) ? target : source;
      const kind = touchesSelected ? relation.get(other) : undefined;
      model.g.setEdgeAttribute(edge, "color", kind ? signal : rule);
      model.g.setEdgeAttribute(edge, "size", kind === "core" ? 2.2 : kind === "periphery" ? 1.2 : 0.45);
    });

    const renderer = new Sigma(model.g, host.current, {
      labelColor: { color: token("--color-ink-2") },
      labelFont: "ui-sans-serif, system-ui, sans-serif",
      labelSize: 11,
      labelRenderedSizeThreshold: showLabels ? 0 : Infinity,
      defaultEdgeColor: rule,
      zIndex: true,
    });
    sigmaRef.current = renderer;

    // Keep the initial overview intact; on subsequent picks, centre the chosen
    // skill and move one zoom step closer without hiding the neighbourhood.
    const shouldZoom = previousSelected.current !== null && previousSelected.current !== selected;
    previousSelected.current = selected;
    const selectedNode = model.g.findNode((_node, attrs) => (attrs.idx as number) === selected);
    if (shouldZoom && selectedNode) {
      const node = model.g.getNodeAttributes(selectedNode);
      const position = renderer.graphToViewport({ x: node.x as number, y: node.y as number });
      renderer.getCamera().animate(renderer.getViewportZoomedState(position, 0.68), { duration: 420 });
    }

    renderer.on("enterNode", ({ node, event }) => {
      const a = model.g.getNodeAttributes(node);
      setHover({
        x: event.x,
        y: event.y,
        text: `${a.label}\n${fmt(a.support as number)} positions\ndegree ${model.g.degree(node)}`,
      });
    });
    renderer.on("leaveNode", () => setHover(null));
    renderer.on("clickNode", ({ node }) =>
      onSelectSkill(model.g.getNodeAttribute(node, "idx") as number),
    );

    return () => {
      renderer.kill();
      sigmaRef.current = null;
      setHover(null);
    };
  }, [graph.edges, model, focus, onSelectSkill, selected, showLabels]);

  return (
    <>
      <div className="flex flex-wrap gap-x-5 gap-y-3 items-end pb-5">
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
            {model.clusters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label} ({c.members.length})
              </option>
            ))}
          </select>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-2">
          <input
            type="checkbox"
            className="accent-signal"
            checked={showLabels}
            onChange={(event) => setShowLabels(event.target.checked)}
          />
          Show skill labels
        </label>
        <p className="max-w-[42ch] text-xs leading-relaxed text-ink-3">
          <span className="text-trap">Selected</span> · thick teal = often requested together · thin teal = sometimes requested together
        </p>
      </div>

      <div className={panel}>
        <div className={panelHead}>
          <span className={panelTitle}>
            {model.g.order} skills · {model.g.size} links · {model.clusters.length} clusters
          </span>
          <span className={panelNote}>Louvain communities · ForceAtlas2 layout · click a node</span>
        </div>
        <div className="relative">
          <div ref={host} className="h-[32rem] w-full sm:h-[42rem]" />
          {hover ? (
            <div
              className="pointer-events-none absolute z-10 whitespace-pre rounded border border-rule-strong bg-ground px-2.5 py-1.5 font-mono text-[0.72rem] leading-relaxed"
              style={{ left: hover.x + 12, top: hover.y + 12 }}
            >
              {hover.text}
            </div>
          ) : null}
          {model.g.order === 0 ? (
            <p className="absolute inset-0 grid place-items-center text-sm text-ink-3">
              No edge clears NPMI {minNpmi.toFixed(2)}.
            </p>
          ) : null}
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
