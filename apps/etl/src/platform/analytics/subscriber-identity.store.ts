import { Inject, Injectable } from "@nestjs/common";

import { eq } from "drizzle-orm";

import { DRIZZLE, schema } from "@metahunt/database";
import type { DrizzleDB } from "@metahunt/database";

import type { SubscriberIdentity, SubscriberIdentityReader } from "./analytics.ports";

const { subscriptions } = schema;

@Injectable()
export class SubscriberIdentityStore implements SubscriberIdentityReader {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

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
