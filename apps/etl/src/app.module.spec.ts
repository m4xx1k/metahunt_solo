import { Test } from "@nestjs/testing";

import { AppModule } from "./app.module";
import { HealthController } from "./health/health.controller";
import { LoadVacancyActivity } from "./loader/activities/load-vacancy.activity";
import { CompanyResolverService } from "./loader/services/company-resolver.service";
import { NodeResolverService } from "./loader/services/node-resolver.service";
import { VacancyLoaderService } from "./loader/services/vacancy-loader.service";
import { RssFetchActivity } from "./rss/activities/rss-fetch.activity";
import { RssParseActivity } from "./rss/activities/rss-parse.activity";
import { RssExtractActivity } from "./rss/activities/rss-extract.activity";
import { RssFinalizeActivity } from "./rss/activities/rss-finalize.activity";
import { RssParserService } from "./rss/rss-parser.service";
import { RssSchedulerService } from "./rss/rss-scheduler.service";
import { RssController } from "./rss/rss.controller";

describe("AppModule", () => {
  it("compiles the dependency graph and resolves RSS + health providers", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    expect(moduleRef.get(RssParserService)).toBeInstanceOf(RssParserService);
    expect(moduleRef.get(RssFetchActivity)).toBeInstanceOf(RssFetchActivity);
    expect(moduleRef.get(RssParseActivity)).toBeInstanceOf(RssParseActivity);
    expect(moduleRef.get(RssExtractActivity)).toBeInstanceOf(RssExtractActivity);
    expect(moduleRef.get(RssFinalizeActivity)).toBeInstanceOf(RssFinalizeActivity);
    expect(moduleRef.get(RssSchedulerService)).toBeInstanceOf(RssSchedulerService);
    expect(moduleRef.get(RssController)).toBeInstanceOf(RssController);
    expect(moduleRef.get(HealthController)).toBeInstanceOf(HealthController);

    expect(moduleRef.get(CompanyResolverService)).toBeInstanceOf(
      CompanyResolverService,
    );
    expect(moduleRef.get(NodeResolverService)).toBeInstanceOf(
      NodeResolverService,
    );
    expect(moduleRef.get(VacancyLoaderService)).toBeInstanceOf(
      VacancyLoaderService,
    );
    expect(moduleRef.get(LoadVacancyActivity)).toBeInstanceOf(
      LoadVacancyActivity,
    );

    await moduleRef.close();
  });
});
