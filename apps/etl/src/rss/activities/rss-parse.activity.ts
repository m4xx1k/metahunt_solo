import { Injectable, Inject, Logger } from "@nestjs/common";
import { eq, inArray } from "drizzle-orm";
import { Activity, ActivityMethod } from "nestjs-temporal-core";
import { DRIZZLE, schema } from "@metahunt/database";
import type { DrizzleDB } from "@metahunt/database";
import { StorageService } from "../../storage/storage.service";
import { RssParserService } from "../rss-parser.service";

@Injectable()
@Activity()
export class RssParseActivity {
  private readonly logger = new Logger(RssParseActivity.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly storage: StorageService,
    private readonly parser: RssParserService,
  ) {}

  @ActivityMethod()
  async parseAndDedup(ingestId: string): Promise<string[]> {
    const [ingest] = await this.db
      .select()
      .from(schema.rssIngests)
      .where(eq(schema.rssIngests.id, ingestId));

    if (!ingest.payloadStorageKey) throw new Error("No payload storage key");

    const xml = (
      await this.storage.download(ingest.payloadStorageKey)
    ).toString("utf-8");
    const allItems = this.parser.parseXml(xml);
    const itItems = this.parser.filterItItems(allItems);

    const hashes = itItems.map((item) => this.parser.computeHash(item));

    const existing = await this.db
      .select({ hash: schema.rssRecords.hash })
      .from(schema.rssRecords)
      .where(inArray(schema.rssRecords.hash, hashes));

    const existingSet = new Set(existing.map((r) => r.hash));
    const newItems = itItems.filter(
      (item) => !existingSet.has(this.parser.computeHash(item)),
    );

    if (newItems.length === 0) {
      this.logger.log(`No new items found for ingestId: ${ingestId}`);
      return [];
    }

    const inserted = await this.db
      .insert(schema.rssRecords)
      .values(
        newItems.map((item) => ({
          sourceId: ingest.sourceId,
          rssIngestId: ingestId,
          hash: this.parser.computeHash(item),
          publishedAt: new Date(item.pubDate),
          title: item.title,
          description: item.description,
          link: item.link,
          category: Array.isArray(item.category)
            ? item.category.join(", ")
            : item.category,
          externalId: item.guid != null ? String(item.guid) : undefined,
        })),
      )
      .onConflictDoNothing()
      .returning({ id: schema.rssRecords.id });

    return inserted.map((r) => r.id);
  }
}
