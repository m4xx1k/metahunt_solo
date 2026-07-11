// Tier-1 subset guard — deterministic, no LLM, no DB. The anti-hallucination
// core (ADR-0011 §5.4). Given a tailored/edited bullet, recompute its entity-set
// and prove it is a SUBSET of what the source bullet already stated:
//
//   • tech    — OK iff in the source bullet OR the candidate's global ledger
//               (fallback for extraction under-recall); a recognized tech that
//               is in neither → DRIFT "added-tech".
//   • metrics — STRICT: every number must be a verbatim token of the source
//               bullet. 2,800 ↛ 3,000, ~40% ↛ ~50%, 80+ may not lose the "+".
//   • orgs / titles — a ledger-known employer/title that appears in the tailored
//               text but not the source bullet → DRIFT (cross-contamination).
//   • dates   — years in the tailored text must appear in the source bullet.
//
// The guard is intentionally CONSERVATIVE: a false positive costs a rephrase
// (we fall back to the verbatim source bullet), a false negative would cost
// trust. So when unsure, it flags. Semantic inflation ("helped" → "led") is out
// of scope here — that is Tier 2's (LLM) job.

import type { DriftFlag, EntitySet, GuardResult } from "./cv-tailor.contract";

// ── Tech lexicon ──────────────────────────────────────────────────────────────
// [canonical display, aliases (lowercased), collisionProne?]. Collision-prone
// terms (React, Go, Spring…) collide with ordinary English words, so they only
// count when Title-cased / all-caps in the raw text.
type LexEntry = [string, string[], boolean?];

