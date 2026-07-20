import { Module } from "@nestjs/common";

import { AuthModule } from "../../platform/auth/auth.module";

import { ExtractionCostController } from "./extraction-cost.controller";
import { ExtractionCostService } from "./extraction-cost.service";

@Module({
  imports: [AuthModule],
  providers: [ExtractionCostService],
  controllers: [ExtractionCostController],
})
export class ExtractionCostModule {}
