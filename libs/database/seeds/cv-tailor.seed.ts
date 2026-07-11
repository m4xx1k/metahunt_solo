import { createHash } from "node:crypto";

import { eq } from "drizzle-orm";

import { candidates, candidateNodes } from "../src/schema";
import type { DrizzleDB } from "../src/tokens";

import { resolveSkillIds } from "./candidates.seed";

// Seed ONE structured-resume demo candidate for the /cv-tailor page (ADR-0011).
// The data is the founder's real CV (l3/{backend,fullstack}-v1 union → full bullet
// pool), so the tailoring demo runs on genuine facts with ZERO extraction spend.
// Writes candidates.structured (the fact ledger) plus the flat extracted + skill
// links so the same profile also ranks in reverse-ATS. Idempotent on contentHash.

interface SeedBullet {
  text: string;
  tech: string[]; // canonical tech named in `text` (drives relevance + guard)
  metrics: string[]; // verbatim number tokens in `text`
}
interface SeedEntry {
  role: string;
  org: string;
  dates: string;
  context: string;
  max?: number;
  bullets: SeedBullet[];
}

const SUMMARY =
  "Full-stack engineer with 4 years building web products end to end — event-driven backends and real-time ETL pipelines, AI-powered features on LLM APIs (OpenAI, Gemini) over Elasticsearch and Postgres, and React/Next.js on the front when a problem needs it. TypeScript across the whole stack (NestJS, PostgreSQL, AWS). Works AI-first with agentic coding tools like Claude Code.";
const SUMMARY_TECH = [
  "OpenAI",
  "Gemini",
  "Elasticsearch",
  "PostgreSQL",
  "React",
  "Next.js",
  "TypeScript",
  "NestJS",
  "AWS",
];

// Clean, individually-resolvable skill items (the founder's " · " lines split out).
const SKILL_GROUPS: { group: string; items: string[] }[] = [
  {
    group: "Backend",
    items: ["TypeScript", "Node.js", "NestJS", "GraphQL", "REST", "SQS", "BullMQ", "Temporal"],
  },
  {
    group: "Frontend",
    items: ["React", "Next.js", "TypeScript", "Tailwind CSS", "React Query", "React Native"],
  },
  { group: "Databases", items: ["PostgreSQL", "Elasticsearch", "Redis", "TypeORM", "Prisma"] },
  {
    group: "Infra",
    items: ["AWS", "ECS", "Lambda", "S3", "CloudFront", "RDS", "Terraform", "Terragrunt", "Docker"],
  },
  { group: "AI Engineering", items: ["OpenAI", "Gemini", "RAG"] },
];

