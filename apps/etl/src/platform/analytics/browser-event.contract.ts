import { BadRequestException } from "@nestjs/common";

import { z } from "zod";

import { normalizeClientEventTime } from "../shared/client-event-time";

import type { BrowserProductEvent } from "./analytics.types";
import { BROWSER_ANALYTICS_EVENTS, type BrowserAnalyticsEventName } from "./events";

type BrowserEventProperty = string | number | boolean;

const browserEventSchema = z
  .object({
    journeyId: z.string().uuid(),
    eventId: z.string().uuid(),
    name: z.enum(BROWSER_ANALYTICS_EVENTS),
    occurredAt: z.string().datetime({ offset: true }).optional(),
    properties: z
      .record(z.union([z.string().max(64), z.number().finite(), z.boolean()]))
      .default({}),
  })
  .strict();

const ALLOWED_PROPERTIES: Record<BrowserAnalyticsEventName, ReadonlySet<string>> = {
  landing_view: new Set([
    "landing_variant",
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_content",
    "utm_term",
    "creative_id",
  ]),
  landing_cta_clicked: new Set([
    "landing_variant",
    "destination",
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_content",
    "utm_term",
    "creative_id",
  ]),
  subscription_create_started: new Set(["profile_type", "filter_count"]),
  subscription_handoff_opened: new Set(["profile_type"]),
  subscription_create_failed: new Set(["profile_type"]),
};

export function parseBrowserEventInput(body: unknown): BrowserProductEvent {
  const parsed = browserEventSchema.safeParse(body);
  if (!parsed.success) {
    throw new BadRequestException("invalid analytics event payload");
  }

  const { journeyId, eventId, name, occurredAt, properties } = parsed.data;
  return {
    journeyId,
    eventId,
    name,
    occurredAt: normalizeClientEventTime(occurredAt),
    properties: sanitizeProperties(name, properties),
  };
}

function sanitizeProperties(
  name: BrowserAnalyticsEventName,
  properties: Record<string, BrowserEventProperty>,
): Record<string, BrowserEventProperty> {
  return Object.fromEntries(
    Object.entries(properties).filter(([key]) => ALLOWED_PROPERTIES[name].has(key)),
  );
}
