import { Controller, Get } from "@nestjs/common";

import { MarketService } from "./market.service";

@Controller("market")
export class MarketController {
  constructor(private readonly market: MarketService) {}

  @Get("aggregates")
  aggregates() {
    return this.market.getAggregates();
  }
}
