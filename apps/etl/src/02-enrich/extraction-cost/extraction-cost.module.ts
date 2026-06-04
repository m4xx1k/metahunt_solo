import { Module } from "@nestjs/common";

import { ExtractionCostController } from "./extraction-cost.controller";
import { ExtractionCostService } from "./extraction-cost.service";

@Module({
  providers: [ExtractionCostService],
  controllers: [ExtractionCostController],
})
export class ExtractionCostModule {}
