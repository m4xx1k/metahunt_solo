import { Module } from "@nestjs/common";

import { LOADER_ACTIVITIES } from "./activities";
import { ExternalIdCleanupService } from "./external-id/external-id-cleanup.service";
import { LoaderController } from "./loader.controller";
import {
  CompanyRepository,
  DrizzleCompanyRepository,
} from "./repositories/company.repository";
import {
  NodeRepository,
  DrizzleNodeRepository,
} from "./repositories/node.repository";
import {
  VacancyRepository,
  DrizzleVacancyRepository,
} from "./repositories/vacancy.repository";
import { CompanyResolverService } from "./services/company-resolver.service";
import { LoaderBackfillService } from "./services/loader-backfill.service";
import { NodeResolverService } from "./services/node-resolver.service";
import { VacancyLoaderService } from "./services/vacancy-loader.service";

// Activities are listed as Nest providers so the container can resolve them
// when the Temporal worker instantiates them and when controllers (e.g. the
// loader backfill) inject them directly. Mirrors the RssModule pattern.
//
// Repositories bind their abstract class (the DI token) to the Drizzle impl
// so resolver services depend on the interface, not on DRIZZLE directly.
@Module({
  providers: [
    { provide: CompanyRepository, useClass: DrizzleCompanyRepository },
    { provide: NodeRepository, useClass: DrizzleNodeRepository },
    { provide: VacancyRepository, useClass: DrizzleVacancyRepository },
    CompanyResolverService,
    NodeResolverService,
    VacancyLoaderService,
    LoaderBackfillService,
    ExternalIdCleanupService,
    ...LOADER_ACTIVITIES,
  ],
  controllers: [LoaderController],
  exports: [VacancyLoaderService, ...LOADER_ACTIVITIES],
})
export class LoaderModule {}
