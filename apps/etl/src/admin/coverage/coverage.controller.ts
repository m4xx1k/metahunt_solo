import { Body, Controller, Post, UsePipes, ValidationPipe } from "@nestjs/common";
import { ApiBody, ApiOkResponse, ApiOperation } from "@nestjs/swagger";

import { OperatorApi } from "../../platform/swagger/operator-api.decorator";

import { CoverageLookupDto } from "./coverage.contract";
import { CoverageService } from "./coverage.service";

@Controller("admin/coverage")
@OperatorApi("operator: coverage")
export class CoverageController {
  constructor(private readonly coverage: CoverageService) {}

  @Post("lookup")
  @ApiOperation({ summary: "Check whether pasted vacancy URLs are in the database, and why not" })
  @ApiBody({ type: CoverageLookupDto })
  @ApiOkResponse({ description: "Per-URL verdict plus a coverage/latency summary." })
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  lookup(@Body() dto: CoverageLookupDto) {
    return this.coverage.lookup(dto.input);
  }
}
