"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";

import { Logo } from "@/components/ui-kit";
import { cvApi, type CvIngestResult } from "@/lib/api/cv";
import { rankingApi, type MatchResponse } from "@/lib/api/ranking";
import { MatchCard } from "./MatchCard";
import { SAMPLES } from "./samples";

const PAGE_SIZE = 20;

type Source =
  | { kind: "sample"; index: number }
  | { kind: "cv"; info: CvIngestResult };

export function ReverseAtsClient({ initial }: { initial: MatchResponse | null }) {
  const [source, setSource] = useState<Source>({ kind: "sample", index: 0 });
  const [data, setData] = useState<MatchResponse | null>(initial);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const runSample = useCallback(async (index: number) => {
    setSource({ kind: "sample", index });
    setError(null);
    setLoading(true);
    try {
      setData(await rankingApi.match({ skills: SAMPLES[index].skills, pageSize: PAGE_SIZE }));
    } catch (e) {
      setError(msg(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const onFile = useCallback(async (file: File) => {
    setError(null);
    setUploading(true);
    try {
      const info = await cvApi.uploadFile(file);
      setSource({ kind: "cv", info });
      setLoading(true);
      setData(await cvApi.matches(info.candidateId, { pageSize: PAGE_SIZE }));
    } catch (e) {
      setError(msg(e));
      setData(null);
    } finally {
      setUploading(false);
      setLoading(false);
    }
  }, []);

  return (
    <main className="min-h-screen bg-bg text-text-primary">
      <header className="flex items-center justify-between border-b border-border px-6 py-4 lg:px-12">
        <Logo />
        <Link href="/" className="font-mono text-xs text-text-secondary hover:text-accent">
          ← feed
        </Link>
      </header>

      {/* HERO */}
      <section className="border-b border-border px-6 py-14 lg:px-12">
        <div className="mx-auto w-full max-w-5xl">
          <p className="font-mono text-xs uppercase tracking-[0.25em] text-accent">reverse-ats</p>
          <h1 className="mt-3 max-w-3xl font-mono text-4xl font-bold leading-tight md:text-5xl">
            Вакансії, відсортовані під <span className="text-accent">твій</span> стек.
          </h1>
          <p className="mt-4 max-w-2xl font-body text-base text-text-secondary md:text-lg">
            Звичайний ATS ранжує кандидатів під одну вакансію. Ми робимо навпаки:
            завантаж резюме — і бачиш усі вакансії за релевантністю твоїх навичок,
            з оцінкою fit та тим, що збігається і чого бракує.
          </p>
          <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 font-mono text-xs text-text-muted">
            <span>① скіли з CV → ноди таксономії</span>
            <span>② Σ IDF-ваги = relevance (сортування)</span>
            <span>③ покриття required = fit-tier</span>
          </div>
        </div>
      </section>

      {/* CANDIDATE PICKER */}
      <section className="border-b border-border px-6 py-8 lg:px-12">
        <div className="mx-auto grid w-full max-w-5xl gap-6 md:grid-cols-[1fr_auto]">
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
              className="border border-accent bg-accent px-4 py-2 font-mono text-xs font-bold text-bg transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {uploading ? "парсимо…" : "↑ завантажити PDF / TXT"}
            </button>
            <p className="mt-2 max-w-[200px] font-mono text-[10px] text-text-muted">
              текст витягнеться, скіли зматчаться на таксономію
            </p>
          </div>
        </div>

        {/* resolved summary */}
        {data ? (
          <div className="mx-auto mt-6 w-full max-w-5xl border border-border bg-bg-card px-4 py-3 font-mono text-xs">
            {source.kind === "cv" ? (
              <span className="text-text-secondary">
                CV: <span className="text-text-primary">{source.info.role ?? "—"}</span>
                {source.info.seniority ? ` · ${source.info.seniority.toLowerCase()}` : ""} ·{" "}
              </span>
            ) : null}
            <span className="text-text-secondary">
              зматчено <span className="text-success">{data.resolved.matched.length}</span> скілів ·{" "}
              <span className="text-accent">{data.total}</span> вакансій з перетином
            </span>
            {data.resolved.unmatched.length > 0 ? (
              <span className="text-text-muted"> · не розпізнано: {data.resolved.unmatched.join(", ")}</span>
            ) : null}
          </div>
        ) : null}
      </section>

      {/* RANKED LIST */}
      <section className="px-6 py-8 lg:px-12">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
          {error ? (
            <p className="font-mono text-sm text-danger">
              помилка: {error} — бекенд (NEXT_PUBLIC_API_URL) піднятий?
            </p>
          ) : null}
          {loading ? <p className="font-mono text-sm text-text-muted">ранжуємо…</p> : null}
          {!loading && data?.items.length === 0 ? (
            <p className="font-mono text-sm text-text-muted">жодної вакансії з перетином.</p>
          ) : null}
          {data?.items.map((item, i) => (
            <MatchCard key={item.vacancy.id} item={item} rank={i + 1} />
          ))}
        </div>
      </section>
    </main>
  );
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : "request failed";
}
