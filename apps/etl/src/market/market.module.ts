import { Module } from "@nestjs/common";

import { MarketController } from "./market.controller";
import { MarketService } from "./market.service";

@Module({
  providers: [MarketService],
  controllers: [MarketController],
})
export class MarketModule {}
