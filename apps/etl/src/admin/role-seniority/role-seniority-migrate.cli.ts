/**
 * Replays the deterministic role/seniority contract over existing vacancies.
 * Dry-run is default; remote writes additionally require --yes-prod.
 */
import "reflect-metadata";

import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";

import { sql } from "drizzle-orm";

import { DRIZZLE, DatabaseModule } from "@metahunt/database";
import type { DrizzleDB } from "@metahunt/database";

import { contentFingerprint } from "../../02-enrich/dedup/content-fingerprint";
import { assertWritableDbTarget, describeDbTarget } from "../../platform/config/db-target";
import { validateEnv } from "../../platform/config/env.validation";
import { applyRoleSeniorityPolicy } from "../../platform/shared/role-seniority-policy";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, validate: validateEnv }),
    DatabaseModule.forRoot(),
  ],
})
class RoleSeniorityMigrationModule {}

type Row = {
  vacancy_id: string;
  record_id: string;
  title: string;
  description: string | null;
  role_name: string | null;
  seniority: string | null;
  experience_years: number | null;
  content_fingerprint: string | null;
};

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const target = describeDbTarget(process.env.DATABASE_URL);
  process.stdout.write(`target: ${target.label}${target.isLocal ? " (local)" : ""}\n`);
  assertWritableDbTarget(target, {
    write: apply,
    acknowledged: process.argv.includes("--yes-prod"),
  });

  const app = await NestFactory.createApplicationContext(RoleSeniorityMigrationModule, {
    logger: ["warn", "error"],
  });
  try {
    const db = app.get<DrizzleDB>(DRIZZLE);
    const roleRows = await db.execute<{ id: string; canonical_name: string }>(sql`
      SELECT id, canonical_name FROM nodes WHERE type = 'ROLE' AND status = 'VERIFIED'
    `);
    const roleIds = new Map(roleRows.rows.map((r) => [r.canonical_name, r.id]));
    const rows = await db.execute<Row>(sql`
      SELECT v.id AS vacancy_id, rr.id AS record_id, v.title, v.description,
             role.canonical_name AS role_name, v.seniority::text AS seniority,
             v.experience_years, rr.content_fingerprint
      FROM vacancies v
      JOIN rss_records rr ON rr.id = v.last_rss_record_id
      LEFT JOIN nodes role ON role.id = v.role_node_id
      ORDER BY v.id
    `);

    let roleChanges = 0;
    let seniorityChanges = 0;
    let fingerprintChanges = 0;
    const changes: Array<{
      row: Row;
      role: string | null;
      seniority: string | null;
      fingerprint: string;
    }> = [];
    for (const row of rows.rows) {
      const next = applyRoleSeniorityPolicy({
        text: `Title: ${row.title}\n\n${row.description ?? ""}`,
        role: row.role_name,
        seniority: row.seniority as never,
        experienceYears: row.experience_years,
        knownRoles: roleIds.keys(),
      });
      const fingerprint = contentFingerprint(row.title, row.description);
      if (next.role !== row.role_name) roleChanges++;
      if (next.seniority !== row.seniority) seniorityChanges++;
      if (fingerprint !== row.content_fingerprint) fingerprintChanges++;
      if (
        next.role !== row.role_name ||
        next.seniority !== row.seniority ||
        fingerprint !== row.content_fingerprint
      ) {
        changes.push({ row, role: next.role, seniority: next.seniority, fingerprint });
      }
    }
    process.stdout.write(
      `mode=${apply ? "APPLY" : "DRY-RUN"} rows=${rows.rows.length} changed=${changes.length}` +
        ` role=${roleChanges} seniority=${seniorityChanges} fingerprint=${fingerprintChanges}\n`,
    );
    for (const change of changes.slice(0, 20)) {
      process.stdout.write(
        `  ${change.row.vacancy_id} ${change.row.role_name ?? "null"}/${change.row.seniority ?? "null"} -> ${change.role ?? "null"}/${change.seniority ?? "null"}\n`,
      );
    }
    if (changes.length > 20) process.stdout.write(`  ... ${changes.length - 20} more\n`);
    if (!apply) return;

    for (const change of changes) {
      const semanticChanged =
        change.role !== change.row.role_name || change.seniority !== change.row.seniority;
      const roleChanged = change.role !== change.row.role_name;
      const roleId = roleChanged && change.role ? (roleIds.get(change.role) ?? null) : null;
      if (roleChanged && change.role && !roleId) {
        throw new Error(`verified role missing: ${change.role}`);
      }
      await db.transaction(async (tx) => {
        if (semanticChanged) {
          await tx.execute(sql`
            UPDATE vacancies SET role_node_id = CASE WHEN ${roleChanged} THEN ${roleId}::uuid ELSE role_node_id END,
              seniority = ${change.seniority}::seniority,
              embedding = NULL, embedding_model = NULL, embedding_source_hash = NULL,
              deduplicated_at = NULL, dedup_reason = NULL, updated_at = now()
            WHERE id = ${change.row.vacancy_id}::uuid
          `);
        }
        await tx.execute(sql`
          UPDATE rss_records SET content_fingerprint = ${change.fingerprint},
            extracted_data = COALESCE(extracted_data, '{}'::jsonb) ||
              jsonb_build_object('role', ${change.role}::text, 'seniority', ${change.seniority}::text)
          WHERE id = ${change.row.record_id}::uuid
        `);
      });
    }
    const after = await db.execute<{ vacancies: string; records: string }>(sql`
      SELECT (SELECT count(*) FROM vacancies)::text AS vacancies,
             (SELECT count(*) FROM rss_records)::text AS records
    `);
    process.stdout.write(
      `applied=${changes.length}; conservation vacancies=${after.rows[0]?.vacancies} records=${after.rows[0]?.records}\n`,
    );
  } finally {
    await app.close();
  }
}

void main().catch((err) => {
  console.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
  process.exit(1);
});
