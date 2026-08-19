/*
 * Read-only production-candidate intake for the human-labelled golden set.
 * It deliberately emits source references locally rather than committing raw
 * vacancy text or guessing labels. The reviewer de-identifies and promotes
 * chosen cases into golden-set.role-contract.v1.json.
 */
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { Pool } from "pg";

import { normalizedVacancyContent } from "../../02-enrich/dedup/content-fingerprint";

type Slice =
  | "architect"
  | "lead-discipline"
  | "executive"
  | "generic-role"
  | "data-ai-boundary"
  | "qa-boundary"
  | "mobile-boundary";

type CandidateRow = {
  vacancy_id: string;
  rss_record_id: string;
  title: string;
  description: string | null;
  stored_role: string | null;
  stored_seniority: string | null;
  slice: Slice;
};

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const perSlice = value("--per-slice", 6);
  if (!Number.isInteger(perSlice) || perSlice < 1 || perSlice > 10) {
    throw new Error("--per-slice must be an integer from 1 to 10");
  }
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const result = await pool.query<CandidateRow>(
      `
      WITH classified AS (
        SELECT
          v.id::text AS vacancy_id,
          r.id::text AS rss_record_id,
          r.title,
          r.description,
          role.canonical_name AS stored_role,
          v.seniority::text AS stored_seniority,
          CASE
            WHEN r.title ~* '\\marchitect\\M' THEN 'architect'
            WHEN r.title ~* '(tech lead|team lead|\\mlead\\M)' THEN 'lead-discipline'
            WHEN r.title ~* '(\\mcto\\M|chief technology|\\mvp\\M|head of engineering)' THEN 'executive'
            WHEN r.title ~* 'software engineer' THEN 'generic-role'
            WHEN r.title ~* '(data engineer|data analyst|data scientist|machine learning|\\mai engineer\\M)' THEN 'data-ai-boundary'
            WHEN r.title ~* '(\\mqa\\M|\\msdet\\M|quality assurance)' THEN 'qa-boundary'
            WHEN r.title ~* '(\\mios\\M|android|mobile|flutter|react native)' THEN 'mobile-boundary'
          END AS slice,
          row_number() OVER (
            PARTITION BY CASE
              WHEN r.title ~* '\\marchitect\\M' THEN 'architect'
              WHEN r.title ~* '(tech lead|team lead|\\mlead\\M)' THEN 'lead-discipline'
              WHEN r.title ~* '(\\mcto\\M|chief technology|\\mvp\\M|head of engineering)' THEN 'executive'
              WHEN r.title ~* 'software engineer' THEN 'generic-role'
              WHEN r.title ~* '(data engineer|data analyst|data scientist|machine learning|\\mai engineer\\M)' THEN 'data-ai-boundary'
              WHEN r.title ~* '(\\mqa\\M|\\msdet\\M|quality assurance)' THEN 'qa-boundary'
              WHEN r.title ~* '(\\mios\\M|android|mobile|flutter|react native)' THEN 'mobile-boundary'
            END
            ORDER BY v.published_at DESC NULLS LAST, v.id DESC
          ) AS rank_in_slice
        FROM vacancies v
        JOIN rss_records r ON r.id = v.last_rss_record_id
        LEFT JOIN nodes role ON role.id = v.role_node_id
        WHERE r.title <> '' AND r.description IS NOT NULL
          AND v.published_at >= now() - interval '365 days'
      )
      SELECT vacancy_id, rss_record_id, title, description, stored_role, stored_seniority, slice
      FROM classified
      WHERE slice IS NOT NULL AND rank_in_slice <= $1
      ORDER BY slice, vacancy_id
      `,
      [perSlice],
    );
    const candidates = result.rows.map((row) => ({
      source: "production_candidate",
      sourceReference: { vacancyId: row.vacancy_id, rssRecordId: row.rss_record_id },
      slice: row.slice,
      text: normalizedVacancyContent(row.title, row.description),
      currentStored: { role: row.stored_role, seniority: row.stored_seniority },
      reviewStatus: "draft",
      requiresDeidentification: true,
    }));
    const intake = {
      generatedAt: new Date().toISOString(),
      perSlice,
      candidateCount: candidates.length,
      note: "Read-only intake. De-identify and human-label before copying cases into the versioned golden set.",
      candidates,
    };
    const out = stringValue("--out");
    if (out) {
      const path = resolve(out);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, `${JSON.stringify(intake, null, 2)}\n`, { mode: 0o600 });
      await chmod(path, 0o600);
      console.log(
        JSON.stringify({ mode: "read-only-intake", out: path, candidateCount: candidates.length }),
      );
    } else {
      console.log(JSON.stringify(intake, null, 2));
    }
  } finally {
    await pool.end();
  }
}

function value(flag: string, fallback: number): number {
  const index = process.argv.indexOf(flag);
  if (index < 0) return fallback;
  const result = Number(process.argv[index + 1]);
  if (!Number.isFinite(result)) throw new Error(`${flag} must be a number`);
  return result;
}

function stringValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  const result = process.argv[index + 1];
  return index >= 0 && result ? result : undefined;
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
