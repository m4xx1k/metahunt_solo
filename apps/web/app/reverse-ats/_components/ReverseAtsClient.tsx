"use client";

import Link from "next/link";

import { Logo } from "@/ui";
import { Pagination } from "@/ui/navigation/Pagination";
import type { SampleCandidate } from "@/lib/api/cv";
import type { OptionRow } from "@/features/vacancy-filters/types";
import { useReverseAts } from "../_hooks/use-reverse-ats";
import { CandidateProfile } from "./CandidateProfile";
import { CvSubscribeButton } from "./CvSubscribeButton";
import { MatchFilters } from "./MatchFilters";
import { MatchCard } from "./MatchCard";
import { SkillRecommendations } from "./SkillRecommendations";

export function ReverseAtsClient({
  samples,
  domainOptions,
}: {
  samples: SampleCandidate[];
  domainOptions: OptionRow[];
}) {
  const {
    api,
    active,
    isUpload,
    candidateId,
    data,
    rec,
    page,
    pageSize,
    busy,
    uploading,
    errorMsg,
    profileTitle,
    profileRole,
    profileSeniority,
    fileRef,
    selectSample,
    onFile,
    goToOffset,
  } = useReverseAts(samples);

  return (
    <main className="min-h-screen bg-bg text-text-primary">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-bg/90 px-6 py-4 backdrop-blur lg:px-12">
        <Logo />
        <Link
          href="/"
          className="font-mono text-xs text-text-secondary hover:text-accent"
        >
          ← до фіда
        </Link>
      </header>

      {/* HERO */}
      <section className="border-b border-border px-6 py-10 lg:px-12">
        <div className="mx-auto w-full max-w-7xl">
          <p className="font-mono text-xs uppercase tracking-[0.25em] text-accent">
            reverse-ats
          </p>
          <h1 className="mt-3 max-w-3xl font-mono text-3xl font-bold leading-tight md:text-5xl">
            Вакансії, відсортовані під <span className="text-accent">твій</span> стек.
          </h1>
          <p className="mt-4 max-w-2xl font-body text-base text-text-secondary md:text-lg">
            Завантаж резюме — і побач усі вакансії за релевантністю твоїх навичок,
            з оцінкою fit та тим, що збігається і чого бракує.
          </p>
        </div>
      </section>

      {/* CANDIDATE PICKER */}
      <section className="border-b border-border px-6 py-6 lg:px-12">
        <div className="mx-auto grid w-full max-w-7xl gap-6 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <p className="mb-3 font-mono text-[10px] uppercase tracking-wider text-text-muted">
              готовий профіль
            </p>
            <div className="flex flex-wrap gap-2">
              {samples.map((s) => {
                const isActive =
                  active?.kind === "sample" &&
                  active.candidateId === s.candidateId;
                return (
                  <button
                    key={s.candidateId}
                    type="button"
                    onClick={() => selectSample(s)}
                    className={`border px-3 py-2 text-left font-mono text-xs transition-colors ${
                      isActive
                        ? "border-accent bg-bg-card text-accent"
                        : "border-border text-text-secondary hover:border-accent"
                    }`}
                  >
                    <span className="block font-bold">{s.label}</span>
                    <span className="block text-text-muted">{s.hint}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="md:border-l md:border-border md:pl-6">
            <p className="mb-3 font-mono text-[10px] uppercase tracking-wider text-text-muted">
              своє CV
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.txt,application/pdf,text/plain"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onFile(f);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
              className="w-full border border-accent bg-accent px-4 py-2 font-mono text-xs font-bold text-bg transition-opacity hover:opacity-90 disabled:opacity-50 md:w-auto"
            >
              {uploading ? "парсимо…" : "↑ завантажити PDF / TXT"}
            </button>
            <p className="mt-2 font-mono text-[10px] text-text-muted md:max-w-[200px]">
              текст витягнеться, скіли зматчаться на таксономію
            </p>
          </div>
        </div>
      </section>

      {/* FILTERS · RESULTS · CV PROFILE (3-col on xl+; stacks below — at <xl the
          single-column layout reads better than cramped thirds). */}
      <section className="px-6 pb-20 pt-8 lg:px-12">
        <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-6 xl:grid-cols-[240px_minmax(0,1fr)_300px] xl:items-start">
          <div className="flex flex-col gap-4 xl:sticky xl:top-24">
            {/* Uploaded CV only — a demo sample has no owner to subscribe. */}
            {isUpload && candidateId && data ? (
              <CvSubscribeButton candidateId={candidateId} filters={api.filters} />
            ) : null}
            <MatchFilters api={api} domainOptions={domainOptions} disabled={busy} />
          </div>

          <div className="flex flex-col gap-5">
            {errorMsg ? (
              <p className="border border-danger/40 bg-danger/5 px-4 py-3 font-mono text-sm text-danger">
                помилка: {errorMsg} — бекенд (NEXT_PUBLIC_API_URL) піднятий?
              </p>
            ) : null}

            {busy ? (
              <p className="font-mono text-sm text-text-muted">ранжуємо…</p>
            ) : null}
            {!busy && data && data.items.length === 0 ? (
              <p className="border border-border bg-bg-card px-4 py-6 text-center font-mono text-sm text-text-muted">
                жодної вакансії під ці фільтри — спробуй послабити їх.
              </p>
            ) : null}

            {data?.items.map((item, i) => (
              <MatchCard
                key={item.vacancy.id}
                item={item}
                rank={(page - 1) * pageSize + i + 1}
              />
            ))}

            {data && data.total > pageSize ? (
              <div className="mt-2 border-t border-border pt-5">
                <Pagination
                  total={data.total}
                  limit={pageSize}
                  offset={(page - 1) * pageSize}
                  onNavigate={goToOffset}
                />
              </div>
            ) : null}
          </div>

          {/* CV profile: right rail on xl+, first thing when stacked */}
          {data ? (
            <div className="order-first flex flex-col gap-4 xl:order-none xl:sticky xl:top-24">
              <CandidateProfile
                title={profileTitle}
                role={profileRole}
                seniority={profileSeniority}
                matched={data.resolved.matched}
                unmatched={data.resolved.unmatched}
                totalVacancies={data.total}
              />
              {/* Uploaded CV only — a demo sample has no stored owner to recommend against. */}
              {isUpload && rec ? <SkillRecommendations rec={rec} /> : null}
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
