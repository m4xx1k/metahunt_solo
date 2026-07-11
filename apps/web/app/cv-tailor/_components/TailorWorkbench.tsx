"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { cvApi } from "@/lib/api/cv";
import { cvTailorApi, type BulletDiff, type TailorResult } from "@/lib/api/cv-tailor";
import { Button } from "@/ui/buttons/Button";

import { BulletDiffCard } from "./BulletDiffCard";
import { GuardDemoPanel } from "./GuardDemoPanel";
import { ResumePreview } from "./ResumePreview";

const EXAMPLES: { label: string; text: string }[] = [
  {
    label: "Backend / infra role",
    text: "Senior Backend Engineer — Node.js/NestJS microservices on AWS (ECS, SQS, Lambda), Elasticsearch search, PostgreSQL, Terraform, Docker. Own event-driven data pipelines at scale.",
  },
  {
    label: "Frontend role",
    text: "Frontend Engineer — React, Next.js, TypeScript, Tailwind CSS, React Query. Build polished product UIs and a shared component library.",
  },
  {
    label: "AI engineer role",
    text: "AI Engineer — build LLM pipelines on OpenAI/Gemini, RAG and vector search over Elasticsearch, structured outputs and tool calling. TypeScript.",
  },
];

function ledgerTechOf(r: TailorResult): string[] {
  const acc = new Set<string>();
  const add = (b: BulletDiff): void => b.sourceEntities.tech.forEach((t) => acc.add(t));
  add(r.resume.summary);
  r.resume.experience.forEach((e) => [...e.bullets, ...e.dropped].forEach(add));
  r.resume.projects.forEach((p) => [...p.bullets, ...p.dropped].forEach(add));
  return [...acc];
}

export function TailorWorkbench() {
  const search = useSearchParams();
  const cvParam = search.get("cv");
  const [sample, setSample] = useState<{ id: string; label: string } | null>(null);
  const [jobText, setJobText] = useState("");
  const [result, setResult] = useState<TailorResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Resolve the default CV from the seeded demo sample (skipped when ?cv= is set).
  useEffect(() => {
    if (cvParam) return;
    let cancelled = false;
    cvApi
      .samples()
      .then((samples) => {
        if (cancelled) return;
        const demo = samples.find((s) => /tailor/i.test(s.label)) ?? samples[0];
        if (demo) setSample({ id: demo.candidateId, label: demo.label });
      })
      .catch(() => {
        if (!cancelled) setError("could not load a demo CV — is the API running?");
      });
    return () => {
      cancelled = true;
    };
  }, [cvParam]);

  const candidateId = cvParam ?? sample?.id ?? null;
  const candidateLabel = cvParam ? "your CV" : (sample?.label ?? "");

  const runTailor = useCallback(
    async (text: string) => {
      if (!candidateId || !text.trim()) return;
      setBusy(true);
      setError(null);
      try {
        setResult(await cvTailorApi.tailor(candidateId, { jobText: text }));
      } catch (e) {
        setError(e instanceof Error ? e.message : "tailoring failed");
      } finally {
        setBusy(false);
      }
    },
    [candidateId],
  );

  const ledgerTech = result ? ledgerTechOf(result) : [];

  return (
    <div className="flex flex-col gap-10">
      <Hero />

      {/* Control panel */}
      <section className="flex flex-col gap-4 border border-border bg-bg-card p-6 shadow-brut-lg">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-lg font-bold text-text-primary">
            1 · Paste the job you&apos;re aiming at
          </h2>
          <span className="font-mono text-2xs uppercase tracking-wider text-text-muted">
            CV: {candidateLabel || "loading…"}
          </span>
        </div>
        <textarea
          value={jobText}
          onChange={(e) => setJobText(e.target.value)}
          placeholder="Paste a job description, or pick an example below…"
          rows={4}
          className="w-full resize-y border border-border bg-bg px-4 py-3 font-body text-sm text-text-primary placeholder:text-text-muted focus:border-border-strong focus:outline-none"
        />
        <div className="flex flex-wrap items-center gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex.label}
              type="button"
              onClick={() => setJobText(ex.text)}
              className="border border-border bg-bg-elev px-3 py-1.5 font-mono text-2xs uppercase tracking-wider text-text-secondary transition-colors hover:border-border-strong hover:text-accent"
            >
              {ex.label}
            </button>
          ))}
          <div className="ml-auto">
            <Button
              onClick={() => runTailor(jobText)}
              disabled={busy || !candidateId || !jobText.trim()}
            >
              {busy ? "Tailoring…" : "Tailor my CV →"}
            </Button>
          </div>
        </div>
        {error ? <p className="font-mono text-xs text-danger">{error}</p> : null}
      </section>

      {result ? (
        <>
          <GuaranteeBar result={result} />
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1.25fr_.9fr]">
            <div className="flex flex-col gap-8">
              <DiffColumn result={result} ledgerTech={ledgerTech} />
            </div>
            <div className="lg:sticky lg:top-6 lg:self-start">
              <ResumePreview result={result} />
            </div>
          </div>
        </>
      ) : null}

      <GuardDemoPanel />
    </div>
  );
}

