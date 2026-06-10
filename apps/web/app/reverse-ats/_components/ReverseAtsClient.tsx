"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";

import { Logo } from "@/components/ui-kit";
import { Pagination } from "@/components/ui-kit/navigation/Pagination";
import { cvApi, type CvIngestResult } from "@/lib/api/cv";
import { rankingApi, type MatchResponse } from "@/lib/api/ranking";
import { CandidateProfile } from "./CandidateProfile";
import { MatchFilters } from "./MatchFilters";
import { MatchCard } from "./MatchCard";
import { FRESH_DAYS, NO_FILTERS, type Filters } from "./filter-model";
import { SAMPLES } from "./samples";

const PAGE_SIZE = 20;

type Source =
  | { kind: "sample"; index: number }
  | { kind: "cv"; info: CvIngestResult };

export function ReverseAtsClient({ initial }: { initial: MatchResponse | null }) {
  const [source, setSource] = useState<Source>({ kind: "sample", index: 0 });
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<MatchResponse | null>(initial);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Single fetch path: re-rank the given source under the given filters at the
  // given page. Both the sample and CV cards share it, so a filter toggle or
  // page change re-runs whichever candidate is active. Source/filters/page are
  // passed in to dodge stale closures.
  const run = useCallback(async (src: Source, f: Filters, p: number) => {
    // Scalars shared by both paths; multi-value filters differ only in wire
    // format — JSON arrays for the POST body, CSV for the GET query.
    const scalar = {
      hasTestAssignment: f.noTest ? false : undefined,
      hasReservation: f.reservation ? true : undefined,
      minFitTier: f.minFitTier ?? undefined,
      postedWithinDays: f.fresh ? FRESH_DAYS : undefined,
    };
    const arr = <T,>(a: T[]): T[] | undefined => (a.length > 0 ? a : undefined);
    const csv = (a: string[]): string | undefined =>
      a.length > 0 ? a.join(",") : undefined;
    setError(null);
    setLoading(true);
    try {
      const res =
        src.kind === "sample"
          ? await rankingApi.match({
              skills: SAMPLES[src.index].skills,
              page: p,
              pageSize: PAGE_SIZE,
              seniorities: arr(f.seniorities),
              workFormats: arr(f.workFormats),
              englishLevels: arr(f.englishLevels),
              employmentTypes: arr(f.employmentTypes),
              ...scalar,
            })
          : await cvApi.matches(src.info.candidateId, {
              page: p,
              pageSize: PAGE_SIZE,
              seniorities: csv(f.seniorities),
              workFormats: csv(f.workFormats),
              englishLevels: csv(f.englishLevels),
              employmentTypes: csv(f.employmentTypes),
              ...scalar,
            });
      setData(res);
    } catch (e) {
      setError(msg(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Changing the candidate or any filter resets to page 1 (the old page may not
  // exist in the new, smaller result set).
  const runSample = useCallback(
    (index: number) => {
      const src: Source = { kind: "sample", index };
      setSource(src);
      setPage(1);
      void run(src, filters, 1);
    },
    [run, filters],
  );

  const onFile = useCallback(
    async (file: File) => {
      setError(null);
      setUploading(true);
      try {
        const info = await cvApi.uploadFile(file);
        const src: Source = { kind: "cv", info };
        setSource(src);
        setPage(1);
        await run(src, filters, 1);
      } catch (e) {
        setError(msg(e));
        setData(null);
      } finally {
        setUploading(false);
      }
    },
    [run, filters],
  );

  // Apply a partial filter change, reset to page 1, and re-rank the active source.
  const onFilterChange = useCallback(
    (patch: Partial<Filters>) => {
      const next = { ...filters, ...patch };
      setFilters(next);
      setPage(1);
      void run(source, next, 1);
    },
    [run, source, filters],
  );

  // Pagination drives offset; map it back to a 1-based page and refetch.
  const goToOffset = useCallback(
    (offset: number) => {
      const p = Math.floor(offset / PAGE_SIZE) + 1;
      setPage(p);
      void run(source, filters, p);
    },
    [run, source, filters],
  );

  const profileTitle =
    source.kind === "cv" ? "твоє CV" : `профіль · ${SAMPLES[source.index].label}`;
  const busy = loading || uploading;

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
          <div className="xl:sticky xl:top-24">
            <MatchFilters
              filters={filters}
              onChange={onFilterChange}
              disabled={busy}
            />
          </div>

          <div className="flex flex-col gap-5">
            {error ? (
              <p className="border border-danger/40 bg-danger/5 px-4 py-3 font-mono text-sm text-danger">
                помилка: {error} — бекенд (NEXT_PUBLIC_API_URL) піднятий?
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
                rank={(page - 1) * PAGE_SIZE + i + 1}
              />
            ))}

            {data && data.total > PAGE_SIZE ? (
              <div className="mt-2 border-t border-border pt-5">
                <Pagination
                  total={data.total}
                  limit={PAGE_SIZE}
                  offset={(page - 1) * PAGE_SIZE}
                  onNavigate={goToOffset}
                />
              </div>
            ) : null}
          </div>

          {/* CV profile: right rail on xl+, first thing when stacked */}
          {data ? (
            <div className="order-first xl:order-none xl:sticky xl:top-24">
              <CandidateProfile
                title={profileTitle}
                role={source.kind === "cv" ? source.info.role : null}
                seniority={source.kind === "cv" ? source.info.seniority : null}
                matched={data.resolved.matched}
                unmatched={data.resolved.unmatched}
                totalVacancies={data.total}
              />
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
