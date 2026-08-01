import { Controller, Get, Query } from "@nestjs/common";
import { ApiOperation } from "@nestjs/swagger";

import { parseEnum, parseId, parseLimit, parseOffset } from "../../platform/shared/query-parsing";
import { OperatorApi } from "../../platform/swagger/operator-api.decorator";

import {
  ANALYTICS_PAGE_PEOPLE_DIRECTIONS,
  ANALYTICS_PAGE_PEOPLE_SORTS,
  ANALYTICS_PAGE_PERIODS,
  type AnalyticsPagePeopleDirection,
  type AnalyticsPagePeopleSort,
  type AnalyticsPagePeriod,
} from "./analytics-page.contract";
import { AnalyticsPageService } from "./analytics-page.service";

const PEOPLE_DEFAULT_LIMIT = 50;
const PEOPLE_MAX_LIMIT = 100;

@Controller("admin/analytics-page")
@OperatorApi("operator: analytics page")
export class AnalyticsPageController {
  constructor(private readonly analyticsPage: AnalyticsPageService) {}

  @Get("metrics")
  @ApiOperation({ summary: "Active users, acquisition funnel, and traffic sources from PostHog" })
  metrics(@Query("period") rawPeriod?: string, @Query("source") rawSource?: string) {
    const period: AnalyticsPagePeriod =
      parseEnum("period", rawPeriod, ANALYTICS_PAGE_PERIODS) ?? "30d";
    const source = parseId("source", rawSource);
    return this.analyticsPage.metrics(period, source);
  }

  @Get("people")
  @ApiOperation({ summary: "Postgres identity stitched with PostHog behaviour, paginated" })
  people(
    @Query("period") rawPeriod?: string,
    @Query("source") rawSource?: string,
    @Query("limit") rawLimit?: string,
    @Query("offset") rawOffset?: string,
    @Query("sort") rawSort?: string,
    @Query("dir") rawDir?: string,
    @Query("q") rawQ?: string,
  ) {
    const period: AnalyticsPagePeriod =
      parseEnum("period", rawPeriod, ANALYTICS_PAGE_PERIODS) ?? "30d";
    // Roster uses a fixed 180-day PostHog lookback, regardless of page filters.
    const source = parseId("source", rawSource);
    const sort: AnalyticsPagePeopleSort =
      parseEnum("sort", rawSort, ANALYTICS_PAGE_PEOPLE_SORTS) ?? "registeredAt";
    const dir: AnalyticsPagePeopleDirection =
      parseEnum("dir", rawDir, ANALYTICS_PAGE_PEOPLE_DIRECTIONS) ?? "desc";
    const limit = parseLimit(rawLimit, PEOPLE_DEFAULT_LIMIT, PEOPLE_MAX_LIMIT);
    const offset = parseOffset(rawOffset);
    const q = parseId("q", rawQ);

    return this.analyticsPage.people({ period, source, limit, offset, sort, dir, q });
  }
}
