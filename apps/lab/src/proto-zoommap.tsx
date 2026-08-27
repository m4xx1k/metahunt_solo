// Prototype A — a settled zoom map, Map-of-GitHub style.
//
// The whole graph, laid out ONCE and then frozen — no idle motion, no
// freeze-on-hover. Every Louvain community carries a big always-on label at its
// centroid; individual skill names fade in as you zoom, gated by degree so the
// density stays readable. Pan / scroll to zoom / search / click.

import { createRoot } from "react-dom/client";
import { useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D, { type ForceGraphMethods } from "react-force-graph-2d";
import { clusterHue, isDark, loadProto, type PNode } from "./proto-shared";

type FN = PNode & { x?: number; y?: number };

function App({ nodes, links }: { nodes: FN[]; links: { source: number; target: number; npmi: number }[] }) {
  const fg = useRef<ForceGraphMethods<FN, { source: number; target: number; npmi: number }> | undefined>(undefined);
  const [settled, setSettled] = useState(false);
  const dark = useMemo(isDark, []);

  // Community centroids for the big super-labels, recomputed after layout.
  const [supers, setSupers] = useState<{ name: string; x: number; y: number; c: number }[]>([]);
  const recomputeSupers = () => {
    const byC = new Map<number, FN[]>();
    for (const n of nodes) (byC.get(n.community) ?? byC.set(n.community, []).get(n.community)!).push(n);
    const out: { name: string; x: number; y: number; c: number }[] = [];
    for (const [c, list] of byC) {
      if (c < 0 || list.length < 4) continue;
      const x = list.reduce((s, n) => s + (n.x ?? 0), 0) / list.length;
      const y = list.reduce((s, n) => s + (n.y ?? 0), 0) / list.length;
      const name = [...list].sort((a, b) => b.support - a.support)[0].name;
      out.push({ name, x, y, c });
    }
    setSupers(out);
  };

  useEffect(() => {
    // spread the layout: strong repulsion + long links turn a disc into
    // visibly separate neighbourhoods (LinLog-ish, without a custom engine)
    const ch = fg.current?.d3Force("charge") as { strength?: (v: number) => void } | undefined;
    ch?.strength?.(-160);
    const lk = fg.current?.d3Force("link") as { distance?: (v: number) => void } | undefined;
    lk?.distance?.(45);
    fg.current?.d3ReheatSimulation();
    const fit = setTimeout(() => {
      setSettled(true);
      recomputeSupers();
      fg.current?.zoomToFit(700, 70);
    }, 3500);

    const bar = document.getElementById("bar")!;
    bar.innerHTML = `<b>proto A — zoom map</b> · settled, no motion &nbsp;`;
    const input = document.createElement("input");
    input.placeholder = "search skill…";
    input.oninput = () => {
      const q = input.value.trim().toLowerCase();
      if (!q) return;
      const hit = nodes.find((n) => n.name.toLowerCase().startsWith(q));
      if (hit) {
        fg.current?.centerAt(hit.x ?? 0, hit.y ?? 0, 500);
        fg.current?.zoom(4, 500);
      }
    };
    bar.appendChild(input);
    return () => clearTimeout(fit);
  }, [nodes]);

  const degFloor = useMemo(() => {
    const d = [...nodes].map((n) => n.deg).sort((a, b) => b - a);
    return d[Math.floor(d.length * 0.06)] ?? 0;
  }, [nodes]);

  return (
    <ForceGraph2D<FN, { source: number; target: number; npmi: number }>
      ref={fg}
      graphData={{ nodes, links }}
      width={window.innerWidth}
      height={window.innerHeight}
      backgroundColor="#0f0f10"
      nodeId="idx"
      warmupTicks={320}
      cooldownTicks={0}
      d3VelocityDecay={0.35}
      enableNodeDrag={false}
      minZoom={0.2}
      maxZoom={9}
      onEngineStop={() => {
        if (!settled) {
          setSettled(true);
          recomputeSupers();
          fg.current?.zoomToFit(600, 60);
        }
      }}
      linkColor={() => (dark ? "rgba(120,120,130,0.10)" : "rgba(90,90,100,0.12)")}
      linkWidth={0.4}
      linkVisibility={() => settled}
      onNodeClick={(n) => {
        const p = document.getElementById("pick")!;
        p.textContent = `${n.name}\n${n.support.toLocaleString()} positions · degree ${n.deg}\ncluster #${n.community}`;
        fg.current?.centerAt(n.x ?? 0, n.y ?? 0, 500);
        fg.current?.zoom(5, 500);
      }}
      nodeCanvasObject={(n, ctx, scale) => {
        const r = 1.2 + Math.sqrt(n.support) / 26;
        ctx.beginPath();
        ctx.arc(n.x ?? 0, n.y ?? 0, r, 0, 2 * Math.PI);
        ctx.fillStyle = clusterHue(n.community, dark);
        ctx.fill();
        // individual labels: earned by degree, fade in with zoom
        const show = (scale > 2.2 && n.deg >= degFloor) || scale > 5;
        if (show) {
          ctx.fillStyle = dark ? "rgba(231,231,231,0.9)" : "rgba(20,20,20,0.9)";
          ctx.font = `${10 / scale}px ui-sans-serif, system-ui, sans-serif`;
          ctx.fillText(n.name, (n.x ?? 0) + r + 1.5 / scale, (n.y ?? 0) + 3 / scale);
        }
      }}
      onRenderFramePost={(ctx, scale) => {
        // big always-on cluster super-labels
        if (scale > 6) return;
        ctx.save();
        ctx.textAlign = "center";
        for (const s of supers) {
          ctx.font = `600 ${Math.min(22, 13 + 40 / scale) / scale}px ui-sans-serif, system-ui, sans-serif`;
          ctx.fillStyle = clusterHue(s.c, dark);
          ctx.globalAlpha = scale > 3 ? 0.35 : 0.9;
          ctx.fillText(s.name.toUpperCase(), s.x, s.y);
        }
        ctx.restore();
      }}
    />
  );
}

const { nodes, edges } = await loadProto(0.3);
const kept = edges.filter((e) => e.npmi >= 0.3);
const links = kept.map((e) => ({ source: e.a, target: e.b, npmi: e.npmi }));
createRoot(document.getElementById("root")!).render(<App nodes={nodes as FN[]} links={links} />);
