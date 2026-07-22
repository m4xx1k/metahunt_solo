import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UsePipes,
  ValidationPipe,
} from "@nestjs/common";
import { ApiBadRequestResponse, ApiBody, ApiOkResponse, ApiOperation } from "@nestjs/swagger";

import { ApiErrorResponseDto } from "../../platform/swagger/api-error.dto";
import { OperatorApi } from "../../platform/swagger/operator-api.decorator";

import { parseNodeListFilters, parseVerifiedNodeSearch } from "./taxonomy-query.parser";
import { RenameTaxonomyNodeDto } from "./taxonomy.contract";
import { TaxonomyService } from "./taxonomy.service";

@Controller("admin/taxonomy")
@OperatorApi("operator: taxonomy")
@ApiBadRequestResponse({
  description: "Invalid query, body, or path parameter.",
  type: ApiErrorResponseDto,
})
export class TaxonomyController {
  constructor(private readonly service: TaxonomyService) {}

  @Get("coverage")
  @ApiOperation({ summary: "Get taxonomy coverage metrics" })
  @ApiOkResponse({ description: "Coverage counts by taxonomy axis." })
  getCoverage() {
    return this.service.getCoverage();
  }

  @Get("nodes")
  @ApiOperation({ summary: "List taxonomy nodes for review" })
  @ApiOkResponse({ description: "Paginated taxonomy nodes." })
  listNodes(
    @Query("type") rawType?: string,
    @Query("status") rawStatus?: string,
    @Query("q") rawQ?: string,
    @Query("blocked") rawBlocked?: string,
    @Query("page") rawPage?: string,
    @Query("pageSize") rawPageSize?: string,
  ) {
    const filters = parseNodeListFilters({
      type: rawType,
      status: rawStatus,
      q: rawQ,
      blocked: rawBlocked,
      page: rawPage,
      pageSize: rawPageSize,
    });
    return this.service.listNodes(filters);
  }

  @Get("nodes/search")
  @ApiOperation({ summary: "Search verified taxonomy nodes" })
  @ApiOkResponse({ description: "Matching verified taxonomy nodes." })
  searchNodes(
    @Query("type") rawType: string | undefined,
    @Query("q") rawQ: string | undefined,
    @Query("limit") rawLimit: string | undefined,
  ) {
    const { type, q, limit } = parseVerifiedNodeSearch({
      type: rawType,
      q: rawQ,
      limit: rawLimit,
    });
    return this.service.searchVerifiedNodes(type, q, limit);
  }

  @Get("nodes/:id")
  @ApiOperation({ summary: "Read one taxonomy node" })
  @ApiOkResponse({ description: "Taxonomy node detail." })
  getNode(@Param("id", ParseUUIDPipe) id: string) {
    return this.service.getNodeDetail(id);
  }

  @Get("nodes/:id/fuzzy-matches")
  @ApiOperation({ summary: "Find taxonomy merge candidates" })
  @ApiOkResponse({ description: "Potential duplicate nodes." })
  getFuzzyMatches(@Param("id", ParseUUIDPipe) id: string) {
    return this.service.getFuzzyMatches(id);
  }

  @Patch("nodes/:id/verify")
  @ApiOperation({ summary: "Mark a taxonomy node as verified" })
  @ApiOkResponse({ description: "Updated taxonomy node." })
  verifyNode(@Param("id", ParseUUIDPipe) id: string) {
    return this.service.setStatus(id, "VERIFIED");
  }

  @Patch("nodes/:id/hide")
  @ApiOperation({ summary: "Hide a taxonomy node" })
  @ApiOkResponse({ description: "Updated taxonomy node." })
  hideNode(@Param("id", ParseUUIDPipe) id: string) {
    return this.service.setStatus(id, "HIDDEN");
  }

  @Patch("nodes/:id/rename")
  @ApiOperation({ summary: "Rename a taxonomy node" })
  @ApiBody({ type: RenameTaxonomyNodeDto })
  @ApiOkResponse({ description: "Updated taxonomy node." })
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  renameNode(@Param("id", ParseUUIDPipe) id: string, @Body() body: RenameTaxonomyNodeDto) {
    return this.service.renameNode(id, body.name);
  }

  @Post("nodes/:id/merge-into/:targetId")
  @ApiOperation({ summary: "Merge one taxonomy node into another" })
  @ApiOkResponse({ description: "Taxonomy merge result." })
  mergeNode(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("targetId", ParseUUIDPipe) targetId: string,
  ) {
    return this.service.mergeInto(id, targetId);
  }
}
