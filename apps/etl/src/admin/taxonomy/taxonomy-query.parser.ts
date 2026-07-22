import { BadRequestException } from "@nestjs/common";

import type { NodeType } from "@metahunt/database";

import {
  parseCsv,
  parseLimit,
  parsePage,
  parsePageSize,
} from "../../platform/shared/query-parsing";

import {
  TAXONOMY_LIST_DEFAULT,
  TAXONOMY_LIST_MAX,
  type NodeListFilters,
  type NodeStatusValue,
} from "./taxonomy.contract";

const SEARCH_DEFAULT = 20;
const SEARCH_MAX = 50;
const NODE_TYPES: readonly NodeType[] = ["ROLE", "SKILL", "DOMAIN"];
const NODE_STATUSES: readonly NodeStatusValue[] = ["NEW", "VERIFIED", "HIDDEN"];
const DEFAULT_STATUSES: NodeStatusValue[] = ["NEW", "VERIFIED"];

interface RawNodeListFilters {
  type?: string;
  status?: string;
  q?: string;
  blocked?: string;
  page?: string;
  pageSize?: string;
}

export function parseNodeListFilters(raw: RawNodeListFilters): NodeListFilters {
  return {
    type: parseNodeType(raw.type),
    statuses: parseNodeStatuses(raw.status),
    q: parseSearchString(raw.q),
    minBlocked: parseMinBlocked(raw.blocked),
    page: parsePage(raw.page),
    pageSize: parsePageSize(raw.pageSize, {
      default: TAXONOMY_LIST_DEFAULT,
      max: TAXONOMY_LIST_MAX,
    }),
  };
}

export function parseVerifiedNodeSearch(raw: { type?: string; q?: string; limit?: string }): {
  type: NodeType;
  q: string;
  limit: number;
} {
  const type = parseNodeType(raw.type);
  if (!type) throw new BadRequestException("type is required (ROLE, SKILL, or DOMAIN)");
  const q = raw.q?.trim() ?? "";
  if (q.length < 2) throw new BadRequestException("q must be at least 2 characters");
  return { type, q, limit: parseLimit(raw.limit, SEARCH_DEFAULT, SEARCH_MAX) };
}

function parseNodeType(raw: string | undefined): NodeType | undefined {
  const normalized = raw?.toUpperCase();
  const type = NODE_TYPES.find((candidate) => candidate === normalized);
  if (raw && !type) {
    throw new BadRequestException(
      `type must be one of ROLE, SKILL, DOMAIN (case-insensitive), got "${raw}"`,
    );
  }
  return type;
}

// Reuses the shared CSV split/trim/filter/dedupe mechanics (parseCsv); only
// the case-insensitive match against the taxonomy vocabulary and the
// empty-input default fallback are taxonomy-specific.
function parseNodeStatuses(raw: string | undefined): NodeStatusValue[] {
  const tokens = parseCsv("status", raw);
  if (!tokens) return DEFAULT_STATUSES;
  const values = tokens.map((value) => value.toUpperCase());
  const invalid = values.find((value) => !NODE_STATUSES.some((status) => status === value));
  if (invalid) {
    throw new BadRequestException(
      `status must be NEW, VERIFIED, or HIDDEN (case-insensitive), got "${invalid}"`,
    );
  }
  const statuses = [...new Set(values)] as NodeStatusValue[];
  return statuses.length > 0 ? statuses : DEFAULT_STATUSES;
}

function parseSearchString(raw: string | undefined): string | undefined {
  const value = raw?.trim();
  return value || undefined;
}

function parseMinBlocked(raw: string | undefined): number {
  if (raw === undefined) return 0;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new BadRequestException(`blocked must be a non-negative integer, got "${raw}"`);
  }
  return value;
}
