import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";

import {
  parseLimit,
  parsePage,
  parsePageSize,
} from "../../platform/shared/query-parsing";
import {
  TAXONOMY_LIST_DEFAULT,
  TAXONOMY_LIST_MAX,
  TaxonomyService,
  type NodeListFilters,
  type NodeStatusValue,
  type NodeTypeValue,
} from "./taxonomy.service";

const SEARCH_DEFAULT = 20;
const SEARCH_MAX = 50;
const VALID_TYPES = new Set<NodeTypeValue>(["ROLE", "SKILL", "DOMAIN"]);
const VALID_STATUSES = new Set<NodeStatusValue>(["NEW", "VERIFIED", "HIDDEN"]);
const DEFAULT_STATUSES: NodeStatusValue[] = ["NEW", "VERIFIED"];

@Controller("admin/taxonomy")
export class TaxonomyController {
  constructor(private readonly service: TaxonomyService) {}

  @Get("coverage")
  getCoverage() {
    return this.service.getCoverage();
  }

  @Get("nodes")
  listNodes(
    @Query("type") rawType?: string,
    @Query("status") rawStatus?: string,
    @Query("q") rawQ?: string,
    @Query("blocked") rawBlocked?: string,
    @Query("page") rawPage?: string,
    @Query("pageSize") rawPageSize?: string,
  ) {
    const filters: NodeListFilters = {
      type: parseType(rawType),
      statuses: parseStatuses(rawStatus),
      q: parseSearchString(rawQ),
      minBlocked: parseMinBlocked(rawBlocked),
      page: parsePage(rawPage),
      pageSize: parsePageSize(rawPageSize, {
        default: TAXONOMY_LIST_DEFAULT,
        max: TAXONOMY_LIST_MAX,
      }),
    };
    return this.service.listNodes(filters);
  }

  @Get("nodes/search")
  searchNodes(
    @Query("type") rawType: string | undefined,
    @Query("q") rawQ: string | undefined,
    @Query("limit") rawLimit: string | undefined,
  ) {
    const type = parseType(rawType);
    if (!type) {
      throw new BadRequestException("type is required (ROLE, SKILL, or DOMAIN)");
    }
    const q = (rawQ ?? "").trim();
    if (q.length < 2) {
      throw new BadRequestException("q must be at least 2 characters");
    }
    const limit = parseLimit(rawLimit, SEARCH_DEFAULT, SEARCH_MAX);
    return this.service.searchVerifiedNodes(type, q, limit);
  }

  @Get("nodes/:id")
  getNode(@Param("id") id: string) {
    assertUuid(id, "id");
    return this.service.getNodeDetail(id);
  }

  @Get("nodes/:id/fuzzy-matches")
  getFuzzyMatches(@Param("id") id: string) {
    assertUuid(id, "id");
    return this.service.getFuzzyMatches(id);
  }

  @Patch("nodes/:id/verify")
  verifyNode(@Param("id") id: string) {
    assertUuid(id, "id");
    return this.service.setStatus(id, "VERIFIED");
  }

  @Patch("nodes/:id/hide")
  hideNode(@Param("id") id: string) {
    assertUuid(id, "id");
    return this.service.setStatus(id, "HIDDEN");
  }

  @Patch("nodes/:id/rename")
  renameNode(
    @Param("id") id: string,
    @Body() body: { name?: unknown } | undefined,
  ) {
    assertUuid(id, "id");
    const name = body?.name;
    if (typeof name !== "string") {
      throw new BadRequestException("body.name must be a string");
    }
    return this.service.renameNode(id, name);
  }

  @Post("nodes/:id/merge-into/:targetId")
  mergeNode(
    @Param("id") id: string,
    @Param("targetId") targetId: string,
  ) {
    assertUuid(id, "id");
    assertUuid(targetId, "targetId");
    return this.service.mergeInto(id, targetId);
  }
}

function parseType(raw: string | undefined): NodeTypeValue | undefined {
  if (!raw) return undefined;
  const upper = raw.toUpperCase() as NodeTypeValue;
  if (!VALID_TYPES.has(upper)) {
    throw new BadRequestException(
      `type must be one of ROLE, SKILL, DOMAIN (case-insensitive), got "${raw}"`,
    );
  }
  return upper;
}

function parseStatuses(raw: string | undefined): NodeStatusValue[] {
  if (!raw) return DEFAULT_STATUSES;
  const parts = raw
    .split(",")
    .map((p) => p.trim().toUpperCase())
    .filter((p) => p.length > 0);
  if (parts.length === 0) return DEFAULT_STATUSES;
  const out: NodeStatusValue[] = [];
  for (const p of parts) {
    const s = p as NodeStatusValue;
    if (!VALID_STATUSES.has(s)) {
      throw new BadRequestException(
        `status must be NEW, VERIFIED, or HIDDEN (case-insensitive), got "${p}"`,
      );
    }
    if (!out.includes(s)) out.push(s);
  }
  return out;
}

function parseSearchString(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  const t = raw.trim();
  return t.length > 0 ? t : undefined;
}

function parseMinBlocked(raw: string | undefined): number {
  if (raw === undefined) return 0;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) {
    throw new BadRequestException(
      `blocked must be a non-negative integer, got "${raw}"`,
    );
  }
  return n;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertUuid(value: string, field: string): void {
  if (!UUID_RE.test(value)) {
    throw new BadRequestException(`${field} must be a uuid, got "${value}"`);
  }
}
