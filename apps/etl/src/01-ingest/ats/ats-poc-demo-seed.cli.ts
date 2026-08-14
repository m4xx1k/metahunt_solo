// Safe, idempotent local-only data for viewing /ats without any network fetch
// or LLM extraction. It uses a distinct `ats:demo:*` source, so it cannot
// overwrite a real board imported by ats-poc-pipeline.

import "dotenv/config";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { schema } from "@metahunt/database";

const SOURCE_ID = "00000000-0000-4000-8000-000000000054";
const INGEST_ID = "00000000-0000-4000-8000-000000000055";
const NOW = new Date("2026-07-28T09:00:00.000Z");

type DemoJob = {
  id: string;
  externalId: string;
  title: string;
  link: string;
  locations: string[];
  workFormat: "REMOTE" | "HYBRID" | "OFFICE" | null;
  salaryMin: number | null;
  salaryMax: number | null;
  currency: "USD" | "EUR" | null;
  salaryPeriod: "YEAR" | "MONTH" | null;
  closedAt?: Date;
};

const JOBS: DemoJob[] = [
  {
    id: "00000000-0000-4000-8000-000000000101",
    externalId: "demo-annual",
    title: "Senior Platform Engineer",
    link: "https://jobs.ashbyhq.com/openai",
    locations: ["Kyiv, Ukraine", "Remote"],
    workFormat: "REMOTE",
    // Stored monthly by the loader; salaryPeriod tells the UI to show 120–180k/year.
    salaryMin: 10_000,
    salaryMax: 15_000,
    currency: "USD",
    salaryPeriod: "YEAR",
  },
  {
    id: "00000000-0000-4000-8000-000000000102",
    externalId: "demo-hybrid",
    title: "Data Analyst",
    link: "https://boards.greenhouse.io/nix",
    locations: ["Lviv, Ukraine"],
    workFormat: "HYBRID",
    salaryMin: 3_000,
    salaryMax: 4_000,
    currency: "EUR",
    salaryPeriod: "MONTH",
  },
  {
    id: "00000000-0000-4000-8000-000000000103",
    externalId: "demo-closed",
    title: "Backend Engineer (closed example)",
    link: "https://jobs.lever.co/eleks",
    locations: ["Kyiv, Ukraine"],
    workFormat: "OFFICE",
    salaryMin: null,
    salaryMax: null,
    currency: null,
    salaryPeriod: null,
    closedAt: new Date("2026-07-20T12:00:00.000Z"),
  },
  {
    id: "00000000-0000-4000-8000-000000000104",
    externalId: "demo-review",
    title: "Parser review example",
    link: "https://jobs.ashbyhq.com/openai",
    locations: [],
    workFormat: null,
    salaryMin: null,
    salaryMax: null,
    currency: null,
    salaryPeriod: null,
  },
];

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema });
  try {
    await db
      .insert(schema.sources)
      .values({
        id: SOURCE_ID,
        code: "ats:demo:local-review",
        displayName: "ATS demo board",
        baseUrl: "https://jobs.ashbyhq.com/openai",
        kind: "ats",
        atsType: "ashby",
        atsSlug: "local-review",
      })
      .onConflictDoUpdate({
        target: schema.sources.code,
        set: { displayName: "ATS demo board", baseUrl: "https://jobs.ashbyhq.com/openai" },
      });

    await db
      .insert(schema.rssIngests)
      .values({
        id: INGEST_ID,
        sourceId: SOURCE_ID,
        workflowRunId: "ats-demo-seed-v1",
        triggeredBy: "demo-seed",
        startedAt: NOW,
        finishedAt: NOW,
        status: "completed",
      })
      .onConflictDoUpdate({
        target: schema.rssIngests.workflowRunId,
        set: { finishedAt: NOW, status: "completed" },
      });

    for (const job of JOBS) {
      const recordId = job.id
        .replace(/1$/, "5")
        .replace(/2$/, "6")
        .replace(/3$/, "7")
        .replace(/4$/, "8");
      await db
        .insert(schema.rssRecords)
        .values({
          id: recordId,
          sourceId: SOURCE_ID,
          rssIngestId: INGEST_ID,
          externalId: job.externalId,
          hash: `ats-demo-${job.externalId}`,
          publishedAt: NOW,
          title: job.title,
          link: job.link,
          atsFields: { locations: job.locations, isRemote: job.workFormat === "REMOTE" },
          extractedData: {},
          extractedAt: NOW,
        })
        .onConflictDoUpdate({
          target: [schema.rssRecords.sourceId, schema.rssRecords.hash],
          set: { title: job.title, link: job.link, publishedAt: NOW },
        });

      await db
        .insert(schema.vacancies)
        .values({
          id: job.id,
          sourceId: SOURCE_ID,
          externalId: job.externalId,
          lastRssRecordId: recordId,
          title: job.title,
          locations: job.locations,
          workFormat: job.workFormat,
          salaryMin: job.salaryMin,
          salaryMax: job.salaryMax,
          currency: job.currency,
          salaryPeriod: job.salaryPeriod,
          salarySource: job.salaryMin == null ? null : "ATS_STRUCTURED",
          salaryRaw: job.salaryMin == null ? null : "demo structured salary",
          publishedAt: NOW,
          closedAt: job.closedAt ?? null,
        })
        .onConflictDoUpdate({
          target: [schema.vacancies.sourceId, schema.vacancies.externalId],
          set: {
            title: job.title,
            locations: job.locations,
            workFormat: job.workFormat,
            salaryMin: job.salaryMin,
            salaryMax: job.salaryMax,
            currency: job.currency,
            salaryPeriod: job.salaryPeriod,
            salarySource: job.salaryMin == null ? null : "ATS_STRUCTURED",
            closedAt: job.closedAt ?? null,
            lastRssRecordId: recordId,
            updatedAt: NOW,
          },
        });
    }
    process.stdout.write(
      `ATS demo seed ready: ${JOBS.length} postings (one annual salary, one closed, one review case).\n`,
    );
  } finally {
    await pool.end();
  }
}

void main();
