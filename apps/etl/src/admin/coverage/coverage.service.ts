import { BadRequestException, Inject, Injectable } from "@nestjs/common";

import { sql } from "drizzle-orm";

import { DRIZZLE } from "@metahunt/database";
import type { DrizzleDB } from "@metahunt/database";

import {
  LOOKUP_MAX_LINES,
  type CoverageLookupResponse,
  type CoverageMatch,
  type CoverageRow,
  type CoverageSummary,
  type CoverageVerdict,
  type SourceHealth,
} from "./coverage.contract";
import {
  legacyExternalIdLikePattern,
  resolveUrl,
  splitInput,
  supportedHosts,
} from "./url-resolver";

type PostingRow = {
  posting_id: string;
  position_id: string;
  external_id: string;
  title: string;
  company_name: string | null;
  source_code: string;
  rss_record_id: string | null;
  // Raw db.execute() output — a driver string, not yet a Date. See toDate().
  published_at: string | Date | null;
  loaded_at: string | Date;
};

type PositionEligibility = {
  canonical_posting_id: string;
  posting_count: number;
  source_count: number;
  eligible: boolean;
};

@Injectable()
export class CoverageService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async lookup(rawInput: string): Promise<CoverageLookupResponse> {
    const lines = splitInput(rawInput);
    if (lines.length === 0) {
      throw new BadRequestException("input must contain at least one non-blank line");
    }
    if (lines.length > LOOKUP_MAX_LINES) {
      throw new BadRequestException(
        `at most ${LOOKUP_MAX_LINES} lines per lookup, got ${lines.length}`,
      );
    }

    const rows = await Promise.all(lines.map((line) => this.resolveOne(line)));

    // Health is per source, not per row — one lie ("source is fine") shouldn't
    // repeat 50 times because 50 pasted URLs happened to come from Djinni.
    const sourcesToExplain = new Set(
      rows
        .filter((r) => r.verdict === "not_found" || r.verdict === "seen_but_not_loaded")
        .map((r) => r.sourceCode)
        .filter((code): code is string => code !== null),
    );
    const sourceHealth = await Promise.all(
      [...sourcesToExplain].map((code) => this.getSourceHealth(code)),
    );

