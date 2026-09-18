import { Inject, Injectable } from "@nestjs/common";

import { inArray } from "drizzle-orm";

import { DRIZZLE, schema } from "@metahunt/database";
import type { DrizzleDB } from "@metahunt/database";

import { NodeSlugResolver } from "../nodes/node-slug.resolver";
import { asString, asStringArray } from "../shared/coerce";
import { isUuid } from "../shared/query-parsing";

import {
  SUBSCRIPTION_PARAM_KEYS,
  type SubscriptionParamKey,
  type SubscriptionParams,
} from "./subscription.contract";

const MAX_SUMMARY_NAMES = 2;
const EDITABLE_AXES = [
  ["roleIds", "ROLE"],
  ["skillIds", "SKILL"],
  ["excludedSkillIds", "SKILL"],
  ["domainIds", "DOMAIN"],
] as const;

export class InvalidSubscriptionCriteriaError extends Error {}

function setAxis(
  params: SubscriptionParams,
  key: (typeof EDITABLE_AXES)[number][0],
  ids: string[] | undefined,
): void {
  // Sorted so two selections of the same ids in a different order normalize
  // to identical jsonb — the raw `params = ...::jsonb` equality the create()
  // idempotency check and dedup GC rely on is order-sensitive otherwise.
  if (ids && ids.length > 0) params[key] = [...ids].sort();
  else delete params[key];
}

@Injectable()
export class SubscriptionCriteriaService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly slugs: NodeSlugResolver,
  ) {}

  async normalize(raw: SubscriptionParams): Promise<SubscriptionParams> {
    return this.normalizeAxes(raw, false);
  }

  async normalizeEditable(raw: SubscriptionParams): Promise<SubscriptionParams> {
    for (const key of SUBSCRIPTION_PARAM_KEYS) {
      if (raw[key] === null) {
        throw new InvalidSubscriptionCriteriaError(`Invalid ${key}`);
      }
    }
    const sourceId = asString(raw.sourceId);
    if (sourceId && !isUuid(sourceId)) {
      throw new InvalidSubscriptionCriteriaError("Invalid source");
    }
    const experienceYears = asStringArray(raw.experienceYears);
    if (experienceYears.some((value) => !/^(?:[0-5]|6\+)$/.test(value))) {
      throw new InvalidSubscriptionCriteriaError("Invalid experience value");
    }
    return this.normalizeAxes(raw, true);
  }

  async toPublic(stored: SubscriptionParams): Promise<SubscriptionParams> {
    const params: SubscriptionParams = { ...stored };
    await Promise.all(
      EDITABLE_AXES.map(async ([key, type]) => {
        const refs = await this.slugs.toSlugs(type, asStringArray(stored[key]));
        setAxis(params, key, refs);
      }),
    );
    return params;
  }

  /**
   * Display names for the node refs this filter stores, keyed exactly as
   * `toPublic` emits them. The editor needs them because its option catalogs
   * only carry nodes that currently have vacancies, while a subscription may
   * legitimately name one that has none — which is half the point of
   * subscribing. Without a name such a ref renders as a bare slug.
   */
  async resolveRefNames(stored: SubscriptionParams): Promise<Record<string, string>> {
    const ids = EDITABLE_AXES.flatMap(([key]) => asStringArray(stored[key])).filter(isUuid);
    if (ids.length === 0) return {};
    const rows = await this.db
      .select({
        id: schema.nodes.id,
        slug: schema.nodes.slug,
        name: schema.nodes.canonicalName,
      })
      .from(schema.nodes)
      .where(inArray(schema.nodes.id, ids));
    return Object.fromEntries(rows.map((row) => [row.slug ?? row.id, row.name]));
  }

  async describe(params: SubscriptionParams): Promise<string> {
    const roleNames = await this.resolveNames(asStringArray(params.roleIds));
    const domainNames = await this.resolveNames(asStringArray(params.domainIds));
    const parts: string[] = [];
    this.pushNames(parts, roleNames);
    this.pushNames(parts, domainNames);

    const skillCount = asStringArray(params.skillIds).length;
    if (skillCount > 0) parts.push(`${skillCount} скіл.`);
    const seniorities = asStringArray(params.seniorities);
    if (seniorities.length > 0)
      parts.push(seniorities.map((value) => value.toLowerCase()).join("/"));
    const formats = asStringArray(params.workFormats);
    if (formats.length > 0) parts.push(formats.map((value) => value.toLowerCase()).join("/"));
    const experience = asStringArray(params.experienceYears);
    if (experience.length > 0) parts.push(`досвід ${experience.join("/")}р`);
    if (params.hasReservation === true) parts.push("бронь");
    return parts.length > 0 ? parts.join(" · ") : "усі вакансії";
  }

  private async normalizeAxes(
    raw: SubscriptionParams,
    strict: boolean,
  ): Promise<SubscriptionParams> {
    const params: SubscriptionParams = {};
    // The one cast in this file, and it sits where jsonb enters: the key and the
    // value are correlated at runtime but TS cannot prove it across a union key.
    const write = params as Record<SubscriptionParamKey, unknown>;
    for (const key of SUBSCRIPTION_PARAM_KEYS) {
      const value = raw[key];
      if (value !== undefined && value !== null) write[key] = value;
    }

    await Promise.all(
      EDITABLE_AXES.map(async ([key, type]) => {
        const refs = asStringArray(raw[key]);
        if (strict && refs.some(isUuid)) {
          throw new InvalidSubscriptionCriteriaError(`Invalid ${key}`);
        }
        const ids = await this.slugs.toIds(type, refs);
        if (strict && ids?.length !== refs.length) {
          throw new InvalidSubscriptionCriteriaError(`Unknown ${key}`);
        }
        setAxis(params, key, ids);
      }),
    );
    return params;
  }

  private async resolveNames(ids: string[]): Promise<string[]> {
    if (ids.length === 0) return [];
    return this.db
      .select({ name: schema.nodes.canonicalName })
      .from(schema.nodes)
      .where(inArray(schema.nodes.id, ids))
      .then((rows) => rows.map((row) => row.name));
  }

  private pushNames(parts: string[], names: string[]): void {
    if (names.length === 0) return;
    const shown = names.slice(0, MAX_SUMMARY_NAMES).join(", ");
    const extra = names.length - MAX_SUMMARY_NAMES;
    parts.push(extra > 0 ? `${shown} +${extra}` : shown);
  }
}
