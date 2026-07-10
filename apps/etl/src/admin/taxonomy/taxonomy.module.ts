import { Module } from "@nestjs/common";

import { AuthModule } from "../../platform/auth/auth.module";

import { TaxonomyController } from "./taxonomy.controller";
import { TaxonomyService } from "./taxonomy.service";

@Module({
  imports: [AuthModule], // provides JwtAuthGuard + RolesGuard for @AdminOnly mutations
  providers: [TaxonomyService],
  controllers: [TaxonomyController],
  exports: [TaxonomyService],
})
export class TaxonomyModule {}