const TECH_LEXICON: LexEntry[] = [
  // languages
  ["TypeScript", ["typescript", "ts"]],
  ["JavaScript", ["javascript", "js"]],
  ["Python", ["python"]],
  ["Java", ["java"]],
  ["Kotlin", ["kotlin"]],
  ["Go", ["golang", "go"], true],
  ["Rust", ["rust"]],
  ["Ruby", ["ruby"]],
  ["PHP", ["php"]],
  ["C#", ["c#", "csharp"]],
  ["C++", ["c++", "cpp"]],
  ["C", ["c"], true],
  ["Scala", ["scala"]],
  ["Elixir", ["elixir"]],
  ["Dart", ["dart"]],
  ["Swift", ["swift"], true],
  ["SQL", ["sql"]],
  ["Bash", ["bash", "shell"]],
  ["HTML", ["html"]],
  ["CSS", ["css"]],
  ["Sass", ["sass", "scss"]],
  // runtimes / backend frameworks
  ["Node.js", ["node.js", "nodejs", "node"]],
  ["Deno", ["deno"]],
  ["Bun", ["bun"]],
  ["NestJS", ["nestjs", "nest.js", "nest"]],
  ["Express", ["express.js", "expressjs", "express"], true],
  ["Fastify", ["fastify"]],
  ["Django", ["django"]],
  ["Flask", ["flask"]],
  ["FastAPI", ["fastapi"]],
  ["Spring", ["spring boot", "springboot", "spring"], true],
  ["Rails", ["ruby on rails", "rails"]],
  ["Laravel", ["laravel"]],
  [".NET", [".net", "dotnet", "asp.net"]],
  // frontend
  ["React", ["react.js", "reactjs", "react"], true],
  ["React Native", ["react native"]],
  ["Next.js", ["next.js", "nextjs"]],
  ["Vue", ["vue.js", "vuejs", "vue"]],
  ["Angular", ["angular"]],
  ["Svelte", ["svelte"]],
  ["Remix", ["remix"]],
  ["Nuxt", ["nuxt"]],
  ["Redux", ["redux"]],
  ["React Query", ["react query", "tanstack query"]],
  ["Tailwind CSS", ["tailwind css", "tailwindcss", "tailwind"]],
  ["Bootstrap", ["bootstrap"]],
  ["GraphQL", ["graphql"]],
  ["tRPC", ["trpc"]],
  ["Apollo", ["apollo"]],
  // data / queues
  ["PostgreSQL", ["postgresql", "postgres", "psql", "pg"]],
  ["MySQL", ["mysql"]],
  ["MariaDB", ["mariadb"]],
  ["SQLite", ["sqlite"]],
  ["MongoDB", ["mongodb", "mongo"]],
  ["Redis", ["redis"]],
  ["Elasticsearch", ["elasticsearch", "elastic search"]],
  ["OpenSearch", ["opensearch"]],
  ["Cassandra", ["cassandra"]],
  ["DynamoDB", ["dynamodb"]],
  ["ClickHouse", ["clickhouse"]],
  ["Snowflake", ["snowflake"]],
  ["BigQuery", ["bigquery"]],
  ["Kafka", ["kafka"]],
  ["RabbitMQ", ["rabbitmq"]],
  ["SQS", ["sqs"]],
  ["SNS", ["sns"]],
  ["BullMQ", ["bullmq", "bull"]],
  ["Temporal", ["temporal"]],
  ["Celery", ["celery"]],
  ["pgvector", ["pgvector"]],
  ["Prisma", ["prisma"]],
  ["TypeORM", ["typeorm"]],
  ["Sequelize", ["sequelize"]],
  ["Drizzle", ["drizzle"]],
  ["Knex", ["knex"]],
  // cloud / infra
  ["AWS", ["aws", "amazon web services"]],
  ["Google Cloud", ["google cloud", "gcp"]],
  ["Azure", ["azure"]],
  ["ECS", ["ecs"]],
  ["Fargate", ["fargate"]],
  ["EKS", ["eks"]],
  ["Lambda", ["aws lambda"]],
  ["S3", ["s3"]],
  ["CloudFront", ["cloudfront"]],
  ["RDS", ["rds"]],
  ["EC2", ["ec2"]],
  ["CloudWatch", ["cloudwatch"]],
  ["Terraform", ["terraform"]],
  ["Terragrunt", ["terragrunt"]],
  ["Docker", ["docker"]],
  ["Kubernetes", ["kubernetes", "k8s"]],
  ["Helm", ["helm"]],
  ["Nginx", ["nginx"]],
  ["Ansible", ["ansible"]],
  ["Pulumi", ["pulumi"]],
  ["Vercel", ["vercel"]],
  ["Netlify", ["netlify"]],
  ["Heroku", ["heroku"]],
  ["Cloudflare", ["cloudflare"]],
  // ci / tooling / observability
  ["GitHub Actions", ["github actions"]],
  ["GitLab CI", ["gitlab ci", "gitlab-ci"]],
  ["Jenkins", ["jenkins"]],
  ["CircleCI", ["circleci"]],
  ["Git", ["git"]],
  ["Webpack", ["webpack"]],
  ["Vite", ["vite"]],
  ["esbuild", ["esbuild"]],
  ["Babel", ["babel"]],
  ["Jest", ["jest"]],
  ["Vitest", ["vitest"]],
  ["Playwright", ["playwright"]],
  ["Cypress", ["cypress"]],
  ["Selenium", ["selenium"]],
  ["Appium", ["appium"]],
  ["Pytest", ["pytest"]],
  ["Storybook", ["storybook"]],
  ["Grafana", ["grafana"]],
  ["Prometheus", ["prometheus"]],
  ["Datadog", ["datadog"]],
  ["Sentry", ["sentry"]],
  ["Kibana", ["kibana"]],
  // ai
  ["OpenAI", ["openai"]],
  ["GPT", ["gpt"]],
  ["Gemini", ["gemini"]],
  ["Claude", ["claude"]],
  ["Anthropic", ["anthropic"]],
  ["LangChain", ["langchain"]],
  ["LlamaIndex", ["llamaindex"]],
  ["PyTorch", ["pytorch"]],
  ["TensorFlow", ["tensorflow"]],
  ["Hugging Face", ["hugging face", "huggingface"]],
  ["Pinecone", ["pinecone"]],
  ["Weaviate", ["weaviate"]],
  ["Ollama", ["ollama"]],
  // protocols / misc
  ["REST", ["rest", "rest api"]],
  ["gRPC", ["grpc"]],
  ["WebRTC", ["webrtc"]],
  ["WebSocket", ["websockets", "websocket"]],
  ["OAuth", ["oauth"]],
  ["JWT", ["jwt"]],
  ["MQTT", ["mqtt"]],
  ["FFmpeg", ["ffmpeg"]],
  ["HLS", ["hls"]],
];

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Word-boundary that treats letters/digits (and #, +) as "inside a token" so
// "s3", "c++", "c#", "node.js" match cleanly and "as3"/"scala" don't false-hit.
function boundaryRegex(term: string, flags: string): RegExp {
  const body = escapeRe(term).replace(/\\?\s+/g, "\\s+");
  return new RegExp(`(?<![A-Za-z0-9+#])${body}(?![A-Za-z0-9+#])`, flags);
}

// Detect the canonical tech terms present in `text`.
export function extractTech(text: string): string[] {
  const found = new Set<string>();
  for (const [canonical, aliases, cased] of TECH_LEXICON) {
    for (const alias of aliases) {
      if (cased) {
        // require a capitalized / all-caps occurrence (case-sensitive)
        const cap = alias.charAt(0).toUpperCase() + alias.slice(1);
        if (
          boundaryRegex(cap, "").test(text) ||
          boundaryRegex(alias.toUpperCase(), "").test(text)
        ) {
          found.add(canonical);
          break;
        }
      } else if (boundaryRegex(alias, "i").test(text)) {
        found.add(canonical);
        break;
      }
    }
  }
  return [...found];
}

const NUM_WORDS: Record<string, string> = {
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
  ten: "10",
  eleven: "11",
  twelve: "12",
};

// Normalize a numeric token to a canonical comparable form:
// "~59K" → "59k", "2,800+" → "2800+", "~40%" → "40%", "2M+" → "2m+".
function normalizeMetric(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[~\s,]/g, "")
    .replace(/^0+(\d)/, "$1");
}

