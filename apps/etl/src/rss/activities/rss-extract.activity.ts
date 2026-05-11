import { Injectable, Inject } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { Activity, ActivityMethod } from "nestjs-temporal-core";

import { DRIZZLE, schema } from "@metahunt/database";
import type { DrizzleDB } from "@metahunt/database";
import {
  VACANCY_EXTRACTOR,
  type VacancyExtractor,
} from "../../extraction/vacancy-extractor";

@Injectable()
@Activity()
export class RssExtractActivity {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    @Inject(VACANCY_EXTRACTOR) private readonly extractor: VacancyExtractor,
  ) {}

  @ActivityMethod()
  async extractAndInsert(recordId: string): Promise<void> {
    const [record] = await this.db
      .select()
      .from(schema.rssRecords)
      .where(eq(schema.rssRecords.id, recordId));

    if (!record) throw new Error(`Record ${recordId} not found`);

    const text = `Title: ${record.title}\n\n${record.description ?? ""}`;
    const result = await this.extractor.extract(text);
    const sidecar = {
      _v: result.meta.promptVersion,
      _usage: result.meta.usage,
    };

    if (!result.data) {
      // Persist usage of the failed attempt so its tokens are not lost from
      // cost analysis, then re-throw so Temporal can retry. If a retry
      // succeeds, this row is overwritten with the success payload — for now
      // we accept that approximation (see plan: typed-dazzling-quail.md).
      await this.db
        .update(schema.rssRecords)
        .set({
          extractedData: { ...sidecar, _error: result.meta.error },
          extractedAt: new Date(),
        })
        .where(eq(schema.rssRecords.id, recordId));
      throw new Error(result.meta.error ?? "extraction failed");
    }

    await this.db
      .update(schema.rssRecords)
      .set({
        extractedData: { ...result.data, ...sidecar },
        extractedAt: new Date(),
      })
      .where(eq(schema.rssRecords.id, recordId));
  }
}
