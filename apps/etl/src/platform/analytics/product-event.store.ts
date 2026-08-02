import { Inject, Injectable } from "@nestjs/common";

import { eq, sql } from "drizzle-orm";

import { DRIZZLE, schema } from "@metahunt/database";
import type { AnalyticsJourneyOrigin, DrizzleDB } from "@metahunt/database";

import type { ProductEventWrite, ProductEventWriter } from "./analytics.ports";

const { analyticsJourneys, productEvents, subscriptions } = schema;

@Injectable()
export class ProductEventStore implements ProductEventWriter {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async ensureJourney(
    journeyId: string,
    origin: AnalyticsJourneyOrigin,
    isTest = false,
  ): Promise<void> {
    await this.db
      .insert(analyticsJourneys)
      .values({ id: journeyId, personId: journeyId, origin, isTest })
      .onConflictDoUpdate({
        target: analyticsJourneys.id,
        set: { isTest: sql`${analyticsJourneys.isTest} OR ${isTest}`, lastSeenAt: sql`now()` },
      });
  }

  async record(event: ProductEventWrite): Promise<void> {
    await this.ensureJourney(
      event.journeyId,
      event.source === "browser" ? "browser" : "server",
      event.isTest,
    );
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

  async personForJourney(journeyId: string): Promise<string | null> {
    const [journey] = await this.db
      .select({ personId: analyticsJourneys.personId })
      .from(analyticsJourneys)
      .where(eq(analyticsJourneys.id, journeyId));
    return journey?.personId ?? null;
  }
}
