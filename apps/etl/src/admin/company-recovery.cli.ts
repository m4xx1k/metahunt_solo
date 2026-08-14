/**
 * @oneshot — repairs the historic company-slug collapse, then gets deleted.
 *
 * The old resolver reduced Cyrillic-only names to an empty slug, so every
 * affected vacancy landed on one company row. `slugifyCompany` now romanises
 * and falls back to a digest, so the collapse cannot recur in code; the
 * `companies.slug` CHECK added alongside this repair is what makes that
 * permanent. The latest RSS record still carries the authoritative
 * `extracted_data.companyName`, which is what restores both the vacancies and
 * the source-scoped identifiers.
 *
 * This file has no tests on purpose: it runs once per database and is removed
 * in the PR that records the result. The lasting artefacts are the CHECK
 * constraint and the journal entry, not this script.
 *
 * Dry run: pnpm company:recover
 * Apply:   pnpm company:recover --apply
 * Prod:    DATABASE_URL=$(scripts/prod-db-url.sh) pnpm company:recover --apply --yes-prod
 */
import { Pool, type PoolClient } from "pg";

import { slugifyCompany } from "../02-enrich/loader/services/company-slug";
import {
  DbTargetRefusal,
  assertWritableDbTarget,
  describeDbTarget,
} from "../platform/config/db-target";

const SAFE_SLUG = "^[a-z0-9][a-z0-9-]*$";

// A source saying "employer not stated" is not an employer. Minting a company
// from it would resolve every future unattributed posting to that fake row.
const NON_COMPANY_NAMES = new Set(["не вказано", "не указано", "not specified", "n/a", "-", "—"]);

const isNonCompany = (name: string): boolean => NON_COMPANY_NAMES.has(name.trim().toLowerCase());

