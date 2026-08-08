import { randomUUID } from "node:crypto";

import { inArray, sql } from "drizzle-orm";

import { schema, type DrizzleDB } from "@metahunt/database";

import { repairUniqueVacancy } from "../../src/02-enrich/dedup/unique-vacancy-rollup";
import type { Executor } from "../../src/02-enrich/loader/repositories/executor";

export type VacancyFixtureValues = Omit<
  typeof schema.vacancies.$inferInsert,
  "id" | "uniqueVacancyId"
>;

// Mirrors DrizzleVacancyRepository: a posting and its singleton position are
// created in one transaction from a preallocated id pair, so the mandatory
// group FK (0042) holds even though the two rows reference each other.
export async function insertVacancyWithGroup(
  db: DrizzleDB,
  values: VacancyFixtureValues,
): Promise<string> {
  const vacancyId = randomUUID();
  const groupId = randomUUID();

  await db.transaction(async (tx) => {
    await tx
      .insert(schema.vacancies)
      .values({ ...values, id: vacancyId, uniqueVacancyId: groupId });

    await tx.execute(sql`
      INSERT INTO unique_vacancies (
        id,
        canonical_vacancy_id,
        representative_vacancy_id,
        source_count,
        vacancy_count,
        first_seen_at,
        last_seen_at,
        first_loaded_at
      )
      SELECT
        ${groupId}::uuid,
        v.id,
        v.id,
        1,
        1,
        COALESCE(v.published_at, v.loaded_at),
        COALESCE(v.published_at, v.loaded_at),
        v.loaded_at
      FROM vacancies v
      WHERE v.id = ${vacancyId}
    `);
  });

  return vacancyId;
}

// Collapse several singleton positions into one, the way the dedup sweep does:
// the first member's group survives, the emptied ones are reconciled away, and
// every rollup is recomputed by the single writer that owns them.
export async function mergeIntoGroup(db: DrizzleDB, memberIds: string[]): Promise<string> {
  const [survivor, ...moved] = memberIds;

  return db.transaction(async (tx) => {
    const survivorGroupId = await groupIdOf(tx, survivor);
    const emptiedGroupIds = await Promise.all(moved.map((id) => groupIdOf(tx, id)));

    await tx
      .update(schema.vacancies)
      .set({ uniqueVacancyId: survivorGroupId })
      .where(inArray(schema.vacancies.id, moved));

    for (const groupId of new Set(emptiedGroupIds)) {
      await repairUniqueVacancy(groupId, tx);
    }
    await repairUniqueVacancy(survivorGroupId, tx);

    return survivorGroupId;
  });
}

async function groupIdOf(tx: Executor, vacancyId: string): Promise<string> {
  const result = await tx.execute<{ unique_vacancy_id: string }>(
    sql`SELECT unique_vacancy_id FROM vacancies WHERE id = ${vacancyId}`,
  );
  const groupId = result.rows[0]?.unique_vacancy_id;
  if (!groupId) throw new Error(`Vacancy ${vacancyId} has no position group`);
  return groupId;
}
