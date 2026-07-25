/**
 * One-off backfill: re-slug companies whose `slug` is empty or not URL-safe.
 *
 * The company slugifier used to strip every non-ASCII character with no fallback,
 * so an employer named entirely in Cyrillic got slug "". Because `companies.slug`
 * is UNIQUE and the resolver looks companies up BY slug, every such employer
 * collapsed into one row; the empty slug also read as falsy in the feed DTO, which
 * reported those vacancies as having no employer (and so made them permanently
 * ineligible for JobPosting, where hiringOrganization is required).
 *
 *   DRY RUN (default):  npx ts-node --project tsconfig.json scripts/backfill-company-slugs.ts
 *   APPLY:              npx ts-node --project tsconfig.json scripts/backfill-company-slugs.ts --apply
 *
 * Reads DATABASE_URL from env.
 *
 * Does NOT un-merge companies already collapsed into one row. The raw names
 * survive in `company_identifiers`, but `vacancies.company_id` points at the
 * merged row and no vacancy records which raw name it arrived under, so splitting
 * them means re-deriving that from the source records. Separate job.
 */
import "dotenv/config";
import { Pool } from "pg";

import { slugifyCompany } from "../apps/etl/src/02-enrich/loader/services/company-slug";

const SLUG_OK = /^[a-z0-9][a-z0-9-]*$/;

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    const { rows } = await pool.query<{ id: string; name: string; slug: string; vacancies: number }>(
      `SELECT c.id, c.name, c.slug, count(v.id)::int AS vacancies
         FROM companies c
         LEFT JOIN vacancies v ON v.company_id = c.id
        GROUP BY c.id, c.name, c.slug`,
    );

    const taken = new Set(rows.map((r) => r.slug).filter((s) => SLUG_OK.test(s)));
    const broken = rows.filter((r) => !SLUG_OK.test(r.slug));

    console.log(`companies: ${rows.length} · needing a new slug: ${broken.length}`);

    for (const row of broken) {
      let candidate = slugifyCompany(row.name);
      // Distinct names can romanise to the same base; keep the UNIQUE happy.
      if (taken.has(candidate)) {
        let i = 2;
        while (taken.has(`${candidate}-${i}`)) i += 1;
        candidate = `${candidate}-${i}`;
      }
      taken.add(candidate);

      console.log(
        `  ${JSON.stringify(row.slug)} -> ${JSON.stringify(candidate)}  ${row.name}  (${row.vacancies} vacancies)`,
      );

      if (apply) {
        await pool.query("UPDATE companies SET slug = $1 WHERE id = $2", [candidate, row.id]);
      }
    }

    console.log(apply ? "applied" : "dry run — pass --apply to write");
  } finally {
    await pool.end();
  }
}

void main();
