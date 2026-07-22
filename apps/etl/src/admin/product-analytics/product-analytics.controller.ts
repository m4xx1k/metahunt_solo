import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UsePipes,
  ValidationPipe,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
} from "@nestjs/swagger";

import { parseEnum } from "../../platform/shared/query-parsing";
import { ApiErrorResponseDto } from "../../platform/swagger/api-error.dto";
import { OperatorApi } from "../../platform/swagger/operator-api.decorator";

import {
  PRODUCT_ANALYTICS_PERIODS,
  PRODUCT_ANALYTICS_POPULATIONS,
  UpdateAnalyticsJourneyDto,
  type ProductAnalyticsPeriod,
  type ProductAnalyticsPopulation,
} from "./product-analytics.contract";
import { ProductAnalyticsService } from "./product-analytics.service";

@Controller("admin/product-analytics")
@OperatorApi("operator: product analytics")
export class ProductAnalyticsController {
  constructor(private readonly productAnalytics: ProductAnalyticsService) {}

  @Get("overview")
  @ApiOperation({ summary: "Inspect subscription funnel and correlation health" })
  @ApiOkResponse({ description: "First-party product analytics overview." })
  overview(@Query("period") rawPeriod?: string, @Query("population") rawPopulation?: string) {
    const period: ProductAnalyticsPeriod =
      parseEnum("period", rawPeriod, PRODUCT_ANALYTICS_PERIODS) ?? "week";
    const population: ProductAnalyticsPopulation =
      parseEnum("population", rawPopulation, PRODUCT_ANALYTICS_POPULATIONS) ?? "production";
    return this.productAnalytics.overview(period, population);
  }

  @Patch("journeys/:id")
  @ApiOperation({ summary: "Classify a product-analytics journey as production or test" })
  @ApiBody({ type: UpdateAnalyticsJourneyDto })
  @ApiOkResponse({ description: "Updated journey classification." })
  @ApiBadRequestResponse({
    description: "Invalid journey classification.",
    type: ApiErrorResponseDto,
  })
  @ApiNotFoundResponse({ description: "Journey was not found.", type: ApiErrorResponseDto })
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async updateJourney(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: UpdateAnalyticsJourneyDto,
  ) {
    const updated = await this.productAnalytics.updateJourney(id, body);
    if (!updated) throw new NotFoundException();
    return updated;
  }
}
