import { randomUUID } from "node:crypto";

import { Injectable, Inject } from "@nestjs/common";

import { eq, sql } from "drizzle-orm";

import { DRIZZLE, schema } from "@metahunt/database";
import type { DrizzleDB } from "@metahunt/database";

import { omitKeys } from "../../../platform/shared/omit-keys";
import { repairUniqueVacancy } from "../../dedup/unique-vacancy-rollup";

import type { Executor } from "./executor";

export type SkillLink = { nodeId: string; isRequired: boolean };

type RssRecordRow = typeof schema.rssRecords.$inferSelect;
export type VacancyUpsertValues = typeof schema.vacancies.$inferInsert;

type LockedListing = {
  id: string;
  unique_vacancy_id: string | null;
  incoming_is_newer: boolean;
};

// Columns that must not change on a conflict update: the conflict target
// (source_id, external_id) identifies the row, loaded_at is first-seen.
const IMMUTABLE_ON_UPDATE = ["sourceId", "externalId", "loadedAt"] as const;

export abstract class VacancyRepository {
  abstract runInTransaction<T>(work: (tx: Executor) => Promise<T>): Promise<T>;
  abstract findRecord(rssRecordId: string): Promise<RssRecordRow | null>;
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
    let existing = await this.lockExistingListing(values, executor);

    if (!existing) {
      // The two rows deliberately reference each other. Their FKs are
      // DEFERRABLE INITIALLY DEFERRED (0041), so the pair is valid when this
      // transaction commits without ever exposing an ungrouped posting.
      const vacancyId = randomUUID();
      const groupId = randomUUID();
      const [inserted] = await executor
        .insert(schema.vacancies)
        .values({ ...values, id: vacancyId, uniqueVacancyId: groupId })
        .onConflictDoNothing()
        .returning({ id: schema.vacancies.id });

      if (inserted) {
        await this.createSingletonGroup(inserted.id, groupId, executor);
        await this.replaceSkills(inserted.id, skillLinks, executor);
        return inserted.id;
      }

      // Another transaction inserted this source listing after our first
      // read. Lock it and apply the same version decision as the normal path.
      existing = await this.lockExistingListing(values, executor);
      if (!existing) {
        throw new Error(
          `Vacancy ${String(values.sourceId)}/${String(values.externalId)} conflicted but cannot be read`,
        );
      }
    }

    // Activity retries and out-of-order records are normal. Replaying an old
    // bronze record must never roll the user-facing listing back.
    if (!existing.incoming_is_newer) return existing.id;

    const oldClusterId = existing.unique_vacancy_id;
    if (oldClusterId) {
      // Dedup writes lock vacancy then cluster; use the same order here.
      await executor.execute(sql`
        SELECT id
        FROM unique_vacancies
        WHERE id = ${oldClusterId}
        FOR UPDATE
      `);
    }

    // Any source-content change invalidates every derived semantic field.
    // The post-process workflow will re-embed and resolve the new version.
    await executor
      .update(schema.vacancies)
      .set({
        ...omitKeys(values, IMMUTABLE_ON_UPDATE),
        embedding: null,
        embeddingModel: null,
        embeddingSourceHash: null,
        deduplicatedAt: null,
        dedupReason: null,
        updatedAt: sql`now()`,
      })
      .where(eq(schema.vacancies.id, existing.id));

    await this.replaceSkills(existing.id, skillLinks, executor);

    if (oldClusterId) await repairUniqueVacancy(oldClusterId, executor);

    return existing.id;
  }

  private async lockExistingListing(
    values: VacancyUpsertValues,
    executor: Executor,
  ): Promise<LockedListing | null> {
    const result = await executor.execute<LockedListing>(sql`
      SELECT
        v.id,
        v.unique_vacancy_id,
        (incoming_record.created_at, incoming_record.id) >
          (current_record.created_at, current_record.id)
          AS incoming_is_newer
      FROM vacancies v
      JOIN rss_records current_record ON current_record.id = v.last_rss_record_id
      JOIN rss_records incoming_record ON incoming_record.id = ${values.lastRssRecordId}
      WHERE v.source_id = ${values.sourceId}
        AND v.external_id = ${values.externalId}
      FOR UPDATE OF v
    `);
    return result.rows[0] ?? null;
  }

  private async replaceSkills(
    vacancyId: string,
    skillLinks: SkillLink[],
    executor: Executor,
  ): Promise<void> {
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
  }

  private async createSingletonGroup(
    vacancyId: string,
    groupId: string,
    executor: Executor,
  ): Promise<void> {
    const result = await executor.execute<{ id: string }>(sql`
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
      RETURNING id
    `);
    const insertedGroupId = result.rows[0]?.id;
    if (!insertedGroupId)
      throw new Error(`Could not create singleton group for vacancy ${vacancyId}`);
  }
}
