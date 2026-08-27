// T3 engine spike — throwaway. Proves (or fails) react-force-graph-2d at the
// constellation's worst case: NPMI >= 0.1, whole graph drifting, labels on the
// high-degree nodes, simulation never allowed to cool. Delete after T4.
//
//   pnpm --filter @metahunt/lab lab   →   http://localhost:4200/spike.html
//
// Reads window.__spikeResult / window.__spikeDone for automated capture.

import { createRoot } from "react-dom/client";
import { useMemo, useRef, useState } from "react";
import ForceGraph2D, { type ForceGraphMethods } from "react-force-graph-2d";

const NPMI_FLOOR = 0.1; // worst case from the measurements table
const WARMUP_FRAMES = 180;
const SAMPLE_FRAMES = 420;

type Core = { nodes: { name: string }[] };
type Edges = { edges: [number, number, number, number, number, number, number, number][] };

type SNode = { id: number; name: string; deg: number };
type SLink = { source: number; target: number };

const hud = (t: string) => {
  const el = document.getElementById("hud");
  if (el) el.textContent = t;
};

function Spike({ nodes, links }: { nodes: SNode[]; links: SLink[] }) {
  const fgRef = useRef<ForceGraphMethods<SNode, SLink> | undefined>(undefined);
  const [done, setDone] = useState(false);
  const frames = useRef<number[]>([]);
  const labelAbove = useMemo(() => {
    const degs = nodes.map((n) => n.deg).sort((a, b) => b - a);
    return degs[Math.floor(degs.length * 0.15)] ?? 0; // label the top ~15% by degree
  }, [nodes]);

  const onFrame = () => {
    const now = performance.now();
    const arr = frames.current;
    arr.push(now);
    const n = arr.length;
    if (n === WARMUP_FRAMES) {
      hud("warmup done — sampling…");
    }
    if (n > WARMUP_FRAMES && n <= WARMUP_FRAMES + SAMPLE_FRAMES) {
      const live = n - WARMUP_FRAMES;
      if (live % 60 === 0) {
        const span = now - arr[WARMUP_FRAMES];
        hud(`sampling ${live}/${SAMPLE_FRAMES}   ~${((live / span) * 1000).toFixed(1)} fps`);
      }
    }
    if (n === WARMUP_FRAMES + SAMPLE_FRAMES) {
      const sample = arr.slice(WARMUP_FRAMES);
      const deltas: number[] = [];
      for (let i = 1; i < sample.length; i++) deltas.push(sample[i] - sample[i - 1]);
      deltas.sort((a, b) => a - b);
      const p = (q: number) => deltas[Math.floor(deltas.length * q)];
      const span = sample[sample.length - 1] - sample[0];
      const fps = ((sample.length - 1) / span) * 1000;
      const result = {
        engine: "react-force-graph-2d",
        nodes: nodes.length,
        links: links.length,
        frames: sample.length,
        fps: +fps.toFixed(1),
        frameMsP50: +p(0.5).toFixed(2),
        frameMsP95: +p(0.95).toFixed(2),
        frameMsMax: +deltas[deltas.length - 1].toFixed(2),
      };
      (window as unknown as { __spikeResult: unknown }).__spikeResult = result;
      (window as unknown as { __spikeDone: boolean }).__spikeDone = true;
      hud(
        `DONE  ${result.nodes} nodes · ${result.links} links\n` +
          `fps (warm):   ${result.fps}\n` +
          `frame ms p50: ${result.frameMsP50}\n` +
          `frame ms p95: ${result.frameMsP95}\n` +
          `frame ms max: ${result.frameMsMax}\n` +
          `gate: >= 60 fps  →  ${result.fps >= 60 ? "PASS" : "FAIL"}`,
      );
      setDone(true);
    }
  };

  return (
    <ForceGraph2D<SNode, SLink>
      ref={fgRef}
      graphData={{ nodes, links }}
      width={window.innerWidth}
      height={window.innerHeight}
      backgroundColor="#0f0f10"
      cooldownTime={Infinity}
      cooldownTicks={Infinity}
      d3AlphaDecay={0}
      d3AlphaMin={0}
      d3VelocityDecay={0.28}
      warmupTicks={0}
      enableNodeDrag={false}
      linkColor={() => "rgba(120,120,130,0.22)"}
      linkWidth={0.5}
      nodeRelSize={3}
      onRenderFramePost={done ? undefined : onFrame}
      nodeCanvasObject={(node, ctx, scale) => {
        const n = node as SNode & { x?: number; y?: number };
        const r = 2 + Math.sqrt(n.deg) / 3;
        ctx.beginPath();
        ctx.arc(n.x ?? 0, n.y ?? 0, r / scale + 0.6, 0, 2 * Math.PI);
        ctx.fillStyle = "#4fd1c5";
        ctx.fill();
        if (n.deg >= labelAbove) {
          ctx.fillStyle = "rgba(231,231,231,0.85)";
          ctx.font = `${11 / scale}px ui-sans-serif, system-ui, sans-serif`;
          ctx.fillText(n.name, (n.x ?? 0) + r / scale + 1, (n.y ?? 0) + 3 / scale);
        }
      }}
    />
  );
}

async function boot() {
  hud("loading artifact…");
  const [core, edges] = await Promise.all([
    fetch("/data/core.json").then((r) => r.json() as Promise<Core>),
    fetch("/data/edges.json").then((r) => r.json() as Promise<Edges>),
  ]);

  const kept = edges.edges.filter((e) => e[6] >= NPMI_FLOOR);
  const deg = new Map<number, number>();
  for (const [a, b] of kept) {
    deg.set(a, (deg.get(a) ?? 0) + 1);
    deg.set(b, (deg.get(b) ?? 0) + 1);
  }
  const nodes: SNode[] = [...deg.keys()]
    .sort((a, b) => a - b)
    .map((i) => ({ id: i, name: core.nodes[i].name, deg: deg.get(i) ?? 0 }));
  const links: SLink[] = kept.map(([a, b]) => ({ source: a, target: b }));

  hud(`mounting  ${nodes.length} nodes · ${links.length} links  (NPMI >= ${NPMI_FLOOR})`);
  createRoot(document.getElementById("root")!).render(<Spike nodes={nodes} links={links} />);
}

void boot();
