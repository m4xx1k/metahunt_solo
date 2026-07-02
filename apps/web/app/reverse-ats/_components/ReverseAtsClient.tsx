"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { Logo } from "@/ui";
import { Pagination } from "@/ui/navigation/Pagination";
import { cvApi, type CvIngestResult } from "@/lib/api/cv";
import { useResults } from "@/features/vacancy-filters/use-results";
import {
  MATCH_PAGE_SIZE,
  type WarmSource,
} from "@/features/vacancy-filters/warm-query";
import { useUrlFilters } from "@/features/vacancy-filters/use-url-filters";
import { CandidateProfile } from "./CandidateProfile";
import { CvSubscribeButton } from "./CvSubscribeButton";
import { MatchFilters } from "./MatchFilters";
import { MatchCard } from "./MatchCard";
import { SkillRecommendations } from "./SkillRecommendations";
import { SAMPLES } from "./samples";

type Source =
  | { kind: "sample"; index: number }
  | { kind: "cv"; info: CvIngestResult };

export function ReverseAtsClient() {
  const api = useUrlFilters();
  const [source, setSource] = useState<Source>({ kind: "sample", index: 0 });
  const [page, setPage] = useState(1);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // A filter change can shrink the result set below the current page — reset to
  // 1 in the same render (React's "adjust state on prop change" pattern), so the
  // results query never fires for an out-of-range page. `api.filters` is stable
  // per URL, so this only trips on a real filter change.
  const [prevFilters, setPrevFilters] = useState(api.filters);
  if (prevFilters !== api.filters) {
    setPrevFilters(api.filters);
    setPage(1);
  }

  // The store carries cold-only axes too; warm ranks against the candidate, so
  // map the active candidate into the app-agnostic WarmSource the hook fetches.
  const warmSource: WarmSource =
    source.kind === "sample"
      ? { kind: "sample", skills: SAMPLES[source.index].skills }
      : { kind: "cv", candidateId: source.info.candidateId };

  const { data, isFetching, isError, error } = useResults({
    lens: "warm",
    source: warmSource,
    filters: api.filters,
    page,
  });

  // Recommendations depend only on the candidate (role + skills define the
  // cohort), not the page filters — its own query, alive only for an uploaded CV.
  const candidateId = source.kind === "cv" ? source.info.candidateId : null;
  const { data: rec } = useQuery({
    queryKey: ["recs", candidateId],
    queryFn: () => cvApi.recommendations(candidateId as string),
    enabled: candidateId != null,
    staleTime: 30_000,
  });

  const runSample = useCallback((index: number) => {
    setUploadError(null);
    setPage(1);
    setSource({ kind: "sample", index });
  }, []);

  const onFile = useCallback(async (file: File) => {
    setUploadError(null);
    setUploading(true);
    try {
      const info = await cvApi.uploadFile(file);
      setPage(1);
      setSource({ kind: "cv", info });
    } catch (e) {
      setUploadError(msg(e));
    } finally {
      setUploading(false);
    }
  }, []);

  const goToOffset = useCallback((offset: number) => {
    setPage(Math.floor(offset / MATCH_PAGE_SIZE) + 1);
  }, []);

  const profileTitle =
    source.kind === "cv" ? "твоє CV" : `профіль · ${SAMPLES[source.index].label}`;
  const busy = isFetching || uploading;
  const errorMsg = uploadError ?? (isError ? msg(error) : null);

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
              {SAMPLES.map((s, i) => {
                const active = source.kind === "sample" && source.index === i;
                return (
                  <button
                    key={s.label}
                    type="button"
                    onClick={() => runSample(i)}
                    className={`border px-3 py-2 text-left font-mono text-xs transition-colors ${
                      active
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
            {/* CV source only — samples have no candidate to rank against. */}
            {source.kind === "cv" && data ? (
              <CvSubscribeButton
                candidateId={source.info.candidateId}
                filters={api.filters}
              />
            ) : null}
            <MatchFilters api={api} disabled={busy} />
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
                rank={(page - 1) * MATCH_PAGE_SIZE + i + 1}
              />
            ))}

            {data && data.total > MATCH_PAGE_SIZE ? (
              <div className="mt-2 border-t border-border pt-5">
                <Pagination
                  total={data.total}
                  limit={MATCH_PAGE_SIZE}
                  offset={(page - 1) * MATCH_PAGE_SIZE}
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
                role={source.kind === "cv" ? source.info.role : null}
                seniority={source.kind === "cv" ? source.info.seniority : null}
                matched={data.resolved.matched}
                unmatched={data.resolved.unmatched}
                totalVacancies={data.total}
              />
              {/* CV source only — samples have no stored candidate to recommend against. */}
              {source.kind === "cv" && rec ? (
                <SkillRecommendations rec={rec} />
              ) : null}
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : "request failed";
}
