import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  and,
  count,
  desc,
  eq,
  gte,
  ilike,
  isNotNull,
  isNull,
  lte,
  sql,
  type SQL,
} from "drizzle-orm";

import { DRIZZLE, schema } from "@metahunt/database";
import type { DrizzleDB } from "@metahunt/database";

const { rssIngests, rssRecords, sources } = schema;

export type IngestStatus = "running" | "completed" | "failed";

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
  extracted?: boolean;
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
        extractedCount: sql<number>`count(${rssRecords.extractedAt})::int`,
      })
      .from(rssIngests)
      .leftJoin(sources, eq(sources.id, rssIngests.sourceId))
      .leftJoin(rssRecords, eq(rssRecords.rssIngestId, rssIngests.id))
      .where(where)
      .groupBy(rssIngests.id, sources.id)
      .orderBy(desc(rssIngests.startedAt))
      .limit(params.limit)
      .offset(params.offset);

    const totalRow = await this.db
      .select({ value: count() })
      .from(rssIngests)
      .where(where);
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
        extractedCount: sql<number>`count(${rssRecords.extractedAt})::int`,
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

    const totalRow = await this.db
      .select({ value: count() })
      .from(rssRecords)
      .where(where);
    const total = totalRow[0]?.value ?? 0;

    const items = rows.map((r) => ({ ...r, extracted: r.extractedAt !== null }));
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
    return { ...r, extracted: r.extractedAt !== null };
  }

  async stats() {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [
      ingestTotalRow,
      ingestLast24hRow,
      ingestByStatusRows,
      recordTotalRow,
      recordExtractedRow,
      recordLast24hRow,
      latestPerSource,
    ] = await Promise.all([
      this.db.select({ value: count() }).from(rssIngests),
      this.db
        .select({ value: count() })
        .from(rssIngests)
        .where(gte(rssIngests.startedAt, since24h)),
      this.db
        .select({ status: rssIngests.status, value: count() })
        .from(rssIngests)
        .groupBy(rssIngests.status),
      this.db.select({ value: count() }).from(rssRecords),
      this.db
        .select({ value: count() })
        .from(rssRecords)
        .where(isNotNull(rssRecords.extractedAt)),
      this.db
        .select({ value: count() })
        .from(rssRecords)
        .where(gte(rssRecords.createdAt, since24h)),
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

    const byStatus: Record<string, number> = {};
    for (const r of ingestByStatusRows) byStatus[r.status] = r.value;

    const ingestTotal = ingestTotalRow[0]?.value ?? 0;
    const recordTotal = recordTotalRow[0]?.value ?? 0;
    const recordExtracted = recordExtractedRow[0]?.value ?? 0;

    return {
      ingests: {
        total: ingestTotal,
        last24h: ingestLast24hRow[0]?.value ?? 0,
        byStatus,
      },
      records: {
        total: recordTotal,
        extracted: recordExtracted,
        notExtracted: recordTotal - recordExtracted,
        last24h: recordLast24hRow[0]?.value ?? 0,
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
  if (params.extracted === true) {
    filters.push(isNotNull(rssRecords.extractedAt));
  }
  if (params.extracted === false) {
    filters.push(isNull(rssRecords.extractedAt));
  }
  if (params.q) filters.push(ilike(rssRecords.title, `%${params.q}%`));
  if (filters.length === 0) return undefined;
  return and(...filters);
}

function decorateIngest<
  T extends { startedAt: Date; finishedAt: Date | null },
>(row: T): T & { durationMs: number | null } {
  const durationMs = row.finishedAt
    ? row.finishedAt.getTime() - row.startedAt.getTime()
    : null;
  return { ...row, durationMs };
}
