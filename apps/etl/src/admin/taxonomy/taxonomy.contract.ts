import { IsString } from "class-validator";

import type { NodeType } from "@metahunt/database";

export const TAXONOMY_LIST_DEFAULT = 50;
export const TAXONOMY_LIST_MAX = 200;

export type NodeStatusValue = "NEW" | "VERIFIED" | "HIDDEN";

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