    return { rows, summary: summarize(rows), sourceHealth, supportedHosts: supportedHosts() };
  }

  private async resolveOne(raw: string): Promise<CoverageRow> {
    const resolved = resolveUrl(raw);

    if (resolved.kind === "unparseable") {
      return this.row(raw, "url_not_parseable", resolved.reason, null, null, null, null);
    }
    if (resolved.kind === "unsupported_host") {
      return this.row(
        raw,
        "source_not_supported",
        `we do not poll ${resolved.host}. supported: ${supportedHosts().join(", ")}`,
        null,
        null,
        null,
        null,
      );
    }
    if (resolved.kind === "metahunt") {
      const posting = await this.findPostingById(resolved.postingId);
      if (!posting) {
        return this.row(raw, "not_found", "no vacancy with this id", null, null, null, null);
      }
      return this.rowFromPosting(raw, posting, false);
    }

    // resolved.kind === "source"
    const { sourceCode, externalId } = resolved;
    const exact = await this.findPostingBySourceExternalId(sourceCode, externalId);
    if (exact) return this.rowFromPosting(raw, exact, false);

    const legacyPattern = legacyExternalIdLikePattern(sourceCode, externalId);
    if (legacyPattern) {
      const legacy = await this.findPostingBySourceExternalIdLike(sourceCode, legacyPattern);
      if (legacy) return this.rowFromPosting(raw, legacy, true);
    }

    const record = await this.findRssRecord(sourceCode, externalId, legacyPattern);
    if (record) {
      return this.row(
        raw,
        "seen_but_not_loaded",
        "RSS delivered this record, but no vacancy was ever created from it",
        sourceCode,
        externalId,
        null,
        `/dashboard/records/${record.id}`,
      );
    }

    return this.row(raw, "not_found", null, sourceCode, externalId, null, null);
  }

  private async rowFromPosting(
    raw: string,
    posting: PostingRow,
    legacy: boolean,
  ): Promise<CoverageRow> {
    const position = await this.getPositionEligibility(posting.position_id);
    const publishedAt = posting.published_at ? toDate(posting.published_at) : null;
    const loadedAt = toDate(posting.loaded_at);
    const match: CoverageMatch = {
      positionId: posting.position_id,
      postingId: posting.posting_id,
      title: posting.title,
      companyName: posting.company_name,
      sourceCode: posting.source_code,
      publishedAt: publishedAt?.toISOString() ?? null,
      loadedAt: loadedAt.toISOString(),
      ingestLagMinutes: lagMinutes(publishedAt, loadedAt),
      postingCount: position?.posting_count ?? 1,
      sourceCount: position?.source_count ?? 1,
      isCanonical: position ? position.canonical_posting_id === posting.posting_id : true,
      vacancyPath: `/vacancy/${posting.posting_id}`,
      legacyExternalIdForm: legacy,
    };
    const recordPath = posting.rss_record_id ? `/dashboard/records/${posting.rss_record_id}` : null;
    const verdict: CoverageVerdict = position?.eligible === false ? "found_not_visible" : "found";
    const detail =
      verdict === "found_not_visible" ? "position exists but its role is not verified" : null;

    return {
      input: raw,
      verdict,
      detail,
      sourceCode: posting.source_code,
      externalId: posting.external_id,
      match,
      recordPath,
    };
  }

  private row(
    input: string,
    verdict: CoverageVerdict,
    detail: string | null,
    sourceCode: string | null,
    externalId: string | null,
    match: CoverageMatch | null,
    recordPath: string | null,
  ): CoverageRow {
    return { input, verdict, detail, sourceCode, externalId, match, recordPath };
  }

  private async findPostingById(postingId: string): Promise<PostingRow | null> {
    const res = await this.db.execute<PostingRow>(sql`
      SELECT posting_id, position_id, external_id, title, company_name, source_code,
             rss_record_id, published_at, loaded_at
      FROM postings
      WHERE posting_id = ${postingId}::uuid
    `);
    return res.rows[0] ?? null;
  }

  private async findPostingBySourceExternalId(
    sourceCode: string,
    externalId: string,
  ): Promise<PostingRow | null> {
    const res = await this.db.execute<PostingRow>(sql`
      SELECT posting_id, position_id, external_id, title, company_name, source_code,
             rss_record_id, published_at, loaded_at
      FROM postings
      WHERE source_code = ${sourceCode} AND external_id = ${externalId}
      ORDER BY loaded_at DESC
      LIMIT 1
    `);
    return res.rows[0] ?? null;
  }

  private async findPostingBySourceExternalIdLike(
    sourceCode: string,
    pattern: string,
  ): Promise<PostingRow | null> {
    const res = await this.db.execute<PostingRow>(sql`
      SELECT posting_id, position_id, external_id, title, company_name, source_code,
             rss_record_id, published_at, loaded_at
      FROM postings
      WHERE source_code = ${sourceCode} AND external_id LIKE ${pattern}
      ORDER BY loaded_at DESC
      LIMIT 1
    `);
    return res.rows[0] ?? null;
  }

  private async findRssRecord(
    sourceCode: string,
    externalId: string,
    legacyPattern: string | null,
  ): Promise<{ id: string } | null> {
    const res = await this.db.execute<{ id: string }>(sql`
      SELECT r.id
      FROM rss_records r
      JOIN sources s ON s.id = r.source_id
      WHERE s.code = ${sourceCode}
        AND (r.external_id = ${externalId} ${legacyPattern ? sql`OR r.external_id LIKE ${legacyPattern}` : sql``})
      ORDER BY r.created_at DESC
      LIMIT 1
    `);
    return res.rows[0] ?? null;
  }

  private async getPositionEligibility(positionId: string): Promise<PositionEligibility | null> {
    const res = await this.db.execute<PositionEligibility>(sql`
      SELECT
        pos.canonical_posting_id,
        pos.posting_count,
        pos.source_count,
        EXISTS (
          SELECT 1 FROM nodes rn WHERE rn.id = pos.role_node_id AND rn.status = 'VERIFIED'
        ) AS eligible
      FROM positions pos
      WHERE pos.position_id = ${positionId}::uuid
    `);
    return res.rows[0] ?? null;
  }

  private async getSourceHealth(sourceCode: string): Promise<SourceHealth> {
    const res = await this.db.execute<{
      last_ingest_status: string | null;
      last_ingest_finished_at: string | Date | null;
      last_ingest_error: string | null;
      postings_last_24h: number;
      postings_last_7d: number;
    }>(sql`
      SELECT
        li.status AS last_ingest_status,
        li.finished_at AS last_ingest_finished_at,
        li.error_message AS last_ingest_error,
        (SELECT count(*)::int FROM vacancies v
          WHERE v.source_id = s.id AND v.loaded_at > now() - interval '24 hours') AS postings_last_24h,
        (SELECT count(*)::int FROM vacancies v
          WHERE v.source_id = s.id AND v.loaded_at > now() - interval '7 days') AS postings_last_7d
      FROM sources s
      LEFT JOIN LATERAL (
        SELECT status, finished_at, error_message
        FROM rss_ingests
        WHERE source_id = s.id
        ORDER BY started_at DESC
        LIMIT 1
      ) li ON true
      WHERE s.code = ${sourceCode}
    `);
    const row = res.rows[0];
    return {
      sourceCode,
      lastIngestStatus: row?.last_ingest_status ?? null,
      lastIngestFinishedAt: row?.last_ingest_finished_at
        ? toDate(row.last_ingest_finished_at).toISOString()
        : null,
      lastIngestError: row?.last_ingest_error ?? null,
      postingsLast24h: row?.postings_last_24h ?? 0,
      postingsLast7d: row?.postings_last_7d ?? 0,
    };
  }
}

function toDate(v: string | Date): Date {
  return v instanceof Date ? v : new Date(v);
}

function lagMinutes(publishedAt: Date | null, loadedAt: Date): number | null {
  if (!publishedAt) return null;
  return Math.round((loadedAt.getTime() - publishedAt.getTime()) / 60_000);
}

function summarize(rows: CoverageRow[]): CoverageSummary {
  const byVerdict: Record<CoverageVerdict, number> = {
    found: 0,
    found_not_visible: 0,
    seen_but_not_loaded: 0,
    not_found: 0,
    source_not_supported: 0,
    url_not_parseable: 0,
  };
  for (const row of rows) byVerdict[row.verdict] += 1;

  // Unsupported hosts and unparseable pastes aren't coverage gaps on the
  // sources we claim to poll — counting them would understate coverage.
  const checked = rows.length - byVerdict.source_not_supported - byVerdict.url_not_parseable;
  const found = byVerdict.found + byVerdict.found_not_visible;

  const lags = rows
    .map((r) => r.match?.ingestLagMinutes)
    .filter((v): v is number => v != null)
    .sort((a, b) => a - b);
  const medianLagMinutes = lags.length === 0 ? null : lags[Math.floor((lags.length - 1) / 2)];

  return {
    total: rows.length,
    found,
    checked,
    coveragePct: checked === 0 ? null : Math.round((found / checked) * 1000) / 10,
    medianLagMinutes,
    byVerdict,
  };
}
