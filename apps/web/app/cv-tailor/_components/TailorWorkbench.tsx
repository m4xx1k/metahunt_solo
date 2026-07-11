"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { cvApi } from "@/lib/api/cv";
import {
  cvTailorApi,
  type ApplyKitRequest,
  type ApplyKitResult,
  type BulletDiff,
  type TailorResult,
} from "@/lib/api/cv-tailor";
import { Button } from "@/ui/buttons/Button";

import { CoverLetter, Interview } from "./ApplyKit";
import { GuardDemoPanel } from "./GuardDemoPanel";
import { LivingCv } from "./LivingCv";
import { VacancyPicker } from "./VacancyPicker";

type Cv = { id: string; label: string };
type Tab = "cv" | "letter" | "interview";

const EXAMPLES: { label: string; text: string }[] = [
  {
    label: "Backend / infra",
    text: "Senior Backend Engineer — Node.js/NestJS microservices on AWS (ECS, SQS, Lambda), Elasticsearch, PostgreSQL, Terraform, Docker. Own event-driven data pipelines at scale.",
  },
  {
    label: "Frontend",
    text: "Frontend Engineer — React, Next.js, TypeScript, Tailwind CSS, React Query. Build polished product UIs and a shared component library.",
  },
  {
    label: "AI engineer",
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
  const [aiRewrite, setAiRewrite] = useState(true);

  const [result, setResult] = useState<TailorResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [needsPrepare, setNeedsPrepare] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [tab, setTab] = useState<Tab>("cv");
  const [kit, setKit] = useState<ApplyKitResult | null>(null);
  const [kitLoading, setKitLoading] = useState(false);
  const [kitError, setKitError] = useState<string | null>(null);
  const [showHow, setShowHow] = useState(false);

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

  const clearOutputs = (): void => {
    setResult(null);
    setNeedsPrepare(false);
    setError(null);
    setKit(null);
    setTab("cv");
  };

  const targetBody = useCallback((): ApplyKitRequest | null => {
    if (targetMode === "vacancy") return selectedVacancy ? { vacancyId: selectedVacancy.id } : null;
    return jobText.trim() ? { jobText } : null;
  }, [targetMode, selectedVacancy, jobText]);

  const onUpload = async (file: File): Promise<void> => {
    setUploading(true);
    setError(null);
    try {
      const res = await cvApi.uploadFile(file);
      setUploadedCv({ id: res.candidateId, label: file.name });
      setCvMode("upload");
      setSelectedVacancy(null);
      clearOutputs();
    } catch (e) {
      setError(e instanceof Error ? e.message : "upload failed");
    } finally {
      setUploading(false);
    }
  };

  const runTailor = useCallback(async () => {
    if (!candidateId) return;
    const body = targetBody();
    if (!body) return;
    setBusy(true);
    setError(null);
    setNeedsPrepare(false);
    setKit(null);
    setTab("cv");
    try {
      setResult(await cvTailorApi.tailor(candidateId, { ...body, rephrase: aiRewrite }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "tailoring failed";
      if (/no structured resume/i.test(msg)) setNeedsPrepare(true);
      else setError(msg);
    } finally {
      setBusy(false);
    }
  }, [candidateId, targetBody, aiRewrite]);

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

  const fetchKit = useCallback(async () => {
    if (!candidateId || kit || kitLoading) return;
    const body = targetBody();
    if (!body) return;
    setKitLoading(true);
    setKitError(null);
    try {
      setKit(await cvTailorApi.applyKit(candidateId, body));
    } catch (e) {
      setKitError(e instanceof Error ? e.message : "could not build the kit");
    } finally {
      setKitLoading(false);
    }
  }, [candidateId, kit, kitLoading, targetBody]);

  const openTab = (t: Tab): void => {
    setTab(t);
    if (t !== "cv") void fetchKit();
  };

  const canTailor =
    !!candidateId && (targetMode === "vacancy" ? !!selectedVacancy : !!jobText.trim());
  const ledgerTech = result ? ledgerTechOf(result) : [];

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-2xl font-bold text-text-primary md:text-3xl">
          Tailor your CV — <span className="text-accent">without inventing a word</span>
        </h1>
        <p className="max-w-2xl font-body text-sm text-text-secondary">
          Pick a real job. Your CV gets rewritten to win it — bolder, sharper — but only from what
          you already proved. A guard checks every line, so nothing drifts.
        </p>
      </header>

      {/* Controls */}
      <section className="flex flex-col gap-4 border border-border bg-bg-card p-5 shadow-brut">
        <Row label="CV">
          {cvParam ? (
            <span className="font-mono text-xs text-text-secondary">your linked CV</span>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <Segmented
                options={[
                  { key: "demo", label: "Demo" },
                  { key: "upload", label: "Upload" },
                ]}
                value={cvMode}
                onChange={(k) => {
                  setCvMode(k as "demo" | "upload");
                  setSelectedVacancy(null);
                  clearOutputs();
                }}
              />
              {cvMode === "demo" ? (
                <span className="font-mono text-2xs text-text-muted">
                  {demoCv?.label ?? "loading…"}
                </span>
              ) : (
                <label className="cursor-pointer font-mono text-2xs uppercase tracking-wider text-text-secondary underline-offset-4 hover:text-accent hover:underline">
                  {uploading
                    ? "uploading…"
                    : uploadedCv
                      ? `✓ ${uploadedCv.label}`
                      : "choose PDF / .txt"}
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
              )}
            </div>
          )}
        </Row>

        <Row label="Job">
          <div className="flex w-full flex-col gap-3">
            <Segmented
              options={[
                { key: "vacancy", label: "Pick a vacancy" },
                { key: "paste", label: "Paste JD" },
              ]}
              value={targetMode}
              onChange={(k) => {
                setTargetMode(k as "vacancy" | "paste");
                clearOutputs();
              }}
            />
            {targetMode === "vacancy" ? (
              !candidateId ? (
                <span className="font-mono text-2xs text-text-muted">choose a CV first</span>
              ) : (
                <VacancyPicker
                  key={candidateId}
                  candidateId={candidateId}
                  selectedId={selectedVacancy?.id ?? null}
                  onSelect={(v) => {
                    setSelectedVacancy(v);
                    setResult(null);
                    setKit(null);
                    setNeedsPrepare(false);
                  }}
                />
              )
            ) : (
              <div className="flex flex-col gap-2">
                <textarea
                  value={jobText}
                  onChange={(e) => setJobText(e.target.value)}
                  placeholder="Paste a job description…"
                  rows={3}
                  className="w-full resize-y border border-border bg-bg px-3 py-2 font-body text-sm text-text-primary placeholder:text-text-muted focus:border-border-strong focus:outline-none"
                />
                <div className="flex flex-wrap gap-2">
                  {EXAMPLES.map((ex) => (
                    <button
                      key={ex.label}
                      type="button"
                      onClick={() => setJobText(ex.text)}
                      className="font-mono text-2xs uppercase tracking-wider text-text-muted underline-offset-4 hover:text-accent hover:underline"
                    >
                      {ex.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Row>

        <div className="flex flex-wrap items-center gap-4 border-t border-border pt-4">
          <Button onClick={() => void runTailor()} disabled={busy || preparing || !canTailor}>
            {busy ? "Tailoring…" : "Tailor →"}
          </Button>
          <button
            type="button"
            onClick={() => setAiRewrite((v) => !v)}
            className="font-mono text-2xs uppercase tracking-wider text-text-muted hover:text-accent"
          >
            AI rewrite:{" "}
            <span className={aiRewrite ? "text-success" : "text-text-secondary"}>
              {aiRewrite ? "on" : "off (fast)"}
            </span>
          </button>
          {needsPrepare ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-2xs text-text-muted">CV not prepared yet —</span>
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
          {error ? <span className="font-mono text-2xs text-danger">{error}</span> : null}
        </div>
      </section>

      {result ? (
        <div className="flex flex-col gap-5">
          <ResultHeader result={result} />
          <div className="flex gap-6 border-b border-border">
            {(["cv", "letter", "interview"] as Tab[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => openTab(t)}
                className={`-mb-px border-b-2 pb-2 font-mono text-xs uppercase tracking-wider transition-colors ${
                  tab === t
                    ? "border-accent text-accent"
                    : "border-transparent text-text-muted hover:text-text-secondary"
                }`}
              >
                {t === "cv" ? "CV" : t === "letter" ? "Cover letter" : "Interview"}
              </button>
            ))}
          </div>

          {tab === "cv" ? <LivingCv result={result} ledgerTech={ledgerTech} /> : null}
          {tab === "letter" ? (
            <CoverLetter data={kit} loading={kitLoading} error={kitError} />
          ) : null}
          {tab === "interview" ? (
            <Interview data={kit} loading={kitLoading} error={kitError} />
          ) : null}
        </div>
      ) : null}

      <div className="border-t border-border pt-4">
        <button
          type="button"
          onClick={() => setShowHow((v) => !v)}
          className="font-mono text-2xs uppercase tracking-wider text-text-muted underline-offset-4 hover:text-accent hover:underline"
        >
          {showHow ? "hide" : "how does it never lie? →"}
        </button>
        {showHow ? (
          <div className="mt-4">
            <GuardDemoPanel />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ResultHeader({ result }: { result: TailorResult }) {
  const g = result.grounding;
  const gap = result.gap;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="font-display text-lg font-bold text-text-primary">
          {result.resume.name} <span className="font-normal text-text-muted">— tailored for</span>{" "}
          <span className="text-accent">{result.target.label}</span>
        </p>
        <p className="font-mono text-2xs uppercase tracking-wider">
          <span className="text-success">✓ 0 invented facts</span>
          {g.rephrased > 0 ? (
            <span className="text-text-muted"> · {g.rephrased} reworded</span>
          ) : null}
          {g.drift > 0 ? <span className="text-danger"> · {g.drift} blocked</span> : null}
        </p>
      </div>
      {gap ? (
        <p className="font-mono text-2xs text-text-secondary">
          <span className="text-accent-secondary">{gap.fitPercent}% fit</span>
          {gap.missing.length > 0 ? (
            <span className="text-text-muted">
              {" "}
              · missing {gap.missing.map((m) => m.name).join(", ")}
            </span>
          ) : null}
          {gap.learnNext.length > 0 ? (
            <span className="text-text-muted">
              {" "}
              · learn <span className="text-accent">{gap.learnNext[0].skill}</span> → +
              {gap.learnNext[0].addedRoles} roles
            </span>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-4">
      <span className="w-10 shrink-0 pt-1 font-mono text-2xs uppercase tracking-wider text-text-muted">
        {label}
      </span>
      <div className="flex-1">{children}</div>
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
          className={`px-3 py-1.5 font-mono text-2xs uppercase tracking-wider transition-colors ${
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
