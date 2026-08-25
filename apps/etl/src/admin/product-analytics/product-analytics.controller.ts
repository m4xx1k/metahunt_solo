import { BadRequestException, Controller, Get, Query } from "@nestjs/common";
import { ApiOkResponse, ApiOperation } from "@nestjs/swagger";

import { parseEnum } from "../../platform/shared/query-parsing";
import { OperatorApi } from "../../platform/swagger/operator-api.decorator";

import {
  PRODUCT_ANALYTICS_PERIODS,
  CRM_PEOPLE_SORTS,
  type CrmPeopleSort,
  type ProductAnalyticsPeriod,
} from "./product-analytics.contract";
import { ProductAnalyticsService } from "./product-analytics.service";

const KYIV_DATETIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

function kyivDateTime(value: string | undefined): Date | undefined {
  if (value === undefined) return undefined;
  const match = KYIV_DATETIME.exec(value);
  if (!match) throw new BadRequestException("datetime must use YYYY-MM-DDTHH:mm in Europe/Kyiv");
  const [, year, month, day, hour, minute] = match;
  const utcGuess = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
  );
  const zone = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Kyiv",
    timeZoneName: "longOffset",
  }).formatToParts(new Date(utcGuess));
  const offset = zone.find((part) => part.type === "timeZoneName")?.value;
  const offsetMatch = /^GMT([+-])(\d{2}):(\d{2})$/.exec(offset ?? "");
  if (!offsetMatch) throw new BadRequestException("could not resolve Europe/Kyiv time");
  const minutes = Number(offsetMatch[2]) * 60 + Number(offsetMatch[3]);
  const sign = offsetMatch[1] === "+" ? 1 : -1;
  const instant = new Date(utcGuess - sign * minutes * 60_000);
  const resolved = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Kyiv",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const component = (type: Intl.DateTimeFormatPartTypes) =>
    resolved.find((part) => part.type === type)?.value;
  if (
    component("year") !== year ||
    component("month") !== month ||
    component("day") !== day ||
    component("hour") !== hour ||
    component("minute") !== minute
  ) {
    throw new BadRequestException("datetime is not a valid Europe/Kyiv local time");
  }
  return instant;
}

@Controller("admin/product-analytics")
@OperatorApi("operator: product analytics")
export class ProductAnalyticsController {
  constructor(private readonly productAnalytics: ProductAnalyticsService) {}

  @Get("overview")
  @ApiOperation({ summary: "Inspect the subscriber roster, lifecycle states and delivery health" })
  @ApiOkResponse({ description: "First-party product analytics overview." })
  overview(@Query("period") rawPeriod?: string) {
    const period: ProductAnalyticsPeriod =
      parseEnum("period", rawPeriod, PRODUCT_ANALYTICS_PERIODS) ?? "week";
    return this.productAnalytics.overview(period);
  }

  @Get("people")
  @ApiOperation({ summary: "List compact CRM people with server-side search and pagination" })
  people(
    @Query("period") rawPeriod?: string,
    @Query("q") q?: string,
    @Query("sort") rawSort?: string,
    @Query("offset") rawOffset?: string,
    @Query("from") rawFrom?: string,
    @Query("to") rawTo?: string,
  ) {
    const period: ProductAnalyticsPeriod =
      parseEnum("period", rawPeriod, PRODUCT_ANALYTICS_PERIODS) ?? "week";
    const sort: CrmPeopleSort = parseEnum("sort", rawSort, CRM_PEOPLE_SORTS) ?? "recent";
    const parsedOffset = Number(rawOffset);
    const from = kyivDateTime(rawFrom);
    const to = kyivDateTime(rawTo);
    if ((from === undefined) !== (to === undefined) || (from && to && from >= to)) {
      throw new BadRequestException("from and to must be a non-empty [from, to) range");
    }
    return this.productAnalytics.people(period, {
      q,
      sort,
      offset: Number.isSafeInteger(parsedOffset) && parsedOffset > 0 ? parsedOffset : 0,
      from,
      to,
    });
  }
}
