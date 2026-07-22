import type { NodeStatus, NodeType } from "@/lib/api/taxonomy";
import {
  firstSearchParam,
  nonNegativeIntegerSearchParam,
  positiveIntegerSearchParam,
  uuidSearchParam,
  type SearchParamValue,
} from "@/lib/search-params";

const DEFAULT_STATUSES: NodeStatus[] = ["NEW", "VERIFIED"];
const NODE_TYPES: readonly NodeType[] = ["ROLE", "SKILL", "DOMAIN"];
const NODE_STATUSES: readonly NodeStatus[] = ["NEW", "VERIFIED", "HIDDEN"];

export interface TaxonomyPageState {
  type?: NodeType;
  statuses: NodeStatus[];
  q?: string;
  minBlocked: number;
  page: number;
  selected?: string;
}

export function parseTaxonomyPageState(
  params: Record<string, SearchParamValue>,
): TaxonomyPageState {
  const q = firstSearchParam(params.q)?.trim();
  return {
    type: parseNodeType(firstSearchParam(params.type)),
    statuses: parseNodeStatuses(firstSearchParam(params.status)),
    q: q || undefined,
    minBlocked: nonNegativeIntegerSearchParam(params.blocked),
    page: positiveIntegerSearchParam(params.page, 1),
    selected: uuidSearchParam(params.selected),
  };
}

function parseNodeType(raw: string | undefined): NodeType | undefined {
  const normalized = raw?.toUpperCase();
  return NODE_TYPES.find((type) => type === normalized);
}

function parseNodeStatuses(raw: string | undefined): NodeStatus[] {
  if (!raw) return DEFAULT_STATUSES;
  const statuses = raw
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .flatMap((value) => NODE_STATUSES.filter((status) => status === value));
  return statuses.length > 0 ? [...new Set(statuses)] : DEFAULT_STATUSES;
}
