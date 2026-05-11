import { Controller, Get } from "@nestjs/common";

import { ExtractionCostService } from "./extraction-cost.service";

@Controller("extraction-cost")
export class ExtractionCostController {
  constructor(private readonly service: ExtractionCostService) {}

  @Get("summary")
  summary() {
    return this.service.summary();
  }
}