function Hero() {
  return (
    <header className="flex flex-col gap-4 border-b border-border pb-8">
      <span className="w-fit bg-accent px-2 py-1 font-mono text-2xs font-bold uppercase tracking-wider text-bg">
        experiment · fact-locked
      </span>
      <h1 className="max-w-3xl font-display text-3xl font-bold leading-tight text-text-primary md:text-4xl">
        Tailor your CV to any job — <span className="text-accent">without inventing a word.</span>
      </h1>
      <p className="max-w-2xl font-body text-sm leading-relaxed text-text-secondary">
        Every other tool free-writes your resume and quietly invents employers, numbers, and tech
        you never touched. This one only <strong className="text-text-primary">selects</strong>,{" "}
        <strong className="text-text-primary">reorders</strong>, and{" "}
        <strong className="text-text-primary">rewords</strong> what your CV already proves — then
        checks every line so nothing drifts. You see the exact diff before anything is final.
      </p>
    </header>
  );
}

function GuaranteeBar({ result }: { result: TailorResult }) {
  const g = result.grounding;
  const stats = [
    { n: g.inventedFacts, label: "invented facts", tone: "text-success" },
    { n: g.shown, label: "bullets shown", tone: "text-text-primary" },
    { n: g.verbatim, label: "kept verbatim", tone: "text-text-primary" },
    { n: g.rephrased, label: "reworded + verified", tone: "text-accent-secondary" },
    { n: g.drift, label: "rewrites the guard blocked", tone: "text-danger" },
  ];
  return (
    <section className="flex flex-col gap-4 border border-success bg-bg-card p-6 shadow-brut-lg">
      <div className="flex items-center gap-3">
        <span className="font-display text-2xl text-success">✓</span>
        <p className="font-display text-base font-bold text-text-primary">
          0 invented facts. Every line below traces to your CV — tailored for{" "}
          <span className="text-accent">{result.target.label}</span>.
        </p>
      </div>
      <div className="flex flex-wrap gap-x-8 gap-y-3">
        {stats.map((s) => (
          <div key={s.label} className="flex items-baseline gap-2">
            <span className={`font-mono text-xl font-bold ${s.tone}`}>{s.n}</span>
            <span className="font-mono text-2xs uppercase tracking-wider text-text-muted">
              {s.label}
            </span>
          </div>
        ))}
      </div>
      {result.target.matchedSkills.length > 0 ? (
        <p className="font-mono text-2xs text-text-secondary">
          matched skills foregrounded: {result.target.matchedSkills.join(" · ")}
        </p>
      ) : null}
    </section>
  );
}

function DiffColumn({ result, ledgerTech }: { result: TailorResult; ledgerTech: string[] }) {
  return (
    <>
      <div className="flex flex-col gap-3">
        <SectionTitle n="2" title="Every change, shown as a diff" />
        <p className="font-body text-xs text-text-muted">
          Bullets are re-ranked for this role; less relevant ones are dropped (restore them below
          each role). Edit any line — the guard re-checks it live.
        </p>
      </div>

      <BulletGroup heading="Summary">
        <BulletDiffCard bullet={result.resume.summary} ledgerTech={ledgerTech} />
      </BulletGroup>

      {result.resume.experience.map((exp) => (
        <BulletGroup key={exp.id} heading={`${exp.role} — ${exp.org}`} sub={exp.dates}>
          {exp.bullets.map((b) => (
            <BulletDiffCard key={b.sourceBulletId} bullet={b} ledgerTech={ledgerTech} />
          ))}
          <DroppedList dropped={exp.dropped} />
        </BulletGroup>
      ))}

      {result.resume.projects.map((proj) => (
        <BulletGroup key={proj.id} heading={proj.name} sub={proj.meta}>
          {proj.bullets.map((b) => (
            <BulletDiffCard key={b.sourceBulletId} bullet={b} ledgerTech={ledgerTech} />
          ))}
          <DroppedList dropped={proj.dropped} />
        </BulletGroup>
      ))}
    </>
  );
}

function SectionTitle({ n, title }: { n: string; title: string }) {
  return (
    <h2 className="font-display text-lg font-bold text-text-primary">
      <span className="text-accent">{n} · </span>
      {title}
    </h2>
  );
}

function BulletGroup({
  heading,
  sub,
  children,
}: {
  heading: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2 border-b border-border pb-1">
        <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-text-secondary">
          {heading}
        </h3>
        {sub ? <span className="font-mono text-2xs text-text-muted">{sub}</span> : null}
      </div>
      {children}
    </div>
  );
}

function DroppedList({ dropped }: { dropped: BulletDiff[] }) {
  const [open, setOpen] = useState(false);
  if (dropped.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-fit font-mono text-2xs uppercase tracking-wider text-text-muted underline-offset-4 hover:text-accent hover:underline"
      >
        {open
          ? "hide"
          : `${dropped.length} less-relevant bullet${dropped.length > 1 ? "s" : ""} dropped — show`}
      </button>
      {open
        ? dropped.map((b) => (
            <p
              key={b.sourceBulletId}
              className="border-l-2 border-border pl-3 font-body text-xs leading-relaxed text-text-muted line-through decoration-text-muted/40"
            >
              {b.sourceText}
            </p>
          ))
        : null}
    </div>
  );
}
