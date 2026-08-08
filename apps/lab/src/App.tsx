import { useMemo, useState } from "react";
import raw from "./data/graph.json";
import type { Graph } from "./types";
import { buildAdjacency, fmt } from "./lib/graph";
import { MapView } from "./views/Map";
import { Roles } from "./views/Roles";
import { Skills } from "./views/Skills";
import { tab } from "./ui";

const graph = raw as unknown as Graph;

const TABS = [
  { key: "skills", text: "Skill neighbourhood" },
  { key: "roles", text: "Roles" },
  { key: "map", text: "Map" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const isTab = (v: string): v is TabKey => TABS.some((t) => t.key === v);

export default function App() {
  // The view lives in the hash so a reload, a bookmark, or a link to someone
  // else lands on the same screen.
  const [view, setViewState] = useState<TabKey>(() => {
    const h = location.hash.slice(1);
    return isTab(h) ? h : "skills";
  });

  const setView = (v: TabKey) => {
    setViewState(v);
    location.hash = v;
  };
  const [selected, setSelected] = useState(() =>
    Math.max(0, graph.nodes.findIndex((n) => n.name === "Java")),
  );

  const adj = useMemo(() => buildAdjacency(graph.edges), []);

  const openSkill = (index: number) => {
    setSelected(index);
    setView("skills");
  };

  return (
    <div className="mx-auto max-w-[1180px] px-5 pb-24">
      <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-b border-rule pt-7 pb-4">
        <h1 className="font-semibold tracking-tight">
          metahunt lab <span className="font-normal text-ink-3">· skill graph v0</span>
        </h1>
        <p className="font-mono text-[0.72rem] tracking-wide text-ink-3">
          {fmt(graph.provenance.nPositions)} positions · {graph.provenance.corpusStart} →{" "}
          {graph.provenance.corpusEnd} · {graph.nodes.length} skills · {fmt(graph.edges.length)} edges
        </p>
      </header>

      <nav className="flex gap-1.5 py-4">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={tab(view === t.key)}
            aria-pressed={view === t.key}
            onClick={() => setView(t.key)}
          >
            {t.text}
          </button>
        ))}
      </nav>

      {view === "skills" ? (
        <Skills graph={graph} adj={adj} selected={selected} onSelect={setSelected} />
      ) : null}
      {view === "roles" ? <Roles graph={graph} onSelectSkill={openSkill} /> : null}
      {view === "map" ? <MapView graph={graph} onSelectSkill={openSkill} /> : null}

      <Methodology />
    </div>
  );
}

function Methodology() {
  const { contract, provenance, sources } = graph;
  return (
    <details className="mt-10 border-t border-rule pt-4">
      <summary className="cursor-pointer font-mono text-[0.72rem] uppercase tracking-wider text-ink-3">
        Methodology and limits
      </summary>

      <dl className="mt-4 grid grid-cols-[max-content_minmax(0,1fr)] gap-x-5 gap-y-1.5 text-[0.8rem]">
        <Row k="Grain" v={contract.grain} />
        <Row k="Aggregation" v={contract.positionSkillRule} />
        <Row k="Eligibility" v={contract.skillEligibility} />
        <Row k="Layer" v={contract.requirementLayer} />
        <Row
          k="Thresholds"
          v={`skill ≥ ${contract.minSkillSupport} · pair ≥ ${contract.minPairSupport} · role ≥ ${contract.minRolePositions}`}
        />
        <Row
          k="Corpus"
          v={`${fmt(provenance.postings)} postings → ${fmt(provenance.positions)} positions → ${fmt(
            provenance.nPositions,
          )} eligible · ${sources.map((s) => `${s.code} ${fmt(s.positions)}`).join(" · ")}`}
        />
        <Row k="Snapshot" v={`${provenance.snapshot} · built ${provenance.generatedAt.slice(0, 10)}`} />
        <Row k="Liveness" v={contract.livenessClaim} />
      </dl>

      <div className="mt-4 max-w-[64ch] border-l-2 border-trap pl-3.5 text-[0.82rem] leading-relaxed text-ink-2">
        <p>
          Observed association in this corpus — two job boards over 14 weeks — not the labour market,
          not causation, and no claim that any vacancy is still open. The required/optional split is
          an LLM output with no golden set behind it (MET-24, MET-76, MET-77), so every number here
          inherits that error. Prompt and taxonomy versions are not recorded per row, so a version
          artifact cannot be ruled out.
        </p>
        <p className="mt-2">
          A strong link is not advice: the strongest surviving edge in this graph is
          TensorFlow/PyTorch, which are substitutes. The maths is right; &quot;learn them
          together&quot; would be wrong.
        </p>
      </div>
    </details>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <>
      <dt className="font-mono text-[0.7rem] uppercase tracking-wide text-ink-3">{k}</dt>
      <dd className="m-0 text-ink-2">{v}</dd>
    </>
  );
}
