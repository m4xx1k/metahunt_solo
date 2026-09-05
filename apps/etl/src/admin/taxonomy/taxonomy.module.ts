import { Module } from "@nestjs/common";

import { AuthModule } from "../../platform/auth/auth.module";
import { SubscriptionRepairService } from "../../platform/subscriptions/subscription-repair.service";

import { TaxonomyController } from "./taxonomy.controller";
import { TaxonomyService } from "./taxonomy.service";

@Module({
  imports: [AuthModule], // provides JwtAuthGuard + RolesGuard for @AdminOnly mutations
  providers: [TaxonomyService, SubscriptionRepairService],
  controllers: [TaxonomyController],
  exports: [TaxonomyService],
})
export class TaxonomyModule {}
