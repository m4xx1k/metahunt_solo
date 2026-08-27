// Prototype C — ego graph, Connected-Papers style.
//
// The full 452-node graph is never shown. You always see one skill at the
// centre plus its ~12 strongest companions and the links among them — ~13
// nodes, every one labelled, laid out and then still. Click a companion and the
// view animates to a new neighbourhood centred on it. Breadcrumbs walk back.

import { createRoot } from "react-dom/client";
import { useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D, { type ForceGraphMethods } from "react-force-graph-2d";
import { clusterHue, isDark, loadProto, type PEdge, type PNode } from "./proto-shared";

const RING = 12;

type FN = { idx: number; name: string; support: number; community: number; center: boolean; x?: number; y?: number };
type FL = { source: number; target: number; p: number };

function build(center: number, nodes: PNode[], adj: Map<number, PEdge[]>) {
  const neigh = (adj.get(center) ?? [])
    .map((e) => ({
      other: e.a === center ? e.b : e.a,
      p: e.a === center ? e.pBgivenA : e.pAgivenB,
      pairs: e.pairs,
    }))
    .filter((x) => x.pairs >= 10)
    .sort((a, b) => b.p - a.p)
    .slice(0, RING);

  const ids = new Set<number>([center, ...neigh.map((n) => n.other)]);
  const fn: FN[] = [...ids].map((i) => ({
    idx: i,
    name: nodes[i].name,
    support: nodes[i].support,
    community: nodes[i].community,
    center: i === center,
  }));
  const fl: FL[] = [];
  for (const i of ids) {
    for (const e of adj.get(i) ?? []) {
      const o = e.a === i ? e.b : e.a;
      if (o > i && ids.has(o)) fl.push({ source: i, target: o, p: Math.max(e.pBgivenA, e.pAgivenB) });
    }
  }
  return { nodes: fn, links: fl };
}

function App({ nodes, adj }: { nodes: PNode[]; adj: Map<number, PEdge[]> }) {
  const fg = useRef<ForceGraphMethods<FN, FL> | undefined>(undefined);
  const dark = useMemo(isDark, []);
  const [center, setCenter] = useState(() => Math.max(0, nodes.findIndex((n) => n.name === "React")));
  const [trail, setTrail] = useState<number[]>([]);
  const data = useMemo(() => build(center, nodes, adj), [center, nodes, adj]);

  useEffect(() => {
    document.getElementById("bar")!.innerHTML = `<b>proto C — ego graph</b> · ${nodes[center].name} + ${data.nodes.length - 1} companions &nbsp;`;
    const input = document.createElement("input");
    input.placeholder = "jump to skill…";
    input.onkeydown = (e) => {
      if (e.key !== "Enter") return;
      const q = input.value.trim().toLowerCase();
      const hit = nodes.findIndex((n) => n.name.toLowerCase().startsWith(q));
      if (hit >= 0) go(hit);
    };
    document.getElementById("bar")!.appendChild(input);

    const cr = document.getElementById("crumbs")!;
    cr.innerHTML = "";
    [...trail, center].forEach((i, k, arr) => {
      const a = document.createElement("a");
      a.textContent = nodes[i].name;
      a.onclick = () => {
        setTrail(arr.slice(0, k));
        setCenter(i);
      };
      cr.appendChild(a);
      if (k < arr.length - 1) cr.appendChild(document.createTextNode("→ "));
    });
  }, [center, trail, nodes, data.nodes.length]);

  const go = (i: number) => {
    if (i === center) return;
    setTrail((t) => [...t, center]);
    setCenter(i);
  };

  useEffect(() => {
    const ch = fg.current?.d3Force("charge") as { strength?: (v: number) => void } | undefined;
    ch?.strength?.(-900);
    const lk = fg.current?.d3Force("link") as { distance?: (v: number) => void } | undefined;
    lk?.distance?.(120);
    fg.current?.d3ReheatSimulation();
    const t = setTimeout(() => {
      fg.current?.zoomToFit(500, 40);
      setTimeout(() => {
        const z = fg.current?.zoom() ?? 1;
        if (z > 1.8) fg.current?.zoom(1.8, 250);
        else if (z < 0.9) fg.current?.zoom(0.9, 250);
      }, 550);
    }, 500);
    return () => clearTimeout(t);
  }, [center]);

  return (
    <ForceGraph2D<FN, FL>
      ref={fg}
      graphData={data}
      width={window.innerWidth}
      height={window.innerHeight}
      backgroundColor="#0f0f10"
      nodeId="idx"
      warmupTicks={80}
      cooldownTicks={120}
      d3VelocityDecay={0.45}
      enableNodeDrag={false}
      minZoom={0.4}
      maxZoom={2}
      linkColor={() => (dark ? "rgba(150,150,160,0.35)" : "rgba(80,80,90,0.4)")}
      linkWidth={(l) => 0.4 + l.p * 2}
      onNodeClick={(n) => go(n.idx)}
      nodeCanvasObject={(n, ctx, scale) => {
        const r = n.center ? 9 : 6;
        ctx.beginPath();
        ctx.arc(n.x ?? 0, n.y ?? 0, r, 0, 2 * Math.PI);
        ctx.fillStyle = n.center ? (dark ? "#e06c39" : "#c2410c") : clusterHue(n.community, dark);
        ctx.fill();
        ctx.fillStyle = dark ? "rgba(233,235,232,0.98)" : "rgba(20,20,20,0.98)";
        ctx.font = `${n.center ? 600 : 500} ${Math.max(12, 13 / scale)}px ui-sans-serif, system-ui, sans-serif`;
        ctx.fillText(n.name, (n.x ?? 0) + r + 3, (n.y ?? 0) + 4);
      }}
    />
  );
}

const { nodes, adj } = await loadProto(0.3);
createRoot(document.getElementById("root")!).render(<App nodes={nodes} adj={adj} />);
