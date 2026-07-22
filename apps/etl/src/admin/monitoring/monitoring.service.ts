import { Inject, Injectable, NotFoundException } from "@nestjs/common";

import { and, count, desc, eq, gte, ilike, isNull, lte, sql, type SQL } from "drizzle-orm";

import { DRIZZLE, schema } from "@metahunt/database";
import type { DrizzleDB } from "@metahunt/database";

import {
  extractionStatus,
  hasExtractionError,
  type ExtractionStatus,
} from "../../platform/shared/extraction-status";
import { reportingPeriodSince, type ReportingPeriod } from "../../platform/shared/reporting-period";

const { rssIngests, rssRecords, sources, vacancies, uniqueVacancies } = schema;

export type IngestStatus = "running" | "completed" | "failed";

// Periods the operator dashboard can pivot on. `all` = no since-filter.
export type StatsPeriod = Exclude<ReportingPeriod, "30d">;

export interface ListIngestsParams {
  sourceId?: string;
  status?: IngestStatus;
  since?: Date;
  until?: Date;
  limit: number;
  offset: number;
}

export interface ListRecordsParams {
  ingestId?: string;
  sourceId?: string;
  extractionStatus?: ExtractionStatus;
  q?: string;
  limit: number;
  offset: number;
}

@Injectable()
export class MonitoringService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async listSources() {
    return this.db
      .select({
        id: sources.id,
        code: sources.code,
        displayName: sources.displayName,
        baseUrl: sources.baseUrl,
        rssUrl: sources.rssUrl,
      })
      .from(sources)
      .orderBy(sources.displayName);
  }

  async listIngests(params: ListIngestsParams) {
    const where = buildIngestWhere(params);

    const rows = await this.db
      .select({
        ...ingestSelect,
        recordCount: sql<number>`count(${rssRecords.id})::int`,
        succeededCount: sql<number>`count(${rssRecords.id}) filter (where ${rssRecords.extractedAt} is not null and not coalesce(${rssRecords.extractedData} ? '_error', false))::int`,
        failedCount: sql<number>`count(${rssRecords.id}) filter (where ${rssRecords.extractedAt} is not null and coalesce(${rssRecords.extractedData} ? '_error', false))::int`,
        pendingCount: sql<number>`count(${rssRecords.id}) filter (where ${rssRecords.extractedAt} is null)::int`,
      })
      .from(rssIngests)
      .leftJoin(sources, eq(sources.id, rssIngests.sourceId))
      .leftJoin(rssRecords, eq(rssRecords.rssIngestId, rssIngests.id))
      .where(where)
      .groupBy(rssIngests.id, sources.id)
      .orderBy(desc(rssIngests.startedAt))
      .limit(params.limit)
      .offset(params.offset);

    const totalRow = await this.db.select({ value: count() }).from(rssIngests).where(where);
    const total = totalRow[0]?.value ?? 0;

    const items = rows.map(decorateIngest);
    return {
      items,
      total,
      limit: params.limit,
      offset: params.offset,
      hasMore: params.offset + items.length < total,
    };
  }

  async getIngest(id: string) {
    const rows = await this.db
      .select({
        ...ingestSelect,
        recordCount: sql<number>`count(${rssRecords.id})::int`,
        succeededCount: sql<number>`count(${rssRecords.id}) filter (where ${rssRecords.extractedAt} is not null and not coalesce(${rssRecords.extractedData} ? '_error', false))::int`,
        failedCount: sql<number>`count(${rssRecords.id}) filter (where ${rssRecords.extractedAt} is not null and coalesce(${rssRecords.extractedData} ? '_error', false))::int`,
        pendingCount: sql<number>`count(${rssRecords.id}) filter (where ${rssRecords.extractedAt} is null)::int`,
      })
      .from(rssIngests)
      .leftJoin(sources, eq(sources.id, rssIngests.sourceId))
      .leftJoin(rssRecords, eq(rssRecords.rssIngestId, rssIngests.id))
      .where(eq(rssIngests.id, id))
      .groupBy(rssIngests.id, sources.id);
    if (rows.length === 0) {
      throw new NotFoundException(`ingest ${id} not found`);
    }
    return decorateIngest(rows[0]);
  }

  async listRecords(params: ListRecordsParams) {
    const where = buildRecordWhere(params);

    const rows = await this.db
      .select({
        id: rssRecords.id,
        sourceId: rssRecords.sourceId,
        sourceCode: sources.code,
        sourceDisplayName: sources.displayName,
        rssIngestId: rssRecords.rssIngestId,
        externalId: rssRecords.externalId,
        hash: rssRecords.hash,
        title: rssRecords.title,
        description: rssRecords.description,
        link: rssRecords.link,
        category: rssRecords.category,
        publishedAt: rssRecords.publishedAt,
        createdAt: rssRecords.createdAt,
        extractedAt: rssRecords.extractedAt,
        extractedData: rssRecords.extractedData,
      })
      .from(rssRecords)
      .leftJoin(sources, eq(sources.id, rssRecords.sourceId))
      .where(where)
      .orderBy(desc(rssRecords.publishedAt))
      .limit(params.limit)
      .offset(params.offset);

    const totalRow = await this.db.select({ value: count() }).from(rssRecords).where(where);
    const total = totalRow[0]?.value ?? 0;

    const items = rows.map((r) => ({
      ...r,
      extractionStatus: extractionStatus(r.extractedAt, r.extractedData),
    }));
    return {
      items,
      total,
      limit: params.limit,
      offset: params.offset,
      hasMore: params.offset + items.length < total,
    };
  }

  async getRecord(id: string) {
    const rows = await this.db
      .select({
        id: rssRecords.id,
        sourceId: rssRecords.sourceId,
        sourceCode: sources.code,
        sourceDisplayName: sources.displayName,
        rssIngestId: rssRecords.rssIngestId,
        externalId: rssRecords.externalId,
        hash: rssRecords.hash,
        title: rssRecords.title,
        description: rssRecords.description,
        link: rssRecords.link,
        category: rssRecords.category,
        publishedAt: rssRecords.publishedAt,
        createdAt: rssRecords.createdAt,
        extractedAt: rssRecords.extractedAt,
        extractedData: rssRecords.extractedData,
      })
      .from(rssRecords)
      .leftJoin(sources, eq(sources.id, rssRecords.sourceId))
      .where(eq(rssRecords.id, id));
    if (rows.length === 0) {
      throw new NotFoundException(`record ${id} not found`);
    }
    const r = rows[0];
    return {
      ...r,
      extractionStatus: extractionStatus(r.extractedAt, r.extractedData),
    };
  }

  // Period-scoped operator stats. The dashboard funnel reads Bronze →
  // Silver → Gold counts within `period`; duplicatesMerged = silver
  // records that joined a pre-existing group (silver − newGoldGroups).
  async stats(period: StatsPeriod = "24h") {
    const since = reportingPeriodSince(period);
    const bronzeFilter = since ? gte(rssRecords.createdAt, since) : undefined;
    const silverFilter = since ? gte(vacancies.loadedAt, since) : undefined;
    const goldFilter = since ? gte(uniqueVacancies.createdAt, since) : undefined;
    const ingestFilter = since ? gte(rssIngests.startedAt, since) : undefined;

    const [
      bronzeRow,
      silverRow,
      goldRow,
      ingestTotalRow,
      ingestByStatusRows,
      llmCostRow,
      latestPerSource,
    ] = await Promise.all([
      // Bronze — raw rss_records collected in period.
      this.db.select({ value: count() }).from(rssRecords).where(bronzeFilter),
      // Silver — structured vacancies loaded in period.
      this.db.select({ value: count() }).from(vacancies).where(silverFilter),
      // Gold — NEW Golden Record groups born in period.
      this.db.select({ value: count() }).from(uniqueVacancies).where(goldFilter),
      // Ingest total in period (used for header context).
      this.db.select({ value: count() }).from(rssIngests).where(ingestFilter),
      // Ingest status breakdown in period.
      this.db
        .select({ status: rssIngests.status, value: count() })
        .from(rssIngests)
        .where(ingestFilter)
        .groupBy(rssIngests.status),
      // LLM extraction cost in period (reads the extraction_cost view).
      this.db.execute<{
        count: string;
        failures: string;
        tokens_in: string | null;
        tokens_out: string | null;
        cost_usd: string | null;
      }>(sql`
        SELECT
          COUNT(*)                                  AS count,
          COUNT(*) FILTER (WHERE is_failure)        AS failures,
          COALESCE(SUM(tokens_in), 0)               AS tokens_in,
          COALESCE(SUM(tokens_out), 0)              AS tokens_out,
          COALESCE(SUM(cost_usd), 0)                AS cost_usd
        FROM extraction_cost
        ${since ? sql`WHERE extracted_at >= ${since}` : sql``}
      `),
      // latestPerSource stays period-agnostic — operators always want
      // "current freshness of each source", regardless of which period
      // is selected for the funnel.
      this.db
        .selectDistinctOn([rssIngests.sourceId], {
          sourceId: rssIngests.sourceId,
          sourceCode: sources.code,
          sourceDisplayName: sources.displayName,
          lastIngestId: rssIngests.id,
          lastIngestAt: rssIngests.startedAt,
          lastFinishedAt: rssIngests.finishedAt,
          lastStatus: rssIngests.status,
        })
        .from(rssIngests)
        .leftJoin(sources, eq(sources.id, rssIngests.sourceId))
        .orderBy(rssIngests.sourceId, desc(rssIngests.startedAt)),
    ]);

    const ingestStatus: Record<IngestStatus, number> = {
      completed: 0,
      running: 0,
      failed: 0,
    };
    for (const r of ingestByStatusRows) {
      if (r.status in ingestStatus) {
        ingestStatus[r.status as IngestStatus] = r.value;
      }
    }

    const bronze = bronzeRow[0]?.value ?? 0;
    const silver = silverRow[0]?.value ?? 0;
    const gold = goldRow[0]?.value ?? 0;
    const duplicatesMerged = Math.max(silver - gold, 0);

    const cost = llmCostRow.rows[0];
    return {
      period,
      funnel: {
        bronze,
        silver,
        gold,
        duplicatesMerged,
      },
      ingests: {
        total: ingestTotalRow[0]?.value ?? 0,
        completed: ingestStatus.completed,
        failed: ingestStatus.failed,
        running: ingestStatus.running,
      },
      llmCost: {
        count: Number(cost?.count ?? 0),
        failures: Number(cost?.failures ?? 0),
        tokensIn: Number(cost?.tokens_in ?? 0),
        tokensOut: Number(cost?.tokens_out ?? 0),
        costUsd: Number(cost?.cost_usd ?? 0),
      },
      latestPerSource,
    };
  }
}

