import { Controller, Get, Param, Query } from "@nestjs/common";

import { MonitoringService } from "./monitoring.service";
import {
  parseBool,
  parseEnum,
  parseIso,
  parseLimit,
  parseOffset,
  parseRequiredUuid,
  parseUuid,
} from "./query-parsing";

const INGEST_STATUSES = ["running", "completed", "failed"] as const;

@Controller("monitoring")
export class MonitoringController {
  constructor(private readonly monitoring: MonitoringService) {}

  @Get("stats")
  stats() {
    return this.monitoring.stats();
  }

  @Get("sources")
  sources() {
    return this.monitoring.listSources();
  }

  @Get("ingests")
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
  getIngest(@Param("id") id: string) {
    return this.monitoring.getIngest(parseRequiredUuid("id", id));
  }

  @Get("records")
  listRecords(
    @Query("ingestId") ingestId?: string,
    @Query("sourceId") sourceId?: string,
    @Query("extracted") extracted?: string,
    @Query("q") q?: string,
    @Query("limit") rawLimit?: string,
    @Query("offset") rawOffset?: string,
  ) {
    const trimmed = q?.trim();
    return this.monitoring.listRecords({
      ingestId: parseUuid("ingestId", ingestId),
      sourceId: parseUuid("sourceId", sourceId),
      extracted: parseBool("extracted", extracted),
      q: trimmed && trimmed.length > 0 ? trimmed : undefined,
      limit: parseLimit(rawLimit),
      offset: parseOffset(rawOffset),
    });
  }

  @Get("records/:id")
  getRecord(@Param("id") id: string) {
    return this.monitoring.getRecord(parseRequiredUuid("id", id));
  }
}
