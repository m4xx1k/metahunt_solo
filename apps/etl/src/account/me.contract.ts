import { ApiPropertyOptional, OmitType } from "@nestjs/swagger";

import { Transform, Type } from "class-transformer";
import type { TransformFnParams } from "class-transformer";
import {
  IsBoolean,
  IsObject,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from "class-validator";

import { CandidateMatchParamsDto } from "../platform/shared/filter-params.dto";
import type { SubscriptionParams } from "../platform/subscriptions/subscription.contract";

export interface MeCv {
  id: string;
  candidateId: string;
  label: string;
  isActive: boolean;
  role: string | null;
  seniority: string | null;
  experienceYears: number | null;
  createdAt: string;
}

export class EditableMatchCriteriaDto extends OmitType(CandidateMatchParamsDto, [
  "page",
  "pageSize",
] as const) {}

interface MeSubscriptionBase {
  id: string;
  name: string;
  label: string;
  isActive: boolean;
  createdAt: string;
  tgUsername: string | null;
  tgFirstName: string | null;
}

export interface MeCvSubscription extends MeSubscriptionBase {
  isCv: true;
  candidateId: string;
  params: EditableMatchCriteriaDto;
}

export interface MeFeedSubscription extends MeSubscriptionBase {
  isCv: false;
  candidateId: null;
  params: SubscriptionParams;
}

export type MeSubscription = MeCvSubscription | MeFeedSubscription;

export class UpdateSubscriptionDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 64 })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(({ value }: TransformFnParams) =>
    typeof value === "string" ? value.trim() : (value as unknown),
  )
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  name?: string;

  @ApiPropertyOptional()
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ type: EditableMatchCriteriaDto })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsObject()
  @ValidateNested()
  @Type(() => EditableMatchCriteriaDto)
  params?: EditableMatchCriteriaDto;
}