// Extract "significant" metric tokens from text. A token counts if it carries a
// %, +, x, magnitude (K/M/B), a decimal/comma, or is a bare integer ≥ 10 that
// is NOT a 4-digit year. Lone 1–9 integers in prose are ignored (too noisy).
export function extractMetrics(text: string): string[] {
  const out = new Set<string>();

  // spelled-out small numbers ("six checks" ≈ "6 checks")
  const lower = text.toLowerCase();
  for (const [word, digit] of Object.entries(NUM_WORDS)) {
    if (new RegExp(`(?<![a-z])${word}(?![a-z])`).test(lower)) out.add(digit);
  }

  const re = /~?\d[\d,]*(?:\.\d+)?\s*(?:%|\+|x|k\+?|m\+?|b\+?)?(?:\/[a-z]+)?/gi;
  const matches = text.match(re) ?? [];
  for (const m of matches) {
    const norm = normalizeMetric(m);
    const digits = norm.replace(/[^\d.]/g, "");
    const hasSuffix = /[%+xkmb/]/.test(norm) || norm.includes("/");
    const value = Number(digits);
    const isYear = /^\d{4}$/.test(digits) && value >= 1900 && value <= 2099 && !hasSuffix;
    if (isYear) continue;
    if (hasSuffix || value >= 10) out.add(norm);
  }
  return [...out];
}

// 4-digit years, used for the date cross-check.
export function extractYears(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.match(/\b(19|20)\d{2}\b/g) ?? []) out.add(m);
  return [...out];
}

// Ledger-known proper nouns (orgs / titles) present in text, case-insensitive.
function ledgerHits(text: string, ledger: string[]): string[] {
  const out = new Set<string>();
  for (const item of ledger) {
    if (!item.trim()) continue;
    if (boundaryRegex(item, "i").test(text)) out.add(item);
  }
  return [...out];
}

