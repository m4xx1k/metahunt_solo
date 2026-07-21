import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { Injectable, Inject } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { activityInfo, ApplicationFailure } from "@temporalio/activity";
import { eq } from "drizzle-orm";
import { Activity, ActivityMethod } from "nestjs-temporal-core";

import { DRIZZLE, schema } from "@metahunt/database";
import type { DrizzleDB } from "@metahunt/database";

import { StorageService } from "../../../platform/storage/storage.service";

@Injectable()
@Activity()
export class RssFetchActivity {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly storage: StorageService,
    private readonly config: ConfigService,
  ) {}

  private isProduction(): boolean {
    return this.config.get<string>("NODE_ENV") === "production";
  }

  private async readFallbackRss(sourceCode: string): Promise<string> {
    const fileName = `${sourceCode}-rss.xml`;
    const candidatePaths = [
      resolve(process.cwd(), "apps/etl/data/rss", fileName),
      resolve(__dirname, "../../../../data/rss", fileName),
    ];

    let lastError: unknown;

    for (const filePath of candidatePaths) {
      try {
        return await readFile(filePath, "utf8");
      } catch (error) {
        lastError = error;
      }
    }

    throw new Error(
      `Fallback RSS file not found for source "${sourceCode}" (${fileName}): ${String(lastError)}`,
    );
  }

  private async fetchRemoteRss(url: string): Promise<string> {
    const response = await fetch(url);
    if (response.ok) return response.text();

    const message = `RSS fetch failed with HTTP ${response.status} for ${url}`;
    if (
      response.status >= 400 &&
      response.status < 500 &&
      response.status !== 408 &&
      response.status !== 429
    ) {
      throw ApplicationFailure.nonRetryable(message, "RssSourceHttpError", response.status);
    }
    throw new Error(message);
  }

  private async loadSourceXml(source: { code: string; rssUrl: string | null }): Promise<string> {
    if (this.isProduction()) {
      if (!source.rssUrl) {
        throw ApplicationFailure.nonRetryable(
          `RSS source "${source.code}" has no rssUrl configured`,
          "RssSourceConfigurationError",
        );
      }
      return this.fetchRemoteRss(source.rssUrl);
    }

    if (!source.rssUrl) return this.readFallbackRss(source.code);

    try {
      return await this.fetchRemoteRss(source.rssUrl);
    } catch {
      return this.readFallbackRss(source.code);
    }
  }

  @ActivityMethod()
  async fetchAndStore(sourceId: string): Promise<string> {
    const [source] = await this.db
      .select()
      .from(schema.sources)
      .where(eq(schema.sources.id, sourceId));

    if (!source) throw new Error(`Source ${sourceId} not found`);

    const { workflowExecution } = activityInfo();
    const workflowRunId = workflowExecution.runId;

    await this.db
      .insert(schema.rssIngests)
      .values({
        sourceId,
        workflowRunId,
        triggeredBy: "temporal",
        startedAt: new Date(),
        status: "running",
      })
      .onConflictDoNothing();

    const [ingest] = await this.db
      .select()
      .from(schema.rssIngests)
      .where(eq(schema.rssIngests.workflowRunId, workflowRunId));

    const xml = await this.loadSourceXml(source);

    const storageKey = `rss/${sourceId}/${ingest.id}.xml`;
    await this.storage.upload(storageKey, Buffer.from(xml));

    await this.db
      .update(schema.rssIngests)
      .set({ payloadStorageKey: storageKey })
      .where(eq(schema.rssIngests.id, ingest.id));

    return ingest.id;
  }
}
