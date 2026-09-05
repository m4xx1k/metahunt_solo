import { IsIn, IsString } from "class-validator";

import type { NodeType } from "@metahunt/database";

export const TAXONOMY_LIST_DEFAULT = 50;
export const TAXONOMY_LIST_MAX = 200;

export const TAXONOMY_MAP_DEFAULT = 150;
export const TAXONOMY_MAP_MAX = 300;

export type NodeStatusValue = "NEW" | "VERIFIED" | "HIDDEN";

export type NodeKindValue = "TECH" | "CONCEPT" | "SOFT";
export const NODE_KINDS: readonly NodeKindValue[] = ["TECH", "CONCEPT", "SOFT"];

export interface NodeListFilters {
  type?: NodeType;
  statuses: NodeStatusValue[];
  q?: string;
  minBlocked: number;
  page: number;
  pageSize: number;
}

export interface NodeListItem {
  id: string;
  type: NodeType;
  canonicalName: string;
  status: NodeStatusValue;
  vacanciesBlocked: number;
  aliasCount: number;
}

export interface NodeListResult {
  items: NodeListItem[];
  page: number;
  pageSize: number;
  total: number;
}

export class RenameTaxonomyNodeDto {
  @IsString()
  name!: string;
}

export interface MapFilters {
  track: string;
  limit: number;
}

// One row per skill node, top-N by df within the track — the taxonomy
// curation map's tile data. See md/journal/migrations/taxonomy-kind-map.md.
export interface MapNodeItem {
  id: string;
  name: string;
  kind: NodeKindValue | null;
  status: NodeStatusValue;
  df: number;
  aliasCount: number;
}

export class SetNodeKindDto {
  @IsIn([...NODE_KINDS, null])
  kind!: NodeKindValue | null;
}
