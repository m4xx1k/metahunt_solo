import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";

import { Registry, collectDefaultMetrics, Counter, Histogram } from "prom-client";

@Injectable()
export class MetricsService implements OnModuleInit, OnModuleDestroy {
  public readonly registry: Registry;

  // Ingestion metrics
  public readonly ingestRunsTotal: Counter<string>;
  public readonly ingestRecordsTotal: Counter<string>;
  public readonly ingestDurationSeconds: Histogram<string>;

  // AI Extraction metrics
  public readonly extractionTotal: Counter<string>;
  public readonly extractionDurationSeconds: Histogram<string>;
  public readonly extractionCostUsdTotal: Counter<string>;

  // Dedup & notifications
  public readonly dedupMergesTotal: Counter<string>;
  public readonly digestSendsTotal: Counter<string>;

  // HTTP RED metrics
  public readonly httpRequestDurationSeconds: Histogram<string>;

  constructor() {
    this.registry = new Registry();

    this.ingestRunsTotal = new Counter({
      name: "metahunt_ingest_runs_total",
      help: "Total number of ingestion runs per source and status",
      labelNames: ["source", "status"],
      registers: [this.registry],
    });

    this.ingestRecordsTotal = new Counter({
      name: "metahunt_ingest_records_total",
      help: "Total number of ingested records per source",
      labelNames: ["source"],
      registers: [this.registry],
    });

    this.ingestDurationSeconds = new Histogram({
      name: "metahunt_ingest_duration_seconds",
      help: "Duration of ingest runs in seconds",
      labelNames: ["source"],
      buckets: [1, 5, 10, 30, 60, 120, 300],
      registers: [this.registry],
    });

    this.extractionTotal = new Counter({
      name: "metahunt_extraction_total",
      help: "Total number of LLM extractions by status",
      labelNames: ["status"],
      registers: [this.registry],
    });

    this.extractionDurationSeconds = new Histogram({
      name: "metahunt_extraction_duration_seconds",
      help: "Duration of LLM extraction in seconds",
      buckets: [0.5, 1, 2, 5, 10, 20, 30, 60],
      registers: [this.registry],
    });

    this.extractionCostUsdTotal = new Counter({
      name: "metahunt_extraction_cost_usd_total",
      help: "Estimated LLM extraction cost in USD",
      labelNames: ["model"],
      registers: [this.registry],
    });

    this.dedupMergesTotal = new Counter({
      name: "metahunt_dedup_merges_total",
      help: "Total number of deduplicated vacancy merges",
      registers: [this.registry],
    });

    this.digestSendsTotal = new Counter({
      name: "metahunt_digest_sends_total",
      help: "Total number of notification digest sends",
      labelNames: ["status"],
      registers: [this.registry],
    });

    this.httpRequestDurationSeconds = new Histogram({
      name: "http_request_duration_seconds",
      help: "HTTP request latency in seconds",
      labelNames: ["method", "route", "status_code"],
      buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
      registers: [this.registry],
    });
  }

  onModuleInit(): void {
    collectDefaultMetrics({ register: this.registry });
  }

  onModuleDestroy(): void {
    this.registry.clear();
  }

  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  getContentType(): string {
    return this.registry.contentType;
  }
}
