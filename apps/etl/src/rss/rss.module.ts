import { Module } from "@nestjs/common";

import { ExtractionModule } from "../extraction/extraction.module";
import { StorageModule } from "../storage/storage.module";
import { RSS_ACTIVITIES } from "./activities";
import { RssBackfillService } from "./rss-backfill.service";
import { RssIngestService } from "./rss-ingest.service";
import { RssParserService } from "./rss-parser.service";
import { RssSchedulerService } from "./rss-scheduler.service";
import { RssController } from "./rss.controller";

// Temporal worker + connection live in TemporalInfraModule (imported by
// AppModule). Activities are still listed here as Nest providers so the
// container can resolve them when the worker instantiates them and when
// services like RssBackfillService inject them directly.
@Module({
  imports: [StorageModule, ExtractionModule],
  providers: [
    RssParserService,
    RssSchedulerService,
    RssIngestService,
    RssBackfillService,
    ...RSS_ACTIVITIES,
  ],
  controllers: [RssController],
})
export class RssModule {}
