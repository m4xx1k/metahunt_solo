import { Inject, Injectable } from "@nestjs/common";

import { eq, sql } from "drizzle-orm";

import { DRIZZLE, schema } from "@metahunt/database";
import type { AnalyticsJourneyOrigin, DrizzleDB } from "@metahunt/database";

import type { ProductEventWrite, ProductEventWriter } from "./analytics.ports";

const { analyticsJourneys, productEvents, subscriptions } = schema;

@Injectable()
export class ProductEventStore implements ProductEventWriter {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async ensureJourney(journeyId: string, origin: AnalyticsJourneyOrigin): Promise<void> {
    await this.db
      .insert(analyticsJourneys)
      .values({ id: journeyId, origin })
      .onConflictDoUpdate({
        target: analyticsJourneys.id,
        set: { lastSeenAt: sql`now()` },
      });
  }

  async record(event: ProductEventWrite): Promise<void> {
    await this.ensureJourney(event.journeyId, event.source === "browser" ? "browser" : "server");
    await this.db
      .insert(productEvents)
      .values({
        journeyId: event.journeyId,
        subscriptionId: event.subscriptionId,
        name: event.name,
        source: event.source,
        dedupeKey: event.dedupeKey,
        properties: event.properties,
        occurredAt: event.occurredAt,
      })
      .onConflictDoNothing({ target: productEvents.dedupeKey });
  }

  async journeyForSubscription(subscriptionId: string): Promise<string | null> {
    const [subscription] = await this.db
      .select({ journeyId: subscriptions.journeyId })
      .from(subscriptions)
      .where(eq(subscriptions.id, subscriptionId));
    if (!subscription) return null;
    const journeyId = subscription.journeyId ?? subscriptionId;

    await this.ensureJourney(journeyId, "legacy_subscription");
    if (subscription.journeyId === null) {
      await this.db
        .update(subscriptions)
        .set({ journeyId })
        .where(eq(subscriptions.id, subscriptionId));
    }
    return journeyId;
  }
}
