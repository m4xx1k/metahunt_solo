import { ApiProperty } from "@nestjs/swagger";

import { IsString, MaxLength, MinLength } from "class-validator";

export const LOOKUP_MAX_CHARS = 32_000;
export const LOOKUP_MAX_LINES = 100;

export class CoverageLookupDto {
  @ApiProperty({
    description: "One vacancy URL per line, up to 100 lines.",
    example: "https://jobs.dou.ua/companies/acme/vacancies/350774/",
  })
  @IsString()
  @MinLength(1)
  @MaxLength(LOOKUP_MAX_CHARS)
  input!: string;
}

// "Not found" is four different bugs wearing one face. The verdict names which.
export const COVERAGE_VERDICTS = [
  // We have it, and the feed can show it.
  "found",
  // We have it, but its position is filtered out of every public surface —
  // a taxonomy gap, not an ingest gap.
  "found_not_visible",
  // RSS delivered it, the loader never turned it into a vacancy.
  "seen_but_not_loaded",
  // Nothing in the database, and the source is one we poll.
  "not_found",
  // We do not ingest this host at all — no claim either way.
  "source_not_supported",
  // A URL on a source we do poll, but not a vacancy URL (search page, company page).
  "url_not_parseable",
] as const;

export type CoverageVerdict = (typeof COVERAGE_VERDICTS)[number];

export type CoverageMatch = {
  positionId: string;
  postingId: string;
  title: string;
  companyName: string | null;
  sourceCode: string;
  publishedAt: string | null;
  loadedAt: string;
  // First publish → in our database. The roadmap's latency metric, per row.
  ingestLagMinutes: number | null;
  // The source re-dated this listing after we first saw it (a paid "bump"),
  // so `publishedAt` no longer reflects when it first went live.
  wasBumpedSincePublish: boolean;
  postingCount: number;
  sourceCount: number;
  isCanonical: boolean;
  // /vacancy/<postingId> — any member posting id resolves (see
  // apps/web/lib/seo/vacancy-url.ts), so no slug lookup is needed here.
  vacancyPath: string;
  // The row was matched through the pre-57d42ea Djinni form, where
  // `external_id` holds the whole URL (md/todo/external-id-duplication-fix.md).
  legacyExternalIdForm: boolean;
};

// Why a miss is plausible, attached once per source rather than per row.
export type SourceHealth = {
  sourceCode: string;
  lastIngestStatus: string | null;
  lastIngestFinishedAt: string | null;
  lastIngestError: string | null;
  postingsLast24h: number;
  postingsLast7d: number;
};

export type CoverageRow = {
  input: string;
  verdict: CoverageVerdict;
  detail: string | null;
  sourceCode: string | null;
  externalId: string | null;
  match: CoverageMatch | null;
  // /dashboard/records/<rss_records.id> — the pipeline's own record browser
  // keys on the raw RSS row, not the posting or position. Set whenever we
  // found *a* record (loaded or not); null when we never saw one at all.
  recordPath: string | null;
};

export type CoverageSummary = {
  total: number;
  found: number;
  // Share of inputs we could have had — inputs on unsupported hosts and
  // non-vacancy URLs are excluded, because counting them would understate
  // coverage of the sources we actually claim to poll.
  checked: number;
  coveragePct: number | null;
  medianLagMinutes: number | null;
  byVerdict: Record<CoverageVerdict, number>;
};

export type CoverageLookupResponse = {
  rows: CoverageRow[];
  summary: CoverageSummary;
  sourceHealth: SourceHealth[];
  supportedHosts: string[];
};
