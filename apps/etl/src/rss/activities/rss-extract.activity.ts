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
    const extracted = await this.extractor.extract(text);

    await this.db
      .update(schema.rssRecords)
      .set({ extractedData: extracted, extractedAt: new Date() })
      .where(eq(schema.rssRecords.id, recordId));
  }
}
