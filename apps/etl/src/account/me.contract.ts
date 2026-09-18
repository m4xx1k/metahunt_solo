import { ApiPropertyOptional } from "@nestjs/swagger";

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

import { SubscriptionFilterDto } from "../platform/shared/filter-params.dto";
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

/**
 * `live` delivers. `pending` was created but never confirmed through the
 * Telegram deep link. `off` was switched off — by the owner, or by the bot
 * being blocked. Only the first two are things the account actually has.
 */
export type MeSubscriptionStatus = "live" | "pending" | "off";

interface MeSubscriptionBase {
  id: string;
  name: string;
  label: string;
  isActive: boolean;
  status: MeSubscriptionStatus;
  createdAt: string;
  tgUsername: string | null;
  tgFirstName: string | null;
  /**
   * Display name for each node ref in `params`, keyed as `params` spells it.
   * The account editor labels a stored selection from this rather than from the
   * feed catalog, which only lists roles/skills that have vacancies today.
   */
  refNames: Record<string, string>;
}

export interface MeCvSubscription extends MeSubscriptionBase {
  isCv: true;
  candidateId: string;
  /** The CV this digest ranks against — null once that CV is deleted. */
  cvLabel: string | null;
  /** Upload time, the only thing telling two same-named CVs apart. */
  cvAddedAt: string | null;
  /** Same filter as a feed subscription: the CV ranks it, it does not narrow it. */
  params: SubscriptionParams;
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

  @ApiPropertyOptional({ type: SubscriptionFilterDto })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsObject()
  @ValidateNested()
  @Type(() => SubscriptionFilterDto)
  params?: SubscriptionFilterDto;
}
