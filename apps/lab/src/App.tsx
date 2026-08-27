import { useMemo, useState } from "react";
import raw from "./data/graph.json";
import curatedRaw from "./data/pair-relations.json";
import type { Graph, PairRelations } from "./types";
import { buildAdjacency, fmt } from "./lib/graph";
import { MapView } from "./views/Map";
import { RelationsView } from "./views/Relations";
import { Roles } from "./views/Roles";
import { Faq } from "./views/Faq";
import { SkillDossier } from "./views/SkillDossier";
import { panel } from "./ui";

const graph = raw as unknown as Graph;
const curated = curatedRaw as unknown as PairRelations;

export default function App() {
  const [selected, setSelected] = useState(() =>
    Math.max(0, graph.nodes.findIndex((n) => n.name === "React")),
  );
  const adj = useMemo(() => buildAdjacency(graph.edges), []);

  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

  const openSkill = (index: number) => {
    setSelected(index);
    scrollTo("graph");
  };

  return (
    <div className="lab-shell">
      <main className="relative mx-auto max-w-[1440px] px-5 pb-24">
        <header className="lab-hero mt-5 border border-rule px-5 py-6 sm:px-8 sm:py-8">
          <div className="relative max-w-3xl">
            <p className="font-mono text-[0.68rem] tracking-[0.18em] text-signal">METAHUNT RESEARCH LAB · 01</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.035em] sm:text-5xl">What skills travel together?</h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-2 sm:text-base">
              Explore the patterns in real job requirements. Select any skill to see the evidence around it — not a course plan, not a prediction.
            </p>
          </div>
          <dl className="relative mt-7 flex flex-wrap gap-x-7 gap-y-3 border-t border-rule pt-4 font-mono text-[0.68rem] text-ink-3">
            <Metric value={fmt(graph.provenance.nPositions)} label="positions" />
            <Metric value={String(graph.nodes.length)} label="skills" />
            <Metric value={fmt(graph.edges.length)} label="observed links" />
            <Metric value={`${graph.provenance.corpusStart} → ${graph.provenance.corpusEnd}`} label="snapshot" />
          </dl>
        </header>

        <section id="graph" className="scroll-mt-5 pt-7">
          <div className="mb-5">
            <p className="font-mono text-[0.67rem] tracking-[0.14em] text-signal">EXPLORE</p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight">Skill map</h2>
          </div>
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(20rem,1fr)]">
            <div className="min-w-0"><MapView graph={graph} selected={selected} onSelectSkill={setSelected} onOpenFaq={() => scrollTo("questions")} /></div>
            <aside aria-label="Selected skill dossier" className="min-w-0 lg:sticky lg:top-5 lg:max-h-[calc(100vh-2.5rem)] lg:overflow-y-auto lg:pr-1">
              <SkillDossier graph={graph} curated={curated} adj={adj} selected={selected} onSelect={setSelected} onOpenFaq={() => scrollTo("questions")} variant="sidebar" />
            </aside>
          </div>
        </section>

        <section id="evidence" className="mt-16 scroll-mt-5">
          <div className="mb-5 max-w-2xl">
            <p className="font-mono text-[0.67rem] tracking-[0.14em] text-signal">EVIDENCE, NOT DECORATION</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">How to read the map</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-2">The visual comes first. The assumptions, role cuts, and hand-reviewed labels live here when you want to interrogate them.</p>
          </div>
          <EvidenceSection title="How this map was built" subtitle="Corpus, thresholds, and limits" open><Methodology /></EvidenceSection>
          <EvidenceSection title="Explore by role" subtitle="What a specific role asks for"><Roles graph={graph} onSelectSkill={openSkill} onOpenFaq={() => scrollTo("questions")} /></EvidenceSection>
          <EvidenceSection title="What strong links mean" subtitle="Hand-reviewed: complement, substitute, implies"><RelationsView graph={graph} curated={curated} onSelectSkill={openSkill} /></EvidenceSection>
          <div id="questions" className="scroll-mt-5"><EvidenceSection title="Questions & limits" subtitle="Plain-language definitions"><Faq /></EvidenceSection></div>
        </section>
      </main>
    </div>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return <div><dt className="text-ink">{value}</dt><dd className="mt-0.5">{label}</dd></div>;
}

function EvidenceSection({ title, subtitle, open = false, children }: { title: string; subtitle: string; open?: boolean; children: React.ReactNode }) {
  return <details className={`${panel} mb-3 group`} open={open}>
    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-4 sm:px-5"><span><span className="block text-sm font-semibold">{title}</span><span className="mt-0.5 block text-xs text-ink-3">{subtitle}</span></span><span className="font-mono text-xs text-signal transition-transform group-open:rotate-45">+</span></summary>
    <div className="border-t border-rule px-4 py-5 sm:px-5">{children}</div>
  </details>;
}

function Methodology() {
  const { contract, provenance, sources } = graph;
  return (
    <>
      <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-5 gap-y-1.5 text-[0.8rem]">
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
    </>
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
