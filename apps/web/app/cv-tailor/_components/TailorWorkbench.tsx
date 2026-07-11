"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { cvApi } from "@/lib/api/cv";
import { cvTailorApi, type BulletDiff, type TailorResult } from "@/lib/api/cv-tailor";
import { Button } from "@/ui/buttons/Button";

import { BulletDiffCard } from "./BulletDiffCard";
import { GuardDemoPanel } from "./GuardDemoPanel";
import { ResumePreview } from "./ResumePreview";
import { VacancyPicker } from "./VacancyPicker";

type Cv = { id: string; label: string };

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

  const [cvMode, setCvMode] = useState<"demo" | "upload">("demo");
  const [demoCv, setDemoCv] = useState<Cv | null>(null);
  const [uploadedCv, setUploadedCv] = useState<Cv | null>(null);
  const [uploading, setUploading] = useState(false);

  const [targetMode, setTargetMode] = useState<"vacancy" | "paste">("vacancy");
  const [selectedVacancy, setSelectedVacancy] = useState<Cv | null>(null);
  const [jobText, setJobText] = useState("");

  const [result, setResult] = useState<TailorResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [needsPrepare, setNeedsPrepare] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Resolve the seeded demo CV (skipped when ?cv= pins an explicit candidate).
  useEffect(() => {
    if (cvParam) return;
    let cancelled = false;
    cvApi
      .samples()
      .then((samples) => {
        if (cancelled) return;
        const demo = samples.find((s) => /tailor/i.test(s.label)) ?? samples[0];
        if (demo) setDemoCv({ id: demo.candidateId, label: demo.label });
      })
      .catch(() => {
        if (!cancelled) setError("could not load the demo CV — is the API running?");
      });
    return () => {
      cancelled = true;
    };
  }, [cvParam]);

  const cv: Cv | null = cvParam
    ? { id: cvParam, label: "your CV" }
    : cvMode === "upload"
      ? uploadedCv
      : demoCv;
  const candidateId = cv?.id ?? null;

  const resetTailorState = (): void => {
    setSelectedVacancy(null);
    setResult(null);
    setNeedsPrepare(false);
    setError(null);
  };

  const onUpload = async (file: File): Promise<void> => {
    setUploading(true);
    setError(null);
    try {
      const res = await cvApi.uploadFile(file);
      setUploadedCv({ id: res.candidateId, label: file.name });
      setCvMode("upload");
      resetTailorState();
    } catch (e) {
      setError(e instanceof Error ? e.message : "upload failed");
    } finally {
      setUploading(false);
    }
  };

  const runTailor = useCallback(async () => {
    if (!candidateId) return;
    const body =
      targetMode === "vacancy"
        ? selectedVacancy
          ? { vacancyId: selectedVacancy.id }
          : null
        : jobText.trim()
          ? { jobText }
          : null;
    if (!body) return;
    setBusy(true);
    setError(null);
    setNeedsPrepare(false);
    try {
      setResult(await cvTailorApi.tailor(candidateId, body));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "tailoring failed";
      if (/no structured resume/i.test(msg)) setNeedsPrepare(true);
      else setError(msg);
    } finally {
      setBusy(false);
    }
  }, [candidateId, targetMode, selectedVacancy, jobText]);

  const prepareAndTailor = useCallback(async () => {
    if (!candidateId) return;
    setPreparing(true);
    setError(null);
    try {
      await cvTailorApi.structure(candidateId);
      setNeedsPrepare(false);
      await runTailor();
    } catch (e) {
      setError(e instanceof Error ? e.message : "could not prepare this CV");
    } finally {
      setPreparing(false);
    }
  }, [candidateId, runTailor]);

  const canTailor =
    !!candidateId && (targetMode === "vacancy" ? !!selectedVacancy : !!jobText.trim());
  const ledgerTech = result ? ledgerTechOf(result) : [];

  return (
    <div className="flex flex-col gap-10">
      <Hero />

      {/* 1 · CV source */}
      <section className="flex flex-col gap-4 border border-border bg-bg-card p-6 shadow-brut-lg">
        <h2 className="font-display text-lg font-bold text-text-primary">1 · Choose a CV</h2>
        {cvParam ? (
          <p className="font-mono text-xs text-text-secondary">Tailoring your linked CV.</p>
        ) : (
          <>
            <Segmented
              options={[
                { key: "demo", label: "Demo CV" },
                { key: "upload", label: "Upload your CV" },
              ]}
              value={cvMode}
              onChange={(k) => {
                setCvMode(k as "demo" | "upload");
                resetTailorState();
              }}
            />
            {cvMode === "demo" ? (
              <p className="font-mono text-2xs text-text-muted">
                Using the seeded demo: {demoCv?.label ?? "loading…"}
              </p>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <label className="cursor-pointer border border-border bg-bg-elev px-3 py-1.5 font-mono text-2xs uppercase tracking-wider text-text-secondary transition-colors hover:border-border-strong hover:text-accent">
                  {uploading ? "uploading…" : "choose a PDF / .txt"}
                  <input
                    type="file"
                    accept=".pdf,.txt,text/plain,application/pdf"
                    className="hidden"
                    disabled={uploading}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void onUpload(f);
                    }}
                  />
                </label>
                {uploadedCv ? (
                  <span className="font-mono text-2xs text-success">✓ {uploadedCv.label}</span>
                ) : null}
              </div>
            )}
          </>
        )}
      </section>

      {/* 2 · Target job */}
      <section className="flex flex-col gap-4 border border-border bg-bg-card p-6 shadow-brut-lg">
        <h2 className="font-display text-lg font-bold text-text-primary">
          2 · Choose the target job
        </h2>
        <Segmented
          options={[
            { key: "vacancy", label: "Pick a real vacancy" },
            { key: "paste", label: "Paste a description" },
          ]}
          value={targetMode}
          onChange={(k) => {
            setTargetMode(k as "vacancy" | "paste");
            setResult(null);
            setNeedsPrepare(false);
          }}
        />

        {targetMode === "vacancy" ? (
          !candidateId ? (
            <p className="font-mono text-2xs text-text-muted">Choose a CV first.</p>
          ) : (
            <>
              <VacancyPicker
                key={candidateId}
                candidateId={candidateId}
                selectedId={selectedVacancy?.id ?? null}
                onSelect={(v) => {
                  setSelectedVacancy(v);
                  setResult(null);
                  setNeedsPrepare(false);
                }}
              />
              {selectedVacancy ? (
                <p className="font-mono text-2xs text-text-secondary">
                  target: <span className="text-accent">{selectedVacancy.label}</span>
                </p>
              ) : null}
            </>
          )
        ) : (
          <>
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
            </div>
          </>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => void runTailor()} disabled={busy || preparing || !canTailor}>
            {busy ? "Tailoring…" : "Tailor my CV →"}
          </Button>
          {needsPrepare ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-2xs text-text-muted">
                this CV isn&apos;t prepared for tailoring yet —
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void prepareAndTailor()}
                disabled={preparing}
              >
                {preparing ? "Parsing…" : "Prepare it (1 AI call) →"}
              </Button>
            </div>
          ) : null}
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

function Segmented({
  options,
  value,
  onChange,
}: {
  options: { key: string; label: string }[];
  value: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="flex w-fit border border-border">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          className={`px-4 py-2 font-mono text-2xs uppercase tracking-wider transition-colors ${
            value === o.key
              ? "bg-accent text-bg"
              : "bg-bg-elev text-text-secondary hover:text-accent"
          }`}
        >
          {o.label}
        </button>
      ))}
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
        <h2 className="font-display text-lg font-bold text-text-primary">
          <span className="text-accent">3 · </span>Every change, shown as a diff
        </h2>
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