const EXPERIENCE: SeedEntry[] = [
  {
    role: "Full-Stack & AI Engineer",
    org: "Beana AI (AlephOne)",
    dates: "Sep 2025 – Jul 2026",
    context:
      "AI B2B platform for promotional-product sales — NestJS/GraphQL + React, Elasticsearch, AWS (ECS), OpenAI/Gemini.",
    max: 5,
    bullets: [
      {
        text: "Drove splitting the supplier-ingestion ETL out of the NestJS monolith into independent services — deployed as separate AWS ECS Fargate services over SQS — to speed up ingestion and make pipeline state observable.",
        tech: ["NestJS", "AWS", "ECS", "Fargate", "SQS"],
        metrics: [],
      },
      {
        text: "Built the ingestion pipeline that normalizes 80+ supplier catalogs into one product model — ~59K products, 577K parts, 2M+ price points — with idempotent, retry-safe batches sustaining ~1.5K+ messages/min across ~30 ECS workers at a near-zero dead-letter rate.",
        tech: ["ECS"],
        metrics: ["80+", "59K", "577K", "2M+", "1.5K", "30"],
      },
      {
        text: "Owned the AI product-mockup pipeline end to end: it applies a client's logo to products with Gemini, then an LLM scores six quality checks and auto-rejects weak results — 2,800+ mockups generated with no manual review.",
        tech: ["Gemini"],
        metrics: ["2,800+", "six"],
      },
      {
        text: "Built core stages of the Elasticsearch search behind the AI assistant — retrieval → dedupe → scoring → LLM re-rank — turning a free-text buyer brief into ranked, relevant results over the catalog.",
        tech: ["Elasticsearch"],
        metrics: [],
      },
      {
        text: "Contributed to the Terraform/Terragrunt infrastructure (ECS, SQS, S3, CloudWatch) running the platform across dev/stage/prod, and built AI-assisted CLI tooling to verify ETL state and catch stuck batches.",
        tech: ["Terraform", "Terragrunt", "ECS", "SQS", "S3", "CloudWatch"],
        metrics: [],
      },
      {
        text: "Co-built a custom DAG workflow engine that runs post-ingestion AI enrichment on the OpenAI Batch API, with cancellation that also stops in-flight jobs.",
        tech: ["OpenAI"],
        metrics: [],
      },
    ],
  },
  {
    role: "Full-Stack Engineer",
    org: "IDS Group",
    dates: "2024 – 2025",
    context:
      "Fintech & media web platforms — Cash-U P2P exchange; multi-tenant media streaming SaaS.",
    max: 4,
    bullets: [
      {
        text: "Built the multi-tenant routing layer for a media SaaS — resolves each request's tenant by domain and routes to its dedicated database (database-per-tenant isolation).",
        tech: [],
        metrics: [],
      },
      {
        text: "Cut video-conversion time ~40% with a custom video→HLS pipeline (BullMQ + FFmpeg) and real-time upload progress.",
        tech: ["BullMQ", "FFmpeg", "HLS"],
        metrics: ["~40%"],
      },
      {
        text: "Built fintech async workflows on RabbitMQ, plus secure multi-provider auth with MFA (JWT + Redis) and an RBAC admin panel (Prisma + PostgreSQL).",
        tech: ["RabbitMQ", "JWT", "Redis", "Prisma", "PostgreSQL"],
        metrics: [],
      },
      {
        text: "Reduced user input errors ~40% by rebuilding multi-step financial forms with real-time validation; supported a redesign that lifted retention ~30%.",
        tech: [],
        metrics: ["~40%", "~30%"],
      },
      {
        text: "Built a reusable React component library that standardized the UI and accelerated delivery across the team.",
        tech: ["React"],
        metrics: [],
      },
    ],
  },
  {
    role: "Backend / Full-Stack Engineer",
    org: "Contract / Self-Employed",
    dates: "2022 – 2024",
    context: "End-to-end web, mobile, and backend products for multiple clients.",
    max: 3,
    bullets: [
      {
        text: "Delivered RepostUZ, a Telegram Mini App for civic voting, solo end to end (NestJS, Prisma, PostgreSQL, Redis) — one-vote-per-user auth, with caching/aggregation that cut DB load ~60% at peak.",
        tech: ["NestJS", "Prisma", "PostgreSQL", "Redis"],
        metrics: ["~60%"],
      },
      {
        text: "Built a real-time communication app for logistics drivers (React Native, WebRTC, Node signaling) — chat, push, and reconnection stable on poor mobile networks.",
        tech: ["React Native", "WebRTC", "Node.js"],
        metrics: [],
      },
      {
        text: "Built web scrapers/parsers, Telegram bots, and Node/React apps across multiple client contracts.",
        tech: ["Node.js", "React"],
        metrics: [],
      },
    ],
  },
];

const PROJECT: SeedEntry = {
  role: "solo · B.Sc. thesis",
  org: "MetaHunt — job-market intelligence platform",
  dates: "",
  context: "NestJS + Temporal backend · Next.js frontend · PostgreSQL",
  max: 3,
  bullets: [
    {
      text: "Designed, built, and deployed it solo — a Temporal-driven pipeline from scraping job boards to three products: a public feed, a CV matcher, and a Telegram bot.",
      tech: ["Temporal"],
      metrics: [],
    },
    {
      text: "Built the operator console and public feed in Next.js — a faceted job feed plus protected dashboards (funnel, KPI, dedup-quality) and a taxonomy-moderation UI.",
      tech: ["Next.js"],
      metrics: [],
    },
    {
      text: "Built a reverse-ATS matcher: an LLM reads an uploaded CV and ranks every role by skill fit, weighting rare skills higher, with a have/missing/bonus breakdown.",
      tech: [],
      metrics: [],
    },
    {
      text: "Built semantic dedup that merges the same job reposted across boards into one listing, using vector similarity with a two-signal gate to avoid false merges.",
      tech: [],
      metrics: [],
    },
    {
      text: "Set up ingestion as re-run-safe Temporal workflows with a typed LLM extraction step grounded on a curated skill taxonomy.",
      tech: ["Temporal"],
      metrics: [],
    },
  ],
};

