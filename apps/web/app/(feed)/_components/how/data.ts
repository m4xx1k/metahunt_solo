// Static demo copy for the animated "how it works" section (the deduped total is
// live from `aggregates`). Match %/tiers use the real cutoffs — see tierOf.

export type BadgeTone = "sen" | "role" | "money" | "plain" | "reservation";

export interface ParseSample {
  text: string;
  badges: { label: string; tone: BadgeTone }[];
}

// Stage 02: a raw posting types out, then the parsed fields pop in as badges.
export const PARSE_SAMPLES: ParseSample[] = [
  {
    text: "Senior Full Stack JS Engineer. Product startup, remote. You own features end-to-end: Node.js, React, TypeScript, Postgres, AWS. $5–7k.",
    badges: [
      { label: "Senior", tone: "sen" },
      { label: "Full-stack", tone: "role" },
      { label: "Node.js", tone: "plain" },
      { label: "React", tone: "plain" },
      { label: "TypeScript", tone: "plain" },
      { label: "Postgres", tone: "plain" },
      { label: "AWS", tone: "plain" },
      { label: "Remote", tone: "plain" },
      { label: "$5–7k", tone: "money" },
    ],
  },
  {
    text: "Шукаємо Senior Golang інженера. Go, PostgreSQL, Kafka; буде плюсом gRPC. Remote, вилка $6000–8000. Є тестове завдання.",
    badges: [
      { label: "Senior", tone: "sen" },
      { label: "Backend", tone: "role" },
      { label: "Go", tone: "plain" },
      { label: "PostgreSQL", tone: "plain" },
      { label: "Kafka", tone: "plain" },
      { label: "Remote", tone: "plain" },
      { label: "$6–8k", tone: "money" },
      { label: "test task", tone: "plain" },
      { label: "reservation", tone: "reservation" },
    ],
  },
  {
    text: "Data Engineer. Build the data platform: Python, Airflow, dbt, Snowflake. Nice to have: Spark. Remote EU, $6–8k.",
    badges: [
      { label: "Middle+", tone: "sen" },
      { label: "Data Eng", tone: "role" },
      { label: "Python", tone: "plain" },
      { label: "Airflow", tone: "plain" },
      { label: "dbt", tone: "plain" },
      { label: "Snowflake", tone: "plain" },
      { label: "Remote", tone: "plain" },
      { label: "$6–8k", tone: "money" },
    ],
  },
];

export interface MatchJob {
  name: string;
  coverage: number; // required-skill coverage %, drives bar + tier
}

export interface Scenario {
  cv: string;
  skills: string[];
  jobs: MatchJob[];
}

// Stage 03: a CV's skills rank the market by IDF relevance; coverage % + tier.
export const SCENARIOS: Scenario[] = [
  {
    cv: "olena_backend.pdf",
    skills: ["Go", "PostgreSQL", "Kafka", "AWS", "Docker"],
    jobs: [
      { name: "Senior Go · high-load", coverage: 94 },
      { name: "Backend Node · fintech", coverage: 81 },
      { name: "Platform Eng · Go/k8s", coverage: 68 },
      { name: "Data Eng · Python", coverage: 52 },
      { name: "Frontend · React", coverage: 24 },
    ],
  },
  {
    cv: "andrii_fullstack.pdf",
    skills: ["React", "TypeScript", "Node.js", "Next.js", "GraphQL"],
    jobs: [
      { name: "Full-stack JS · product", coverage: 88 },
      { name: "React Lead · SaaS", coverage: 76 },
      { name: "Node Backend · startup", coverage: 63 },
      { name: "DevOps · AWS", coverage: 45 },
      { name: "Mobile · Flutter", coverage: 19 },
    ],
  },
  {
    cv: "maria_data.pdf",
    skills: ["Python", "SQL", "Airflow", "dbt", "Spark"],
    jobs: [
      { name: "Data Eng · Airflow", coverage: 91 },
      { name: "ML Eng · Python", coverage: 74 },
      { name: "Analytics Eng · dbt", coverage: 66 },
      { name: "BI Analyst · SQL", coverage: 49 },
      { name: "Backend · Go", coverage: 22 },
    ],
  },
];

export type Tier = "STRONG" | "GOOD" | "STRETCH";

// Real cutoffs from the ranking model (coverage ≥ 0.8 / ≥ 0.5).
export function tierOf(coverage: number): Tier {
  if (coverage >= 80) return "STRONG";
  if (coverage >= 50) return "GOOD";
  return "STRETCH";
}
