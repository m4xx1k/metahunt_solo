import { Module } from "@nestjs/common";

import { LoaderModule } from "../../02-enrich/loader/loader.module";
import { CvModule } from "../../03-discovery/cv/cv.module";
import { AuthModule } from "../../platform/auth/auth.module";
import { SubscriptionRepairService } from "../../platform/subscriptions/subscription-repair.service";

import { TaxonomyAliasMoveService } from "./taxonomy-alias-move.service";
import { TaxonomyController } from "./taxonomy.controller";
import { TaxonomyService } from "./taxonomy.service";

@Module({
  imports: [AuthModule, LoaderModule, CvModule], // AuthModule: guards for @AdminOnly
  providers: [TaxonomyService, TaxonomyAliasMoveService, SubscriptionRepairService],
  controllers: [TaxonomyController],
  exports: [TaxonomyService],
})
export class TaxonomyModule {}