function diff<T>(a: T[], allowed: Set<T>): T[] {
  return a.filter((x) => !allowed.has(x));
}

export interface GuardInput {
  sourceText: string;
  tailoredText: string;
  sourceEntities: EntitySet;
  ledger?: { tech?: string[]; orgs?: string[]; titles?: string[] };
}

// The check. Returns faithful=true only when the tailored text introduces no
// tech/metric/org/title/date the source bullet doesn't already support.
export function checkBullet(input: GuardInput): GuardResult {
  const { sourceText, tailoredText, sourceEntities, ledger } = input;
  const flags: DriftFlag[] = [];

  // TECH — allowed = source bullet ∪ global ledger.
  const sourceTech = new Set([...extractTech(sourceText), ...sourceEntities.tech]);
  const allowedTech = new Set([...sourceTech, ...(ledger?.tech ?? [])]);
  const tailoredTech = extractTech(tailoredText);
  for (const t of diff(tailoredTech, allowedTech)) {
    flags.push({
      kind: "added-tech",
      token: t,
      message: `"${t}" isn't in this bullet or anywhere in your CV — a tailored bullet can't add a technology.`,
    });
  }

  // METRICS — strict to the source bullet (no ledger fallback).
  const sourceMetrics = new Set([
    ...extractMetrics(sourceText),
    ...sourceEntities.metrics.map(normalizeMetric),
  ]);
  const tailoredMetricsRaw = extractMetrics(tailoredText);
  for (const m of tailoredMetricsRaw) {
    if (!sourceMetrics.has(m)) {
      flags.push({
        kind: "invented-metric",
        token: m,
        message: `the number "${m}" isn't in the original bullet — numbers must be copied exactly.`,
      });
    }
  }

  // ORGS — a ledger employer that appears in the tailored bullet but not the source.
  const sourceOrgs = new Set([
    ...sourceEntities.orgs.map((o) => o.toLowerCase()),
    ...ledgerHits(sourceText, ledger?.orgs ?? []).map((o) => o.toLowerCase()),
  ]);
  for (const org of ledgerHits(tailoredText, ledger?.orgs ?? [])) {
    if (!sourceOrgs.has(org.toLowerCase())) {
      flags.push({
        kind: "off-ledger-org",
        token: org,
        message: `"${org}" belongs to a different part of your CV — it can't move onto this bullet.`,
      });
    }
  }

  // TITLES — same cross-contamination rule as orgs.
  const sourceTitles = new Set([
    ...sourceEntities.titles.map((t) => t.toLowerCase()),
    ...ledgerHits(sourceText, ledger?.titles ?? []).map((t) => t.toLowerCase()),
  ]);
  for (const title of ledgerHits(tailoredText, ledger?.titles ?? [])) {
    if (!sourceTitles.has(title.toLowerCase())) {
      flags.push({
        kind: "off-ledger-title",
        token: title,
        message: `the title "${title}" isn't the one on this role.`,
      });
    }
  }

  // DATES — years present in the tailored bullet must be in the source bullet.
  const sourceYears = new Set([
    ...extractYears(sourceText),
    ...sourceEntities.dates.flatMap(extractYears),
  ]);
  for (const y of diff(extractYears(tailoredText), sourceYears)) {
    flags.push({
      kind: "off-ledger-date",
      token: y,
      message: `the year "${y}" isn't in the original bullet.`,
    });
  }

  return {
    faithful: flags.length === 0,
    flags,
    tailoredEntities: {
      tech: tailoredTech,
      orgs: ledgerHits(tailoredText, ledger?.orgs ?? []),
      metrics: tailoredMetricsRaw,
      dates: extractYears(tailoredText),
      titles: ledgerHits(tailoredText, ledger?.titles ?? []),
    },
  };
}
