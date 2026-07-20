import { Controller, Get } from "@nestjs/common";
import { ApiOkResponse, ApiOperation } from "@nestjs/swagger";

import { OperatorApi } from "../../platform/swagger/operator-api.decorator";

import { ExtractionCostService } from "./extraction-cost.service";

@Controller("extraction-cost")
@OperatorApi("operator: extraction cost")
export class ExtractionCostController {
  constructor(private readonly service: ExtractionCostService) {}

  @Get("summary")
  @ApiOperation({ summary: "Read aggregate extraction cost and usage" })
  @ApiOkResponse({ description: "Cost totals, breakdowns, and recent records." })
  summary() {
    return this.service.summary();
  }
}
