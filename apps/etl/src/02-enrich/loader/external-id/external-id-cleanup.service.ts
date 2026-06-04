import { Inject, Injectable, Logger } from "@nestjs/common";
import { and, eq, like } from "drizzle-orm";

import { DRIZZLE, schema } from "@metahunt/database";
import type { DrizzleDB } from "@metahunt/database";

import { extractExternalId } from "./source-external-id";

export type ExternalIdCleanupResult = {
  dryRun: boolean;
  vacanciesScanned: number;
  updated: number;
  deleted: number;
  skipped: number;
  rssRecordsUpdated: number;
};

// One-off cleanup: commit 57d42ea switched the external_id extractor to a
// numeric format without a data migration, leaving old vacancies/rss_records
// keyed by the full job URL. This normalizes every URL-form external_id back
// to the numeric id the extractor now produces. Idempotent — a second run is
// a no-op once everything is numeric.
@Injectable()
export class ExternalIdCleanupService {
  private readonly logger = new Logger(ExternalIdCleanupService.name);

  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async run(dryRun: boolean): Promise<ExternalIdCleanupResult> {
    return this.db.transaction(async (tx) => {
      let updated = 0;
      let deleted = 0;
      let skipped = 0;

      const urlVacancies = await tx
        .select({
          id: schema.vacancies.id,
          sourceId: schema.vacancies.sourceId,
          code: schema.sources.code,
          externalId: schema.vacancies.externalId,
        })
        .from(schema.vacancies)
        .innerJoin(
          schema.sources,
          eq(schema.sources.id, schema.vacancies.sourceId),
        )
        .where(like(schema.vacancies.externalId, "http%"));

      for (const row of urlVacancies) {
        let canonical: string;
        try {
          canonical = extractExternalId(row.code, { link: row.externalId });
        } catch {
          skipped++;
          continue;
        }
        if (canonical === row.externalId) {
          skipped++;
          continue;
        }

        const [twin] = await tx
          .select({ id: schema.vacancies.id })
          .from(schema.vacancies)
          .where(
            and(
              eq(schema.vacancies.sourceId, row.sourceId),
              eq(schema.vacancies.externalId, canonical),
            ),
          )
          .limit(1);

        if (twin) {
          if (!dryRun) {
            await tx
              .delete(schema.vacancies)
              .where(eq(schema.vacancies.id, row.id));
          }
          deleted++;
        } else {
          if (!dryRun) {
            await tx
              .update(schema.vacancies)
              .set({ externalId: canonical })
              .where(eq(schema.vacancies.id, row.id));
          }
          updated++;
        }
      }

      const urlRssRecords = await tx
        .select({
          id: schema.rssRecords.id,
          code: schema.sources.code,
          externalId: schema.rssRecords.externalId,
        })
        .from(schema.rssRecords)
        .innerJoin(
          schema.sources,
          eq(schema.sources.id, schema.rssRecords.sourceId),
        )
        .where(like(schema.rssRecords.externalId, "http%"));

      let rssRecordsUpdated = 0;
      for (const row of urlRssRecords) {
        let canonical: string;
        try {
          canonical = extractExternalId(row.code, { link: row.externalId });
        } catch {
          continue;
        }
        if (canonical === row.externalId) continue;
        if (!dryRun) {
          await tx
            .update(schema.rssRecords)
            .set({ externalId: canonical })
            .where(eq(schema.rssRecords.id, row.id));
        }
        rssRecordsUpdated++;
      }

      const result: ExternalIdCleanupResult = {
        dryRun,
        vacanciesScanned: urlVacancies.length,
        updated,
        deleted,
        skipped,
        rssRecordsUpdated,
      };
      this.logger.log(
        `external_id cleanup ${dryRun ? "(dry run) " : ""}— ${JSON.stringify(result)}`,
      );
      return result;
    });
  }
}
