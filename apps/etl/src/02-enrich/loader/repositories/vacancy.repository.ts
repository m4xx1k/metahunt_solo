import { Injectable, Inject } from "@nestjs/common";

import { eq, sql } from "drizzle-orm";

import { DRIZZLE, schema } from "@metahunt/database";
import type { DrizzleDB } from "@metahunt/database";

import type { Executor } from "./executor";

export type SkillLink = { nodeId: string; isRequired: boolean };

type RssRecordRow = typeof schema.rssRecords.$inferSelect;
export type VacancyUpsertValues = typeof schema.vacancies.$inferInsert;

// Columns that must not change on a conflict update: the conflict target
// (source_id, external_id) identifies the row, loaded_at is first-seen.
const IMMUTABLE_ON_UPDATE = ["sourceId", "externalId", "loadedAt"] as const;

function omit<T extends object, K extends keyof T>(obj: T, keys: readonly K[]): Omit<T, K> {
  const clone = { ...obj };
  for (const k of keys) delete (clone as Record<string, unknown>)[k as string];
  return clone;
}

// Thin DB gateway for the silver vacancy upsert. `runInTransaction` lets the
// loader run company/node resolution AND the vacancy write in one atomic unit
// of work; `upsertWithSkills` performs the row upsert + vacancy_nodes rewrite
// on whatever executor (tx) it's handed. The VacancyLoaderService just maps
// extracted data to values + skill links.
export abstract class VacancyRepository {
  abstract runInTransaction<T>(work: (tx: Executor) => Promise<T>): Promise<T>;
  abstract findRecord(rssRecordId: string): Promise<RssRecordRow | null>;
  // Insert-or-update the vacancy, then fully rewrite its skill links, all on
  // the supplied executor. Returns the vacancy id.
  abstract upsertWithSkills(
    values: VacancyUpsertValues,
    skillLinks: SkillLink[],
    executor: Executor,
  ): Promise<string>;
}

@Injectable()
export class DrizzleVacancyRepository extends VacancyRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {
    super();
  }

  runInTransaction<T>(work: (tx: Executor) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => work(tx));
  }

  async findRecord(rssRecordId: string): Promise<RssRecordRow | null> {
    const [record] = await this.db
      .select()
      .from(schema.rssRecords)
      .where(eq(schema.rssRecords.id, rssRecordId));
    return record ?? null;
  }

  async upsertWithSkills(
    values: VacancyUpsertValues,
    skillLinks: SkillLink[],
    executor: Executor,
  ): Promise<string> {
    // Derive the update SET from the insert values so insert and update can
    // never drift — add a field once and both branches pick it up.
    const [upserted] = await executor
      .insert(schema.vacancies)
      .values(values)
      .onConflictDoUpdate({
        target: [schema.vacancies.sourceId, schema.vacancies.externalId],
        set: { ...omit(values, IMMUTABLE_ON_UPDATE), updatedAt: sql`now()` },
      })
      .returning({ id: schema.vacancies.id });

    const vacancyId = upserted.id;

    await executor.delete(schema.vacancyNodes).where(eq(schema.vacancyNodes.vacancyId, vacancyId));

    if (skillLinks.length > 0) {
      await executor.insert(schema.vacancyNodes).values(
        skillLinks.map((link) => ({
          vacancyId,
          nodeId: link.nodeId,
          isRequired: link.isRequired,
        })),
      );
    }

    return vacancyId;
  }
}
