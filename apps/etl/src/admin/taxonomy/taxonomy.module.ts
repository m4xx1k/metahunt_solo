import { Module } from "@nestjs/common";

import { TAXONOMY_ACTIVITIES } from "./activities";
import { TaxonomyAutoverifySchedulerService } from "./taxonomy-autoverify-scheduler.service";
import { TaxonomyController } from "./taxonomy.controller";
import { TaxonomyService } from "./taxonomy.service";

@Module({
  // Activities are listed as Nest providers so the container can resolve them
  // when the Temporal worker instantiates them (the worker registers the same
  // classes via temporal.module's activityClasses).
  providers: [
    TaxonomyService,
    TaxonomyAutoverifySchedulerService,
    ...TAXONOMY_ACTIVITIES,
  ],
  controllers: [TaxonomyController],
  exports: [TaxonomyService],
})
export class TaxonomyModule {}
