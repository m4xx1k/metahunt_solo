// Prototype B — text nodes, Every-Noise-at-Once style.
//
// No dots. Each node IS its name, sized by support, tinted by Louvain cluster.
// A collision force sized to each label's box means names never overlap. Hard
// filter to the top ~80 skills so it stays legible. Layout settles once, then
// freezes — no idle motion. Hover lights the co-occurring names; click picks.

import { createRoot } from "react-dom/client";
import { useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D, { type ForceGraphMethods } from "react-force-graph-2d";
import { clusterHue, isDark, loadProto, type PNode } from "./proto-shared";

type FN = PNode & { x?: number; y?: number; w?: number; h?: number };

function App({ nodes, adj }: { nodes: FN[]; adj: Map<number, number[]> }) {
  const fg = useRef<ForceGraphMethods<FN, never> | undefined>(undefined);
  const dark = useMemo(isDark, []);
  const [hover, setHover] = useState<number | null>(null);
  const [settled, setSettled] = useState(false);

  const maxSup = useMemo(() => Math.max(...nodes.map((n) => n.support)), [nodes]);
  const fontPx = (n: FN) => 10 + 20 * Math.sqrt(n.support / maxSup);

  useEffect(() => {
    document.getElementById("bar")!.innerHTML =
      `<b>proto B — text nodes</b> · ${nodes.length} skills · no overlap · no motion`;
    // measure label boxes once, in canvas space (scale 1)
    const c = document.createElement("canvas").getContext("2d")!;
    for (const n of nodes) {
      c.font = `${fontPx(n)}px ui-sans-serif, system-ui, sans-serif`;
      n.w = c.measureText(n.name).width + 8;
      n.h = fontPx(n) + 6;
    }
    // collide force sized to the label box
    const f = fg.current;
    f?.d3Force("collide", ((alpha: number) => {
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          const dx = (b.x ?? 0) - (a.x ?? 0);
          const dy = (b.y ?? 0) - (a.y ?? 0);
          const ox = (a.w! + b.w!) / 2 - Math.abs(dx) + 2;
          const oy = (a.h! + b.h!) / 2 - Math.abs(dy) + 2;
          if (ox > 0 && oy > 0) {
            if (ox < oy) {
              const s = (dx > 0 ? 1 : -1) * ox * 0.5 * alpha;
              a.x = (a.x ?? 0) - s;
              b.x = (b.x ?? 0) + s;
            } else {
              const s = (dy > 0 ? 1 : -1) * oy * 0.5 * alpha;
              a.y = (a.y ?? 0) - s;
              b.y = (b.y ?? 0) + s;
            }
          }
        }
      }
    }) as never);
    f?.d3ReheatSimulation();
    const t = setTimeout(() => {
      f?.zoomToFit(700, 90);
      setSettled(true);
    }, 2500);
    return () => clearTimeout(t);
  }, [nodes, fontPx]);

  return (
    <ForceGraph2D<FN, never>
      ref={fg}
      graphData={{ nodes, links: [] }}
      width={window.innerWidth}
      height={window.innerHeight}
      backgroundColor="#0f0f10"
      nodeId="idx"
      warmupTicks={200}
      cooldownTicks={0}
      d3VelocityDecay={0.5}
      enableNodeDrag={false}
      minZoom={0.3}
      maxZoom={2}
      onEngineStop={() => {
        if (!settled) {
          setSettled(true);
          fg.current?.zoomToFit(600, 120);
          setTimeout(() => {
            if ((fg.current?.zoom() ?? 1) > 1) fg.current?.zoom(1, 300);
          }, 650);
        }
      }}
      onNodeHover={(n) => setHover(n ? (n as FN).idx : null)}
      onNodeClick={(n) => {
        document.getElementById("pick")!.textContent =
          `${n.name}\n${n.support.toLocaleString()} positions · degree ${n.deg}`;
      }}
      nodePointerAreaPaint={(n, colour, ctx) => {
        ctx.fillStyle = colour;
        ctx.fillRect((n.x ?? 0) - (n.w ?? 20) / 2, (n.y ?? 0) - (n.h ?? 14) / 2, n.w ?? 20, n.h ?? 14);
      }}
      nodeCanvasObject={(n, ctx, scale) => {
        const near =
          hover === null || hover === n.idx || (adj.get(hover) ?? []).includes(n.idx);
        ctx.font = `${near ? 600 : 400} ${fontPx(n)}px ui-sans-serif, system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.globalAlpha = near ? 1 : 0.22;
        ctx.fillStyle = clusterHue(n.community, dark);
        ctx.fillText(n.name, n.x ?? 0, n.y ?? 0);
        ctx.globalAlpha = 1;
        void scale;
      }}
    />
  );
}

const { nodes, adj } = await loadProto(0.3);
// top ~80 by support
const top = [...nodes].sort((a, b) => b.support - a.support).slice(0, 80);
const keep = new Set(top.map((n) => n.idx));
const adjIdx = new Map<number, number[]>();
for (const n of top) {
  adjIdx.set(
    n.idx,
    (adj.get(n.idx) ?? []).map((e) => (e.a === n.idx ? e.b : e.a)).filter((x) => keep.has(x)),
  );
}
createRoot(document.getElementById("root")!).render(<App nodes={top as FN[]} adj={adjIdx} />);