function atom(id: string, b: SeedBullet, org: string, dates: string, title: string) {
  return {
    id,
    text: b.text,
    sourceSpan: b.text, // curated ground truth — the bullet IS the source span
    entities: {
      tech: b.tech,
      orgs: org ? [org] : [],
      metrics: b.metrics,
      dates: dates ? [dates] : [],
      titles: title ? [title] : [],
    },
  };
}

function buildStructured() {
  return {
    name: "Maksym Fabin",
    title: "Full-Stack & AI Engineer",
    contacts: {
      location: "Lviv, Ukraine (UTC+3)",
      email: "maxikfabin@gmail.com",
      linkedin: "linkedin.com/in/maksym-fabin",
      github: "github.com/m4xx1k",
      telegram: "@m4xx1k",
    },
    summary: {
      id: "sum",
      text: SUMMARY,
      sourceSpan: SUMMARY,
      entities: { tech: SUMMARY_TECH, orgs: [], metrics: [], dates: [], titles: [] },
    },
    skills: SKILL_GROUPS,
    experience: EXPERIENCE.map((e, i) => ({
      id: `exp${i + 1}`,
      role: e.role,
      org: e.org,
      dates: e.dates,
      context: e.context,
      max: e.max,
      bullets: e.bullets.map((b, j) => atom(`exp${i + 1}.b${j + 1}`, b, e.org, e.dates, e.role)),
    })),
    projects: [
      {
        id: "pr1",
        name: PROJECT.org,
        meta: PROJECT.role,
        link: "github.com/m4xx1k",
        context: PROJECT.context,
        bullets: PROJECT.bullets.map((b, j) => atom(`pr1.b${j + 1}`, b, "", "", "")),
      },
    ],
    education: [
      {
        degree: "B.Sc. in Computer Engineering",
        school: "Lviv Polytechnic National University",
        dates: "",
      },
    ],
  };
}

const LABEL = "CV tailoring demo — Full-Stack & AI";
const HINT = "structured resume · tailor to any job";

export async function seedTailorSample(db: DrizzleDB): Promise<void> {
  const structured = buildStructured();
  const skills = [...new Set(SKILL_GROUPS.flatMap((g) => g.items))];
  const sourceText = `Structured demo profile: ${LABEL}\nSkills: ${skills.join(", ")}`;
  const contentHash = createHash("sha256")
    .update(sourceText.replace(/\s+/g, " ").toLowerCase())
    .digest("hex");
  const { ids, unmatched } = await resolveSkillIds(db, skills);

  const extracted = {
    role: "Fullstack Developer",
    seniority: "MIDDLE" as const,
    skills: { required: skills, optional: [] as string[] },
    experienceYears: 4,
    englishLevel: "ADVANCED" as const,
    unmatchedSkills: unmatched,
    sample: { label: LABEL, hint: HINT },
  };
  const base = {
    contentHash,
    sourceText,
    extracted,
    structured,
    type: "sample" as const,
    role: "Fullstack Developer",
    seniority: "MIDDLE" as const,
    englishLevel: "ADVANCED" as const,
    experienceYears: 4,
  };

  const [{ id: candidateId }] = await db
    .insert(candidates)
    .values(base)
    .onConflictDoUpdate({
      target: candidates.contentHash,
      set: {
        extracted,
        structured,
        type: "sample",
        role: "Fullstack Developer",
        seniority: "MIDDLE",
        englishLevel: "ADVANCED",
        experienceYears: 4,
      },
    })
    .returning({ id: candidates.id });

  await db.delete(candidateNodes).where(eq(candidateNodes.candidateId, candidateId));
  if (ids.length > 0) {
    await db
      .insert(candidateNodes)
      .values(ids.map((nodeId) => ({ candidateId, nodeId })))
      .onConflictDoNothing();
  }
  console.log(`Seed: tailoring sample candidate ${candidateId} (${ids.length} skills linked)`);
}
