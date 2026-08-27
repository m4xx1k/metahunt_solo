import { useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D, { type ForceGraphMethods } from "react-force-graph-2d";
import type { Graph, Relation } from "../types";

/** One continuously-simulated graph, shared by the skill map and the relations
 *  view. It owns the simulation, the camera, hover, and per-frame paint; the
 *  caller owns which links are drawn and (for the map) which cluster is lifted.
 *
 *  Behaviours (md/journal/migrations/lab-constellation.md, T4):
 *   - rest: every node present and drifting; colour = Louvain cluster (map) or
 *     relation hue (relations); radius = support; labels earned by degree
 *   - hover: neighbourhood keeps colour and gains labels, the rest drops to
 *     low-alpha ink, and the whole graph freezes so the target stops moving
 *   - click: centre + zoom onto the node over ~600 ms (a cut under reduced motion)
 *   - link changes (NPMI slider / relation filter): reheat, re-settle in view
 *   - cluster focus (map): lift the chosen cluster, push the rest outward
 *   - reduced motion: settle once and stop; camera moves become cuts */

export type ConLink = { source: number; target: number; kind?: Relation };

const cssVar = (name: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#888";

const prefersReducedMotion = () =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

type FGNode = { id: number; name: string; support: number; deg: number; x?: number; y?: number; fx?: number; fy?: number };

export function Constellation({
  graph,
  selected,
  onSelectSkill,
  links,
  community,
  focusCluster = null,
  variant = "map",
  height = 620,
}: {
  graph: Graph;
  selected: number;
  onSelectSkill: (index: number) => void;
  links: ConLink[];
  /** node index → Louvain community id. Empty for the relations variant. */
  community: Map<number, number>;
  focusCluster?: number | null;
  variant?: "map" | "relations";
  height?: number;
}) {
  const fgRef = useRef<ForceGraphMethods<FGNode, ConLink> | undefined>(undefined);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  const [hover, setHover] = useState<number | null>(null);
  const reduce = useMemo(prefersReducedMotion, []);

  // One node object per graph node, reused for the life of the graph so the
  // simulation keeps positions when the drawn links change.
  const nodes = useMemo<FGNode[]>(
    () => graph.nodes.map((n, i) => ({ id: i, name: n.name, support: n.support, deg: n.deg })),
    [graph.nodes],
  );

  // Fresh link objects each change (force-graph mutates source/target in place).
  const graphData = useMemo(
    () => ({ nodes, links: links.map((l) => ({ ...l })) }),
    [nodes, links],
  );

  // Adjacency over the *drawn* links, for the hover neighbourhood.
  const adj = useMemo(() => {
    const m = new Map<number, Set<number>>();
    const add = (a: number, b: number) => (m.get(a) ?? m.set(a, new Set()).get(a)!).add(b);
    for (const l of links) {
      add(l.source, l.target);
      add(l.target, l.source);
    }
    return m;
  }, [links]);

  // Labels are earned: the top slice by global degree, a fixed cut so they do
  // not flicker as the slider moves.
  const labelFloor = useMemo(() => {
    const d = nodes.map((n) => n.deg).filter((x) => x > 0).sort((a, b) => b - a);
    return d.length ? d[Math.min(d.length - 1, Math.floor(d.length * 0.12))] : Infinity;
  }, [nodes]);

  // Read every token once — getComputedStyle in the per-node paint loop is
  // 27k calls/second at 452 nodes · 60 fps.
  const palette = useMemo(
    () => ({
      trap: cssVar("--color-trap"),
      ink: cssVar("--color-ink-2"),
      ink3: cssVar("--color-ink-3"),
      rule: cssVar("--color-rule-strong"),
      font: cssVar("--font-sans") || "ui-sans-serif, system-ui, sans-serif",
      dark: matchMedia("(prefers-color-scheme: dark)").matches,
      dim: matchMedia("(prefers-color-scheme: dark)").matches
        ? "rgba(141,150,145,0.28)"
        : "rgba(94,106,104,0.25)",
      dimLink: matchMedia("(prefers-color-scheme: dark)").matches
        ? "rgba(65,70,66,0.35)"
        : "rgba(195,201,197,0.5)",
      rel: {
        COMPLEMENT: cssVar("--color-signal"),
        SUBSTITUTE: cssVar("--color-trap"),
        IMPLIES: cssVar("--color-relation-implies"),
        CONTESTED: cssVar("--color-ink-3"),
      } as Record<Relation, string>,
    }),
    [],
  );

  // Cluster tint: a low-chroma golden-angle ramp, one colour string built per
  // community rather than per node per frame. Position is the primary grouping
  // cue (the sim already sits a community together); colour only reinforces it,
  // so this does not compete with the three validated series hues reserved for
  // the relations legend. Revisited for both themes in T5.
  const clusterColour = useMemo(() => {
    const cache = new Map<number, string>();
    const L = palette.dark ? 63 : 52;
    return (idx: number) => {
      const c = community.get(idx);
      if (c === undefined) return palette.ink3;
      let hex = cache.get(c);
      if (!hex) {
        hex = `hsl(${((c + 1) * 137.508) % 360} 52% ${L}%)`;
        cache.set(c, hex);
      }
      return hex;
    };
  }, [community, palette]);

  const nodeColour = (n: FGNode) => {
    if (n.id === selected) return palette.trap;
    if (hover !== null && !(hover === n.id || adj.get(hover)?.has(n.id))) return palette.dim;
    if (variant === "relations") return palette.ink3;
    return clusterColour(n.id);
  };

  // --- width tracking ---
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // --- reheat when the drawn links change; no full re-layout ---
  useEffect(() => {
    fgRef.current?.d3ReheatSimulation();
  }, [links]);

  // Dev-only handles for the behaviour check in spike/measure.mjs. Stripped from
  // the production bundle by Vite's `import.meta.env.DEV` constant folding.
  // force-graph mutates the node objects in place, so __fgNodes carries live x/y.
  useEffect(() => {
    if (import.meta.env.DEV && variant === "map") {
      const w = window as unknown as { __fg?: unknown; __fgNodes?: unknown };
      w.__fg = fgRef.current;
      w.__fgNodes = nodes;
    }
  });

  // --- cluster focus: a gentle radial force — the chosen cluster is drawn to
  //     the centre, the rest pushed to an outer ring. It nudges velocity (not
  //     position) like a real d3 force and skips pinned nodes, so it neither
  //     fights the freeze nor jolts the layout. ---
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg || variant !== "map") return;
    if (focusCluster === null) {
      fg.d3Force("clusterLift", null);
    } else {
      fg.d3Force("clusterLift", (alpha: number) => {
        for (const n of nodes) {
          if (n.fx != null) continue; // respect the hover freeze
          const targetR = community.get(n.id) === focusCluster ? 0 : 520;
          const d = Math.hypot(n.x ?? 0, n.y ?? 0) || 1e-6;
          const k = ((targetR - d) / d) * alpha * 0.15;
          (n as { vx?: number }).vx = ((n as { vx?: number }).vx ?? 0) + (n.x ?? 0) * k;
          (n as { vy?: number }).vy = ((n as { vy?: number }).vy ?? 0) + (n.y ?? 0) * k;
        }
      });
    }
    fg.d3ReheatSimulation();
  }, [focusCluster, community, nodes, variant]);

  // --- freeze on pointer-over-canvas so anything under the cursor is a still
  //     target. Node-level hover then only drives the highlight. Freezing on
  //     the node alone is unreliable: the node can drift out from under the
  //     cursor before force-graph registers the hover. ---
  const freeze = () => {
    for (const m of nodes) {
      m.fx = m.x;
      m.fy = m.y;
    }
  };
  const thaw = () => {
    for (const m of nodes) {
      m.fx = undefined;
      m.fy = undefined;
    }
    if (!reduce) fgRef.current?.d3ReheatSimulation();
  };

  const onClick = (n: FGNode) => {
    const fg = fgRef.current;
    onSelectSkill(n.id);
    const ms = reduce ? 0 : 600;
    fg?.centerAt(n.x ?? 0, n.y ?? 0, ms);
    fg?.zoom(3.2, ms);
  };

  const dimNode = (n: FGNode) =>
    hover !== null && !(hover === n.id || adj.get(hover)?.has(n.id)) && n.id !== selected;

  return (
    <div
      ref={wrapRef}
      className="w-full"
      style={{ height }}
      onMouseEnter={reduce ? undefined : freeze}
      onMouseLeave={() => {
        setHover(null);
        if (!reduce) thaw();
      }}
    >
      <ForceGraph2D<FGNode, ConLink>
        ref={fgRef}
        graphData={graphData}
        width={width}
        height={height}
        backgroundColor="rgba(0,0,0,0)"
        nodeId="id"
        // Keep the render loop (and the pointer-area buffer) live even while the
        // graph is frozen on hover — otherwise the click after a hover lands on
        // a stale hit map and is swallowed.
        autoPauseRedraw={false}
        cooldownTime={reduce ? 4000 : Infinity}
        cooldownTicks={reduce ? 400 : Infinity}
        warmupTicks={reduce ? 140 : 40}
        // Warm forever: alpha never decays, so the sim keeps ticking. Heavy
        // velocity damping is what keeps that motion a barely-perceptible drift
        // rather than a jitter, and slow enough that a node stays clickable.
        // (react-force-graph-2d exposes no d3AlphaTarget, so this is the knob.)
        // Under reduced motion alpha decays and the graph settles to a stop.
        d3AlphaDecay={reduce ? 0.06 : 0}
        d3AlphaMin={0}
        d3VelocityDecay={reduce ? 0.4 : 0.72}
        enableNodeDrag={false}
        minZoom={0.4}
        maxZoom={12}
        nodeVisibility={(n) => variant === "map" || adj.has(n.id)}
        linkColor={(l) => {
          if (hover !== null) {
            const s = typeof l.source === "object" ? (l.source as FGNode).id : (l.source as number);
            const t = typeof l.target === "object" ? (l.target as FGNode).id : (l.target as number);
            if (s !== hover && t !== hover) return palette.dimLink;
          }
          if (variant === "relations" && l.kind) return palette.rel[l.kind];
          return palette.rule;
        }}
        linkWidth={(l) => (variant === "relations" ? (l.kind === "CONTESTED" ? 1 : 1.8) : 0.6)}
        linkDirectionalArrowLength={(l) => (variant === "relations" && l.kind === "IMPLIES" ? 3 : 0)}
        linkDirectionalArrowRelPos={1}
        onNodeHover={(n) => setHover(n ? (n as FGNode).id : null)}
        onNodeClick={onClick}
        onBackgroundClick={() => fgRef.current?.zoom(1, reduce ? 0 : 400)}
        nodeCanvasObject={(node, ctx, scale) => {
          const n = node as FGNode;
          const x = n.x ?? 0;
          const y = n.y ?? 0;
          const r = 1.6 + Math.sqrt(n.support) / 22;
          ctx.beginPath();
          ctx.arc(x, y, r + (n.id === selected ? 1.6 : 0), 0, 2 * Math.PI);
          ctx.fillStyle = nodeColour(n);
          ctx.globalAlpha = dimNode(n) ? 0.5 : 1;
          ctx.fill();
          if (n.id === selected) {
            ctx.lineWidth = 1.4 / scale;
            ctx.strokeStyle = palette.trap;
            ctx.stroke();
          }
          const near = hover !== null && (hover === n.id || adj.get(hover)?.has(n.id));
          const earned = n.deg >= labelFloor && scale > 1.1;
          if ((near || earned || n.id === selected) && scale > 0.7) {
            ctx.globalAlpha = dimNode(n) ? 0.35 : 1;
            ctx.fillStyle = palette.ink;
            ctx.font = `${11 / scale}px ${palette.font}`;
            ctx.fillText(n.name, x + r + 1.5 / scale, y + 3.5 / scale);
          }
          ctx.globalAlpha = 1;
        }}
        nodePointerAreaPaint={(node, colour, ctx) => {
          const n = node as FGNode;
          const r = 1.6 + Math.sqrt(n.support) / 22;
          ctx.fillStyle = colour;
          ctx.beginPath();
          ctx.arc(n.x ?? 0, n.y ?? 0, Math.max(r + 4, 7), 0, 2 * Math.PI);
          ctx.fill();
        }}
      />
    </div>
  );
}