const ingestSelect = {
  id: rssIngests.id,
  sourceId: rssIngests.sourceId,
  sourceCode: sources.code,
  sourceDisplayName: sources.displayName,
  status: rssIngests.status,
  triggeredBy: rssIngests.triggeredBy,
  workflowRunId: rssIngests.workflowRunId,
  startedAt: rssIngests.startedAt,
  finishedAt: rssIngests.finishedAt,
  payloadStorageKey: rssIngests.payloadStorageKey,
  errorMessage: rssIngests.errorMessage,
} as const;

function buildIngestWhere(params: ListIngestsParams): SQL | undefined {
  const filters: SQL[] = [];
  if (params.sourceId) filters.push(eq(rssIngests.sourceId, params.sourceId));
  if (params.status) filters.push(eq(rssIngests.status, params.status));
  if (params.since) filters.push(gte(rssIngests.startedAt, params.since));
  if (params.until) filters.push(lte(rssIngests.startedAt, params.until));
  if (filters.length === 0) return undefined;
  return and(...filters);
}

function buildRecordWhere(params: ListRecordsParams): SQL | undefined {
  const filters: SQL[] = [];
  if (params.ingestId) {
    filters.push(eq(rssRecords.rssIngestId, params.ingestId));
  }
  if (params.sourceId) filters.push(eq(rssRecords.sourceId, params.sourceId));
  if (params.extractionStatus === "pending") {
    filters.push(isNull(rssRecords.extractedAt));
  }
  if (params.extractionStatus === "failed") {
    filters.push(
      sql`${rssRecords.extractedAt} is not null and ${hasExtractionError(rssRecords.extractedData)}`,
    );
  }
  if (params.extractionStatus === "succeeded") {
    filters.push(
      sql`${rssRecords.extractedAt} is not null and not ${hasExtractionError(rssRecords.extractedData)}`,
    );
  }
  if (params.q) filters.push(ilike(rssRecords.title, `%${params.q}%`));
  if (filters.length === 0) return undefined;
  return and(...filters);
}

function decorateIngest<T extends { startedAt: Date; finishedAt: Date | null }>(
  row: T,
): T & { durationMs: number | null } {
  const durationMs = row.finishedAt ? row.finishedAt.getTime() - row.startedAt.getTime() : null;
  return { ...row, durationMs };
}
