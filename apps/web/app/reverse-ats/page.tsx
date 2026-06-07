"use client";

import { useCallback, useEffect, useState } from "react";

import {
  rankingApi,
  type FitTier,
  type MatchResponse,
  type RankedVacancy,
  type SkillRef,
} from "@/lib/api/ranking";

// Hardcoded mock candidates — no backend endpoint, just plain-skill lists fed
// to POST /ranking/match. Throwaway page to eyeball the reverse-ATS engine.
const CANDIDATES: { label: string; hint: string; skills: string[] }[] = [
  {
    label: "Maksym (твоє CV)",
    hint: "Full-Stack / AI",
    skills: [
      "TypeScript", "React", "TailwindCSS", "Redux Toolkit", "TanStack Query",
      "Jest", "Testing Library", "Playwright", "Vite", "ESLint", "Prettier",
      "Hybrid Search", "Embeddings", "ETL", "pgvector", "Pinecone", "LangChain",
      "Node.js", "NestJS", "Express.js", "Fastify", "PostgreSQL", "MongoDB",
      "Elasticsearch", "Redis", "BullMQ", "RabbitMQ", "Docker", "Nginx", "CI/CD",
      "AWS S3", "CDN", "AWS SQS", "AWS Lambda", "Stripe", "OAuth", "Passport.js",
      "Swagger", "Next.js", "GraphQL", "OpenAI", "Semantic Search", "Prisma",
      "FFmpeg", "HLS", "JWT", "MFA", "WebRTC", "Firebase Cloud Messaging",
      "react-hook-form", "RTK Query",
    ],
  },
  {
    label: "Python Backend",
    hint: "Django / infra",
    skills: [
      "Python", "Django", "FastAPI", "PostgreSQL", "Redis", "Celery", "Docker",
      "Kubernetes", "AWS", "RabbitMQ", "REST API", "Git", "Nginx", "GraphQL",
    ],
  },
  {
    label: "React Frontend",
    hint: "UI-focused",
    skills: [
      "React", "TypeScript", "JavaScript", "Next.js", "Redux", "TailwindCSS",
      "HTML", "CSS", "GraphQL", "Jest", "Webpack", "Storybook", "Figma",
    ],
  },
  {
    label: "Junior JS",
    hint: "entry-level",
    skills: ["JavaScript", "React", "HTML", "CSS", "Node.js", "Git", "TypeScript"],
  },
  {
    label: "Data / ML",
    hint: "niche stack",
    skills: [
      "Python", "PyTorch", "TensorFlow", "Pandas", "NumPy", "SQL", "Spark",
      "Airflow", "scikit-learn", "Docker",
    ],
  },
];

const TIER_STYLE: Record<FitTier, string> = {
  STRONG: "border-success text-success",
  GOOD: "border-accent text-accent",
  STRETCH: "border-border text-text-muted",
};

export default function ReverseAtsPage() {
  const [selected, setSelected] = useState(0);
  const [data, setData] = useState<MatchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (idx: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await rankingApi.match({
        skills: CANDIDATES[idx].skills,
        pageSize: 15,
      });
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "request failed");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void run(selected);
  }, [selected, run]);

  return (
    <main className="min-h-screen bg-bg px-6 py-10 text-text-primary lg:px-12">
      <div className="mx-auto w-full max-w-5xl">
        <h1 className="font-mono text-2xl font-bold">reverse-ats</h1>
        <p className="mt-1 font-mono text-sm text-text-muted">
          підбір вакансій під скіли кандидата · sort = Σ IDF · tier = покриття
          required
        </p>

        {/* candidate selector */}
        <div className="mt-6 flex flex-wrap gap-2">
          {CANDIDATES.map((c, i) => (
            <button
              key={c.label}
              type="button"
              onClick={() => setSelected(i)}
              className={`border px-3 py-2 text-left font-mono text-xs transition-colors ${
                i === selected
                  ? "border-accent bg-bg-card text-accent"
                  : "border-border text-text-secondary hover:border-accent"
              }`}
            >
              <span className="block font-bold">{c.label}</span>
              <span className="block text-text-muted">{c.hint}</span>
            </button>
          ))}
        </div>

        {/* resolved summary */}
        {data ? (
          <div className="mt-6 border border-border bg-bg-card p-4 font-mono text-xs">
            <div className="text-text-secondary">
              зматчено{" "}
              <span className="text-success">{data.resolved.matched.length}</span>{" "}
              скілів · знайдено{" "}
              <span className="text-accent">{data.total}</span> вакансій з
              перетином
            </div>
            {data.resolved.unmatched.length > 0 ? (
              <div className="mt-2 text-text-muted">
                не розпізнано: {data.resolved.unmatched.join(", ")}
              </div>
            ) : null}
          </div>
        ) : null}

        {loading ? (
          <p className="mt-6 font-mono text-sm text-text-muted">завантаження…</p>
        ) : null}
        {error ? (
          <p className="mt-6 font-mono text-sm text-danger">
            помилка: {error} — бекенд (NEXT_PUBLIC_API_URL) піднятий?
          </p>
        ) : null}

        {/* ranked list */}
        <div className="mt-6 flex flex-col gap-4">
          {data?.items.map((v, i) => (
            <VacancyRow key={v.id} v={v} rank={i + 1} />
          ))}
        </div>
      </div>
    </main>
  );
}

function VacancyRow({ v, rank }: { v: RankedVacancy; rank: number }) {
  return (
    <article className="border border-border bg-bg-card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-mono text-sm font-bold text-text-primary">
          <span className="text-text-muted">#{rank}</span> {v.title}
        </h3>
        <div className="flex items-center gap-3 font-mono text-xs">
          <span className={`border px-2 py-[2px] ${TIER_STYLE[v.fit.tier]}`}>
            {v.fit.tier} {v.fit.matchedRequired}/{v.fit.requiredTotal}
          </span>
          <span className="text-accent">rel {v.relevance.toFixed(1)}</span>
        </div>
      </div>
      <div className="mt-1 font-mono text-xs text-text-muted">
        {v.company ?? "—"}
        {v.seniority ? ` · ${v.seniority}` : ""}
      </div>

      <SkillLine label="have" sign="✅" cls="border-success text-success" skills={v.diff.have} />
      <SkillLine label="miss" sign="❌" cls="border-danger text-danger" skills={v.diff.missing} />
      <SkillLine label="bonus" sign="➕" cls="border-border text-text-muted" skills={v.diff.bonus} max={8} />
    </article>
  );
}

function SkillLine({
  label,
  sign,
  cls,
  skills,
  max = 12,
}: {
  label: string;
  sign: string;
  cls: string;
  skills: SkillRef[];
  max?: number;
}) {
  if (skills.length === 0) return null;
  const shown = skills.slice(0, max);
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
        {sign} {label}:
      </span>
      {shown.map((s) => (
        <span key={s.id} className={`border px-1.5 py-[1px] font-mono text-[11px] ${cls}`}>
          {s.name.toLowerCase()}
          <span className="opacity-50"> {s.weight.toFixed(1)}</span>
        </span>
      ))}
      {skills.length > max ? (
        <span className="font-mono text-[11px] text-text-muted">+{skills.length - max}</span>
      ) : null}
    </div>
  );
}
