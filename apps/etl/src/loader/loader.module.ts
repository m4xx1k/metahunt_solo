import { Module } from "@nestjs/common";

import { LOADER_ACTIVITIES } from "./activities";
import { LoaderController } from "./loader.controller";
import { CompanyResolverService } from "./services/company-resolver.service";
import { LoaderBackfillService } from "./services/loader-backfill.service";
import { NodeResolverService } from "./services/node-resolver.service";
import { VacancyLoaderService } from "./services/vacancy-loader.service";

// Activities are listed as Nest providers so the container can resolve them
// when the Temporal worker instantiates them and when controllers (e.g. the
// loader backfill) inject them directly. Mirrors the RssModule pattern.
@Module({
  providers: [
    CompanyResolverService,
    NodeResolverService,
    VacancyLoaderService,
    LoaderBackfillService,
    ...LOADER_ACTIVITIES,
  ],
  controllers: [LoaderController],
  exports: [VacancyLoaderService, ...LOADER_ACTIVITIES],
})
export class LoaderModule {}
