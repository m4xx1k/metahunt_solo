import { Controller, Get } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";

import { MarketService } from "./market.service";

@Controller("market")
@ApiTags("market")
export class MarketController {
  constructor(private readonly market: MarketService) {}

  @Get("aggregates")
  @ApiOperation({ summary: "Read market-level vacancy aggregates" })
  @ApiOkResponse({ description: "Aggregates by source, seniority, format, and skill." })
  aggregates() {
    return this.market.getAggregates();
  }
}
