import { ApiPropertyOptional } from "@nestjs/swagger";

import { Transform, Type } from "class-transformer";
import { IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

import { FIT_TIER_VALUES, type FitTier } from "../../03-discovery/ranking/ranking.contract";

import {
  EMPLOYMENT_TYPE_VALUES,
  ENGLISH_LEVEL_VALUES,
  SENIORITY_VALUES,
  WORK_FORMAT_VALUES,
  type EmploymentType,
  type EnglishLevel,
  type Seniority,
  type WorkFormat,
} from "./contract";

// Shared, validated filter contract for the endpoints that consume the vacancy
// filters — GET /feed (query) and POST /ranking/match (body). One transport
// serves both: a repeated query param arrives as string[], a single value as a
// string, a POST field as a JSON array — the normalisers below flatten all three
// (and CSV) to a trimmed list, so the same decorators validate every source.

// null/blank → undefined ("no filter"); string | string[] | CSV → trimmed list.
const toList = () =>
  Transform(({ value }) => {
    if (value === undefined || value === null) return undefined;
    const arr = Array.isArray(value) ? value : String(value).split(",");
    const out = arr.map((v) => String(v).trim()).filter((v) => v.length > 0);
    return out.length > 0 ? out : undefined;
  });

// Accept "true"/"false"/"1"/"0" (query strings) and real booleans (JSON body).
const toBool = () =>
  Transform(({ value }) => {
    if (value === undefined || value === null || value === "") return undefined;
    if (value === true || value === "true" || value === "1") return true;
    if (value === false || value === "false" || value === "0") return false;
    return value as unknown; // anything else → let @IsBoolean reject it (400)
  });

const trimmed = () =>
  Transform(({ value }) =>
    typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined,
  );

// Fields both endpoints share. Subclasses add their transport-specific extras.
export class FilterParamsDto {
  @ApiPropertyOptional({ description: "Vacancy source id." })
  @IsOptional()
  @trimmed()
  @IsString()
  sourceId?: string;

  @ApiPropertyOptional({ enum: SENIORITY_VALUES, isArray: true })
  @IsOptional()
  @toList()
  @IsArray()
  @IsIn([...SENIORITY_VALUES], { each: true })
  seniorities?: Seniority[];

  @ApiPropertyOptional({ enum: WORK_FORMAT_VALUES, isArray: true })
  @IsOptional()
  @toList()
  @IsArray()
  @IsIn([...WORK_FORMAT_VALUES], { each: true })
  workFormats?: WorkFormat[];

  @ApiPropertyOptional({ enum: ENGLISH_LEVEL_VALUES, isArray: true })
  @IsOptional()
  @toList()
  @IsArray()
  @IsIn([...ENGLISH_LEVEL_VALUES], { each: true })
  englishLevels?: EnglishLevel[];

  @ApiPropertyOptional({ enum: EMPLOYMENT_TYPE_VALUES, isArray: true })
  @IsOptional()
  @toList()
  @IsArray()
  @IsIn([...EMPLOYMENT_TYPE_VALUES], { each: true })
  employmentTypes?: EmploymentType[];

  @ApiPropertyOptional({ description: "Filter by whether a test assignment is mentioned." })
  @IsOptional()
  @toBool()
  @IsBoolean()
  hasTestAssignment?: boolean;

  @ApiPropertyOptional({
    description: "Filter by whether reservation or military support is mentioned.",
  })
  @IsOptional()
  @toBool()
  @IsBoolean()
  hasReservation?: boolean;

  @ApiPropertyOptional({
    type: [String],
    description: "DOMAIN slugs. Multiple values are OR-combined.",
    example: ["fintech", "ai-ml"],
  })
  @IsOptional()
  @toList()
  @IsArray()
  @IsString({ each: true })
  domainIds?: string[];

  @ApiPropertyOptional({
    type: [String],
    description: "Experience buckets: exact 0..5 or 6+.",
    example: ["2", "3", "6+"],
  })
  @IsOptional()
  @toList()
  @IsArray()
  @IsString({ each: true })
  experienceYears?: string[];

  @ApiPropertyOptional({ description: "Only vacancies posted within this many days.", example: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  postedWithinDays?: number;
}

// GET /feed query — browse filters + the feed-only refinements/pagination.
export class FeedQueryDto extends FilterParamsDto {
  @ApiPropertyOptional({ description: "Free-text search over vacancy title.", example: "nestjs" })
  @IsOptional()
  @trimmed()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ description: "Single ROLE slug.", example: "backend-developer" })
  @IsOptional()
  @trimmed()
  @IsString()
  roleId?: string;

  @ApiPropertyOptional({
    type: [String],
    description: "ROLE slugs. Multiple values are OR-combined.",
    example: ["backend-developer", "full-stack-developer"],
  })
  @IsOptional()
  @toList()
  @IsArray()
  @IsString({ each: true })
  roleIds?: string[];

  @ApiPropertyOptional({
    type: [String],
    description: "SKILL slugs. Vacancies must match all listed skills by default.",
    example: ["typescript", "nestjs"],
  })
  @IsOptional()
  @toList()
  @IsArray()
  @IsString({ each: true })
  skillIds?: string[];

  @ApiPropertyOptional({ description: "Show only representatives of a deduplication group." })
  @IsOptional()
  @toBool()
  @IsBoolean()
  hasDuplicates?: boolean;

  @ApiPropertyOptional({ description: "Also include vacancies without a verified role." })
  @IsOptional()
  @toBool()
  @IsBoolean()
  includeRoleless?: boolean;

  @ApiPropertyOptional({
    description: "Return unverified skills too. Intended for operator/debug use.",
  })
  @IsOptional()
  @toBool()
  @IsBoolean()
  includeAllSkills?: boolean;

  @ApiPropertyOptional({ description: "Let optional skills satisfy skill filters." })
  @IsOptional()
  @toBool()
  @IsBoolean()
  includeOptionalSkills?: boolean;

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

// POST /ranking/match body — the CV's plain-text skills + shared filters + the
// warm-only coverage gate.
export class MatchDto extends FilterParamsDto {
  @ApiPropertyOptional({
    type: [String],
    description: "Plain-text candidate skills to resolve and rank vacancies against.",
    example: ["TypeScript", "NestJS", "PostgreSQL"],
  })
  @IsOptional()
  @Transform(({ value }) =>
    Array.isArray(value) ? value.map((v) => String(v).trim()).filter((v) => v.length > 0) : [],
  )
  @IsArray()
  @IsString({ each: true })
  skills?: string[];

  @ApiPropertyOptional({ enum: FIT_TIER_VALUES, description: "Minimum warm-match tier to return." })
  @IsOptional()
  @trimmed()
  @IsIn([...FIT_TIER_VALUES])
  minFitTier?: FitTier;

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
