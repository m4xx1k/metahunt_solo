import { Injectable, Inject } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { Activity, ActivityMethod } from "nestjs-temporal-core";
import { activityInfo } from "@temporalio/activity";
import { DRIZZLE, schema } from "@metahunt/database";
import type { DrizzleDB } from "@metahunt/database";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { StorageService } from "../../storage/storage.service";

@Injectable()
@Activity()
export class RssFetchActivity {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly storage: StorageService,
  ) {}

  private async readFallbackRss(sourceCode: string): Promise<string> {
    const fileName = `${sourceCode}-rss.xml`;
    const candidatePaths = [
      resolve(process.cwd(), "apps/etl/data/rss", fileName),
      resolve(__dirname, "../../../data/rss", fileName),
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

    let xml: string;

    if (source.rssUrl) {
      try {
        const response = await fetch(source.rssUrl);
        if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
        xml = await response.text();
      } catch {
        xml = await this.readFallbackRss(source.code);
      }
    } else {
      xml = await this.readFallbackRss(source.code);
    }

    const storageKey = `rss/${sourceId}/${ingest.id}.xml`;
    await this.storage.upload(storageKey, Buffer.from(xml));

    await this.db
      .update(schema.rssIngests)
      .set({ payloadStorageKey: storageKey })
      .where(eq(schema.rssIngests.id, ingest.id));

    return ingest.id;
  }
}
