import { Injectable, Inject } from "@nestjs/common";

import { sql } from "drizzle-orm";
import { Activity, ActivityMethod } from "nestjs-temporal-core";

import { DRIZZLE } from "@metahunt/database";
import type { DrizzleDB } from "@metahunt/database";

import { VACANCY_EXTRACTOR, type VacancyExtractor } from "../vacancy-extractor";

export type StalePostingsQuery = { since?: string; limit: number };

/**
 * Canonical postings whose stored extraction was not produced by the current
 * contract. Only the canonical posting of each Position feeds `position_nodes`,
 * hence `node_stats`, so duplicates are not worth re-extracting
 * (requirement-groups.md §7).
 */
@Injectable()
@Activity()
export class StalePostingsActivity {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    @Inject(VACANCY_EXTRACTOR) private readonly extractor: VacancyExtractor,
  ) {}

  @ActivityMethod()
  async listStalePostings({ since, limit }: StalePostingsQuery): Promise<string[]> {
    // `specHash` covers the BAML source, runtime, provider, model and taxonomy;
    // the text only moves `inputHash`, so any input answers this question.
    const { specHash } = await this.extractor.identity("");

    const result = await this.db.execute<{ id: string }>(sql`
      SELECT v.last_rss_record_id AS id
      FROM unique_vacancies uv
      JOIN vacancies v ON v.id = uv.canonical_vacancy_id
      JOIN rss_records r ON r.id = v.last_rss_record_id
      WHERE (${since ?? null}::timestamptz IS NULL OR uv.first_loaded_at >= ${since ?? null})
        AND coalesce(r.extracted_data -> '_extraction' ->> 'specHash', '') <> ${specHash}
      ORDER BY uv.first_loaded_at DESC
      LIMIT ${limit}
    `);

    return result.rows.map(({ id }) => id);
  }
}
