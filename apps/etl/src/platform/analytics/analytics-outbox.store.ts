import { Inject, Injectable } from "@nestjs/common";

import { inArray, sql } from "drizzle-orm";

import { DRIZZLE, schema } from "@metahunt/database";
import type { DrizzleDB } from "@metahunt/database";

import type {
  AnalyticsExecutor,
  AnalyticsOutboxWriter,
  ProductEventWrite,
} from "./analytics.ports";

const { analyticsOutbox, productEvents } = schema;

@Injectable()
export class AnalyticsOutboxStore implements AnalyticsOutboxWriter {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async enqueue(event: ProductEventWrite, executor: AnalyticsExecutor = this.db): Promise<void> {
    await executor
      .insert(analyticsOutbox)
      .values({ ...event, subscriptionId: event.subscriptionId ?? null })
      .onConflictDoNothing({ target: analyticsOutbox.dedupeKey });
  }

  async drain(limit: number): Promise<ProductEventWrite[]> {
    return this.db.transaction(async (tx) => {
      const pending = await tx.execute<{
        id: string;
        journey_id: string;
        person_id: string;
        is_test: boolean;
        subscription_id: string | null;
        name: string;
        source: ProductEventWrite["source"];
        dedupe_key: string;
        properties: Record<string, unknown>;
        occurred_at: string | Date;
      }>(sql`
        SELECT outbox.id, outbox.journey_id,
               COALESCE(sub.person_id, journey.person_id) AS person_id,
               journey.is_test, outbox.subscription_id,
               outbox.name, outbox.source, outbox.dedupe_key, outbox.properties, outbox.occurred_at
        FROM analytics_outbox outbox
        JOIN analytics_journeys journey ON journey.id = outbox.journey_id
        -- The subscription's person outranks the journey's: it survives an
        -- account claim, where a per-journey id becomes a permanent stranger.
        LEFT JOIN subscriptions sub ON sub.id = outbox.subscription_id
        WHERE outbox.processed_at IS NULL
        ORDER BY outbox.created_at ASC
        LIMIT ${limit}
        -- OF outbox is load-bearing: a bare FOR UPDATE tries to lock every
        -- table in the query, and Postgres refuses to lock the nullable side
        -- of an outer join. Only the outbox rows are being claimed anyway.
        FOR UPDATE OF outbox SKIP LOCKED
      `);
      if (pending.rows.length === 0) return [];

      const events: ProductEventWrite[] = pending.rows.map((row) => ({
        journeyId: row.journey_id,
        personId: row.person_id,
        isTest: row.is_test,
        ...(row.subscription_id ? { subscriptionId: row.subscription_id } : {}),
        name: row.name,
        source: row.source,
        dedupeKey: row.dedupe_key,
        properties: row.properties,
        occurredAt: row.occurred_at instanceof Date ? row.occurred_at : new Date(row.occurred_at),
      }));
      await tx
        .insert(productEvents)
        .values(events)
        .onConflictDoNothing({ target: productEvents.dedupeKey });
      await tx
        .update(analyticsOutbox)
        .set({ processedAt: sql`now()` })
        .where(
          inArray(
            analyticsOutbox.id,
            pending.rows.map((row) => row.id),
          ),
        );
      return events;
    });
  }
}
