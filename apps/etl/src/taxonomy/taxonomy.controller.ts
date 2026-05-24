import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";

import {
  TaxonomyService,
  type NodeTypeValue,
} from "./taxonomy.service";

const QUEUE_DEFAULT = 25;
const QUEUE_MAX = 200;
const VALID_TYPES = new Set<NodeTypeValue>(["ROLE", "SKILL", "DOMAIN"]);

@Controller("admin/taxonomy")
export class TaxonomyController {
  constructor(private readonly service: TaxonomyService) {}

  @Get("coverage")
  getCoverage() {
    return this.service.getCoverage();
  }

  @Get("queue")
  getQueue(
    @Query("type") rawType?: string,
    @Query("limit") rawLimit?: string,
  ) {
    const type = parseType(rawType);
    const limit = parseLimit(rawLimit);
    return this.service.getQueue(type, limit);
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

function parseLimit(raw: string | undefined): number {
  if (raw === undefined) return QUEUE_DEFAULT;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > QUEUE_MAX) {
    throw new BadRequestException(
      `limit must be an integer in 1..${QUEUE_MAX}, got "${raw}"`,
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
