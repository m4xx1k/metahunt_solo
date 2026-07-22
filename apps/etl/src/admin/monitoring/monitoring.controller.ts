import { Controller, Get, Param, Query } from "@nestjs/common";
import { ApiBadRequestResponse, ApiOkResponse, ApiOperation, ApiQuery } from "@nestjs/swagger";

import { EXTRACTION_STATUSES } from "../../platform/shared/extraction-status";
import {
  parseEnum,
  parseIso,
  parseLimit,
  parseOffset,
  parseRequiredUuid,
  parseUuid,
} from "../../platform/shared/query-parsing";
import { REPORTING_PERIODS } from "../../platform/shared/reporting-period";
import { ApiErrorResponseDto } from "../../platform/swagger/api-error.dto";
import { OperatorApi } from "../../platform/swagger/operator-api.decorator";

import { MonitoringService, type StatsPeriod } from "./monitoring.service";

const INGEST_STATUSES = ["running", "completed", "failed"] as const;
// Every REPORTING_PERIODS member except "30d" (see StatsPeriod in
// monitoring.service.ts) — derived so the two lists can't drift apart.
const STATS_PERIODS: readonly StatsPeriod[] = REPORTING_PERIODS.filter(
  (period): period is StatsPeriod => period !== "30d",
);

@Controller("monitoring")
@OperatorApi("operator: monitoring")
@ApiBadRequestResponse({
  description: "Invalid query or path parameter.",
  type: ApiErrorResponseDto,
})
export class MonitoringController {
  constructor(private readonly monitoring: MonitoringService) {}

  @Get("stats")
  @ApiOperation({ summary: "Get pipeline processing statistics" })
  @ApiOkResponse({ description: "Aggregate monitoring statistics." })
  stats(@Query("period") rawPeriod?: string) {
    const period = parseEnum("period", rawPeriod, STATS_PERIODS) ?? "24h";
    return this.monitoring.stats(period);
  }

  @Get("sources")
  @ApiOperation({ summary: "List configured RSS source health" })
  @ApiOkResponse({ description: "RSS source monitoring state." })
  sources() {
    return this.monitoring.listSources();
  }

  @Get("ingests")
  @ApiOperation({ summary: "List ingestion runs" })
  @ApiOkResponse({ description: "Paginated ingestion runs." })
  listIngests(
    @Query("sourceId") sourceId?: string,
    @Query("status") status?: string,
    @Query("since") since?: string,
    @Query("until") until?: string,
    @Query("limit") rawLimit?: string,
    @Query("offset") rawOffset?: string,
  ) {
    return this.monitoring.listIngests({
      sourceId: parseUuid("sourceId", sourceId),
      status: parseEnum("status", status, INGEST_STATUSES),
      since: parseIso("since", since),
      until: parseIso("until", until),
      limit: parseLimit(rawLimit),
      offset: parseOffset(rawOffset),
    });
  }

  @Get("ingests/:id")
  @ApiOperation({ summary: "Read one ingestion run" })
  @ApiOkResponse({ description: "Ingestion run detail." })
  getIngest(@Param("id") id: string) {
    return this.monitoring.getIngest(parseRequiredUuid("id", id));
  }

  @Get("records")
  @ApiOperation({ summary: "List raw RSS records" })
  @ApiOkResponse({ description: "Paginated raw RSS records." })
  @ApiQuery({
    name: "extractionStatus",
    required: false,
    enum: EXTRACTION_STATUSES,
    description: "Filter by pending, failed, or successfully extracted records.",
  })
  listRecords(
    @Query("ingestId") ingestId?: string,
    @Query("sourceId") sourceId?: string,
    @Query("extractionStatus") extractionStatus?: string,
    @Query("q") q?: string,
    @Query("limit") rawLimit?: string,
    @Query("offset") rawOffset?: string,
  ) {
    const trimmed = q?.trim();
    return this.monitoring.listRecords({
      ingestId: parseUuid("ingestId", ingestId),
      sourceId: parseUuid("sourceId", sourceId),
      extractionStatus: parseEnum("extractionStatus", extractionStatus, EXTRACTION_STATUSES),
      q: trimmed && trimmed.length > 0 ? trimmed : undefined,
      limit: parseLimit(rawLimit),
      offset: parseOffset(rawOffset),
    });
  }

  @Get("records/:id")
  @ApiOperation({ summary: "Read one raw RSS record" })
  @ApiOkResponse({ description: "Raw RSS record and extraction detail." })
  getRecord(@Param("id") id: string) {
    return this.monitoring.getRecord(parseRequiredUuid("id", id));
  }
}
