// Content for /how-it-works, ported from .scratch/how-it-works/deep-dive.html.
// Real figures only — prod snapshot 2026-07-07, see numbers.items for sourcing.

export const hero = {
  kicker: "> how it actually works",
  titleLines: ["raw job feeds in.", "one clean, ranked market out."],
  body: "metahunt turns the scattered, duplicated, unstructured Ukrainian tech job market into a single clean dataset — then ranks it against your CV. No black box: here is the whole system, with the real numbers.",
};

export const stack = {
  context: "a small, honest LLM + vector pipeline — ~$9/mo to run.",
  items: [
    { name: "Temporal", href: "https://temporal.io" },
    { name: "NestJS", href: "https://nestjs.com" },
    { name: "PostgreSQL", href: "https://www.postgresql.org" },
    { name: "pgvector", href: "https://github.com/pgvector/pgvector" },
    { name: "DeepSeek", href: "https://www.deepseek.com" },
    { name: "BAML", href: "https://www.boundaryml.com" },
    {
      name: "OpenAI embeddings",
      href: "https://platform.openai.com/docs/guides/embeddings",
    },
    { name: "Drizzle", href: "https://orm.drizzle.team" },
    { name: "Next.js", href: "https://nextjs.org" },
    { name: "Railway", href: "https://railway.com" },
    { name: "Vercel", href: "https://vercel.com" },
  ],
};

export const collect = {
  substats: [
    { value: "2", label: "RSS feeds" },
    { value: "~16/day", label: "pulls, 06–22 Kyiv" },
    { value: "SKIP", label: "overlap policy" },
    { value: "$3.25/mo", label: "ETL worker" },
  ],
  list: [
    "RSS pull from Djinni & DOU (2 feeds today; a new source is one config row).",
    "New items dedup on a content hash before they ever hit the DB (→ bronze).",
    "Overlapping runs skipped, no double-ingest.",
  ],
  acts: [
    { label: "fetch", note: "feed → xml" },
    { label: "parse", note: "xml → items" },
    { label: "extract", note: "text → fields" },
    { label: "finalize", note: "upsert vacancy" },
  ],
};

export const parse = {
  substats: [
    { value: "15+", label: "fields extracted" },
    { value: "$0.14", label: "/1M input tok" },
    { value: "$0.28", label: "/1M output tok" },
    { value: "off", label: "reasoning mode" },
  ],
  list: [
    "Stack, split into must-have vs nice-to-have.",
    "Seniority · role · work format · locations · English level.",
    "Salary range · employment type · company type (product/outsource/…).",
    "Flags: has test task, is-tech, reservation.",
  ],
};

export const dedup = {
  substats: [
    { value: "1536-d", label: "embedding" },
    { value: "0.92", label: "merge cosine" },
    { value: "±45d", label: "match window" },
    { value: "5 min", label: "sweep cadence" },
    { value: "89%", label: "recall" },
  ],
  hardFilters: [
    "Same source + same id, parsed from the URL, upserts in place.",
    "RSS content-hash blocks re-ingesting an unchanged item.",
  ],
  softFilters: [
    "Each vacancy → a 1536-d embedding (text-embedding-3-small).",
    "pgvector finds the top-20 nearest by cosine, within a ±45-day window.",
    "Structural gates: same role & seniority, different companies excluded.",
    "Join only if pairwise ≥ 0.92 and group-centroid ≥ 0.92; gold tier at ≥ 0.95.",
    "Canonical = earliest-published member; every source link is kept.",
  ],
  funnel: [
    { label: "all vacancies (100% embedded)", value: "10,839" },
    { down: "top-20 nearest · ±45d · role/seniority gates" },
    { label: "candidate pairs scored (cosine)", value: "pairwise", threshold: "≥ 0.92" },
    { down: "pairwise + centroid threshold" },
    { label: "unique job groups", value: "9,228", accent: true },
    { down: "of which merged from 2+ postings" },
    { label: "multi-member groups merged", value: "1,107" },
  ],
};

export const match = {
  substats: [
    { value: "10,839", label: "N (job corpus)" },
    { value: "0.8", label: "STRONG cutoff" },
    { value: "0.5", label: "GOOD cutoff" },
    { value: "+5", label: "df smoothing" },
    { value: "16.75", label: "example relevance" },
  ],
  idfBars: [
    { name: "Kubernetes", pct: 92, note: "rare · high" },
    { name: "Kafka", pct: 78, note: "high" },
    { name: "Go", pct: 55, note: "medium" },
    { name: "PostgreSQL", pct: 40, note: "medium" },
    { name: "JavaScript", pct: 14, note: "common · low", low: true },
    { name: "HTML", pct: 4, note: "→ clamped 0", low: true },
  ],
};

export const numbers = {
  items: [
    {
      value: "~$8.7/mo",
      label: "total infra cost",
      note: "Postgres $5.42 + ETL $3.25 · Railway, 2026-07-04",
    },
    { value: "10,839", label: "vacancies processed", note: "100% embedded · 2026-07-07" },
    { value: "9,228", label: "unique job groups", note: "after dedup collapse" },
    {
      value: "1,107",
      label: "multi-member merges",
      note: "groups with 2+ postings · 400 span multiple boards",
    },
    { value: "89%", label: "dedup recall", note: "194/219 in-window pairs" },
    { value: "0.92 / 0.95", label: "merge / gold cosine", note: "pairwise + centroid" },
    { value: "$0.14/$0.28", label: "LLM $/1M tokens", note: "deepseek-v4-flash in/out" },
    { value: "1536-d", label: "embedding vectors", note: "text-embedding-3-small" },
  ],
};
