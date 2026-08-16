import { Inject, Injectable } from "@nestjs/common";

import { eq, sql } from "drizzle-orm";

import { DRIZZLE, schema } from "@metahunt/database";
import type { AnalyticsJourneyOrigin, DrizzleDB } from "@metahunt/database";

import type { ProductEventWrite, ProductEventWriter, SubscriberIdentity } from "./analytics.ports";

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

  async subscriberForSubscription(subscriptionId: string): Promise<SubscriberIdentity | null> {
    const [subscription] = await this.db
      .select({ personId: subscriptions.personId, candidateId: subscriptions.candidateId })
      .from(subscriptions)
      .where(eq(subscriptions.id, subscriptionId));
    return toSubscriber(subscription);
  }

  async subscriberForJourney(journeyId: string): Promise<SubscriberIdentity | null> {
    // A journey can carry zero or many subscriptions; only an unambiguous one
    // names a person, so two rows resolve to nobody rather than to a guess.
    const rows = await this.db
      .select({ personId: subscriptions.personId, candidateId: subscriptions.candidateId })
      .from(subscriptions)
      .where(eq(subscriptions.journeyId, journeyId))
      .limit(2);
    return rows.length === 1 ? toSubscriber(rows[0]) : null;
  }
}

function toSubscriber(row?: {
  personId: string | null;
  candidateId: string | null;
}): SubscriberIdentity | null {
  if (!row?.personId) return null;
  return { personId: row.personId, subscriptionKind: row.candidateId ? "cv" : "feed" };
}
