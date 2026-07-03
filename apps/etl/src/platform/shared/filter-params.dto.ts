import { Transform, Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";

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
import { FIT_TIER_VALUES, type FitTier } from "../../03-discovery/ranking/ranking.contract";

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
    return value; // anything else → let @IsBoolean reject it (400)
  });

const trimmed = () =>
  Transform(({ value }) =>
    typeof value === "string" && value.trim().length > 0
      ? value.trim()
      : undefined,
  );

// Fields both endpoints share. Subclasses add their transport-specific extras.
export class FilterParamsDto {
  @IsOptional()
  @trimmed()
  @IsString()
  sourceId?: string;

  @IsOptional()
  @toList()
  @IsArray()
  @IsIn([...SENIORITY_VALUES], { each: true })
  seniorities?: Seniority[];

  @IsOptional()
  @toList()
  @IsArray()
  @IsIn([...WORK_FORMAT_VALUES], { each: true })
  workFormats?: WorkFormat[];

  @IsOptional()
  @toList()
  @IsArray()
  @IsIn([...ENGLISH_LEVEL_VALUES], { each: true })
  englishLevels?: EnglishLevel[];

  @IsOptional()
  @toList()
  @IsArray()
  @IsIn([...EMPLOYMENT_TYPE_VALUES], { each: true })
  employmentTypes?: EmploymentType[];

  @IsOptional()
  @toBool()
  @IsBoolean()
  hasTestAssignment?: boolean;

  @IsOptional()
  @toBool()
  @IsBoolean()
  hasReservation?: boolean;

  @IsOptional()
  @toList()
  @IsArray()
  @IsString({ each: true })
  domainIds?: string[];

  @IsOptional()
  @toList()
  @IsArray()
  @IsString({ each: true })
  experienceYears?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  postedWithinDays?: number;
}

// GET /feed query — browse filters + the feed-only refinements/pagination.
export class FeedQueryDto extends FilterParamsDto {
  @IsOptional()
  @trimmed()
  @IsString()
  q?: string;

  @IsOptional()
  @trimmed()
  @IsString()
  roleId?: string;

  @IsOptional()
  @toList()
  @IsArray()
  @IsString({ each: true })
  roleIds?: string[];

  @IsOptional()
  @toList()
  @IsArray()
  @IsString({ each: true })
  skillIds?: string[];

  @IsOptional()
  @toBool()
  @IsBoolean()
  hasDuplicates?: boolean;

  @IsOptional()
  @toBool()
  @IsBoolean()
  includeRoleless?: boolean;

  @IsOptional()
  @toBool()
  @IsBoolean()
  includeAllSkills?: boolean;

  @IsOptional()
  @toBool()
  @IsBoolean()
  includeOptionalSkills?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

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
  @IsOptional()
  @Transform(({ value }) =>
    Array.isArray(value)
      ? value.map((v) => String(v).trim()).filter((v) => v.length > 0)
      : [],
  )
  @IsArray()
  @IsString({ each: true })
  skills?: string[];

  @IsOptional()
  @trimmed()
  @IsIn([...FIT_TIER_VALUES])
  minFitTier?: FitTier;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
