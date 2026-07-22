import { getOrCreateJourneyId } from "@/lib/analytics-journey";

import { apiPost } from "./client";

export const BROWSER_ANALYTICS_EVENTS = [
  "landing_view",
  "landing_cta_clicked",
  "subscription_create_started",
  "subscription_handoff_opened",
  "subscription_create_failed",
] as const;

export type BrowserAnalyticsEventName = (typeof BROWSER_ANALYTICS_EVENTS)[number];
type BrowserEventProperty = string | number | boolean;

interface CaptureBrowserEventInput {
  name: BrowserAnalyticsEventName;
  properties?: Record<string, BrowserEventProperty>;
}

const RETRY_DELAY_MS = 500;

async function postBrowserEvent(body: Record<string, unknown>): Promise<{ accepted: true }> {
  try {
    return await apiPost<{ accepted: true }>("/analytics/events", body, { keepalive: true });
  } catch (firstError) {
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    try {
      return await apiPost<{ accepted: true }>("/analytics/events", body, { keepalive: true });
    } catch {
      throw firstError;
    }
  }
}

export const analyticsApi = {
  captureBrowserEvent(input: CaptureBrowserEventInput): Promise<{ accepted: true }> {
    return postBrowserEvent({
      journeyId: getOrCreateJourneyId(),
      eventId: crypto.randomUUID(),
      name: input.name,
      occurredAt: new Date().toISOString(),
      properties: input.properties ?? {},
    });
  },
};
