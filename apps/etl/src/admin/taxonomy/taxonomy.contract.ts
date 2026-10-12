import { Type } from "class-transformer";
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from "class-validator";

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

// Raw skill strings of the vacancies linked to a node, grouped by the alias
// they resolve through — what the node is actually made of.
export interface NodeMentionsAlias {
  alias: string;
  vacancies: number;
  variants: { raw: string; vacancies: number }[];
}

export interface NodeMentions {
  nodeId: string;
  vacancies: number;
  aliases: NodeMentionsAlias[];
}

export class SplitTargetDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsUUID()
  nodeId?: string;
}

export class SplitNodeDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  aliases!: string[];

  @ValidateNested()
  @Type(() => SplitTargetDto)
  target!: SplitTargetDto;

  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}

// Link counts per node over the records whose links changed.
export interface NodeLinkDelta {
  nodeId: string;
  name: string;
  vacanciesBefore: number;
  vacanciesAfter: number;
  candidatesBefore: number;
  candidatesAfter: number;
}

export interface ReprojectResult {
  nodeId: string;
  vacancies: { scanned: number; changed: number; skipped: number };
  candidates: { scanned: number; changed: number };
  links: NodeLinkDelta[];
}

export interface SplitResult extends ReprojectResult {
  dryRun: boolean;
  aliases: string[];
  source: { id: string; name: string };
  target: { id: string; name: string; created: boolean };
}