type BrokenCompany = { id: string; name: string; slug: string };
type Vacancy = { id: string; sourceId: string; name: string };
type Identifier = { sourceId: string; name: string };
type Group = { slug: string; name: string; vacancyIds: string[]; identifiers: Identifier[] };
type Unattributed = { vacancyIds: string[]; identifiers: Identifier[] };
type Recovery = { groups: Map<string, Group>; unattributed: Unattributed };

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");

  // Name the target before touching it, and make a remote write need a second
  // word — same contract as taxonomy:migrate (MET-133).
  const target = describeDbTarget(process.env.DATABASE_URL);
  process.stdout.write(`target: ${target.label}${target.isLocal ? " (local)" : ""}\n`);
  assertWritableDbTarget(target, {
    write: apply,
    acknowledged: process.argv.includes("--yes-prod"),
  });

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  try {
    if (apply) {
      await client.query("BEGIN");
      // Prevent a concurrent loader run from attaching a vacancy to the legacy
      // row between our audit and reassignment.
      await client.query(
        "LOCK TABLE companies, company_identifiers, vacancies IN SHARE ROW EXCLUSIVE MODE",
      );
    }

    const broken = await brokenCompanies(client);
    if (!broken.length) {
      console.log("No companies have an unsafe slug; nothing to recover.");
      if (apply) await client.query("COMMIT");
      return;
    }

    const { groups, unattributed } = await recoveryGroups(
      client,
      broken.map((company) => company.id),
    );
    const targets = await targetCompanies(client);

    console.log(
      `Broken companies: ${broken.length} · recovered companies: ${groups.size} · ` +
        `vacancies to move: ${[...groups.values()].reduce((n, group) => n + group.vacancyIds.length, 0)}`,
    );
    for (const group of groups.values()) {
      console.log(`  ${group.slug} ← ${group.name} (${group.vacancyIds.length} vacancies)`);
    }
    if (unattributed.vacancyIds.length || unattributed.identifiers.length) {
      console.log(
        `Unattributed (no employer stated): ${unattributed.vacancyIds.length} vacancies → company_id NULL, ` +
          `${unattributed.identifiers.length} identifier(s) dropped`,
      );
      for (const identifier of unattributed.identifiers)
        console.log(`  drop identifier: ${identifier.name}`);
    }

    if (!apply) {
      console.log("Dry run — pass --apply to perform this transaction.");
      return;
    }

    for (const group of groups.values()) {
      let companyId = targets.get(group.slug);
      if (!companyId) {
        const inserted = await client.query<{ id: string }>(
          "INSERT INTO companies (name, slug) VALUES ($1, $2) RETURNING id",
          [group.name, group.slug],
        );
        companyId = inserted.rows[0].id;
        targets.set(group.slug, companyId);
      }

      if (group.vacancyIds.length) {
        await client.query("UPDATE vacancies SET company_id = $1 WHERE id = ANY($2::uuid[])", [
          companyId,
          group.vacancyIds,
        ]);
      }
      for (const identifier of group.identifiers) {
        await client.query(
          "UPDATE company_identifiers SET company_id = $1 WHERE source_id = $2 AND source_company_name = $3",
          [companyId, identifier.sourceId, identifier.name],
        );
      }
    }

    if (unattributed.vacancyIds.length) {
      await client.query("UPDATE vacancies SET company_id = NULL WHERE id = ANY($1::uuid[])", [
        unattributed.vacancyIds,
      ]);
    }
    for (const identifier of unattributed.identifiers) {
      await client.query(
        "DELETE FROM company_identifiers WHERE source_id = $1 AND source_company_name = $2",
        [identifier.sourceId, identifier.name],
      );
    }

    const removed = await client.query<{ id: string }>(
      `DELETE FROM companies c
       WHERE c.id = ANY($1::uuid[])
         AND NOT EXISTS (SELECT 1 FROM vacancies v WHERE v.company_id = c.id)
         AND NOT EXISTS (SELECT 1 FROM company_identifiers ci WHERE ci.company_id = c.id)
       RETURNING c.id`,
      [broken.map((company) => company.id)],
    );
    if (removed.rowCount !== broken.length) {
      throw new Error(
        `Refusing to leave a partial recovery: removed ${removed.rowCount} of ${broken.length} legacy rows`,
      );
    }
    // Migration 0051 added this NOT VALID so it could deploy ahead of the repair.
    // Validating here is the proof that no unsafe slug survived, and it rolls the
    // whole transaction back if one did.
    await client.query("ALTER TABLE companies VALIDATE CONSTRAINT companies_slug_safe");
    await client.query("COMMIT");
    console.log(
      `Applied. Removed ${removed.rowCount} empty legacy company row(s); companies_slug_safe is now validated.`,
    );
  } catch (error) {
    if (apply) await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

async function brokenCompanies(client: PoolClient): Promise<BrokenCompany[]> {
  const result = await client.query<BrokenCompany>(
    `SELECT id, name, slug
       FROM companies
      WHERE slug !~ $1
      ORDER BY created_at, id`,
    [SAFE_SLUG],
  );
  return result.rows;
}

async function recoveryGroups(client: PoolClient, companyIds: string[]): Promise<Recovery> {
  const [vacancies, identifiers] = await Promise.all([
    client.query<Vacancy>(
      `SELECT v.id, v.source_id AS "sourceId", btrim(r.extracted_data->>'companyName') AS name
         FROM vacancies v
         JOIN rss_records r ON r.id = v.last_rss_record_id
        WHERE v.company_id = ANY($1::uuid[])`,
      [companyIds],
    ),
    client.query<Identifier>(
      `SELECT source_id AS "sourceId", source_company_name AS name
         FROM company_identifiers
        WHERE company_id = ANY($1::uuid[])`,
      [companyIds],
    ),
  ]);

  const groups = new Map<string, Group>();
  const unattributed: Unattributed = { vacancyIds: [], identifiers: [] };
  const add = (name: string): Group => {
    const slug = slugifyCompany(name);
    const current = groups.get(slug);
    if (current) return current;
    const created = { slug, name, vacancyIds: [], identifiers: [] };
    groups.set(slug, created);
    return created;
  };

  for (const vacancy of vacancies.rows) {
    if (!vacancy.name)
      throw new Error(`Vacancy ${vacancy.id} has no recoverable source company name`);
    if (isNonCompany(vacancy.name)) unattributed.vacancyIds.push(vacancy.id);
    else add(vacancy.name).vacancyIds.push(vacancy.id);
  }
  for (const identifier of identifiers.rows) {
    if (isNonCompany(identifier.name)) unattributed.identifiers.push(identifier);
    else add(identifier.name).identifiers.push(identifier);
  }
  return { groups, unattributed };
}

async function targetCompanies(client: PoolClient): Promise<Map<string, string>> {
  const result = await client.query<{ id: string; slug: string }>(
    "SELECT id, slug FROM companies WHERE slug ~ $1",
    [SAFE_SLUG],
  );
  return new Map(result.rows.map((company) => [company.slug, company.id]));
}

void main().catch((err) => {
  // A wrong target is a refusal, not a crash, and refusals exit 2 across this repo.
  if (err instanceof DbTargetRefusal) {
    console.error(`\ncompany:recover — ${err.message}`);
    process.exit(2);
  }
  console.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
  process.exit(1);
});
