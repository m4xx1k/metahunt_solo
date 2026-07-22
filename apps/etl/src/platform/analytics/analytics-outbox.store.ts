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
        subscription_id: string | null;
        name: string;
        source: ProductEventWrite["source"];
        dedupe_key: string;
        properties: Record<string, unknown>;
        occurred_at: string | Date;
      }>(sql`
        SELECT id, journey_id, subscription_id, name, source, dedupe_key,
               properties, occurred_at
        FROM analytics_outbox
        WHERE processed_at IS NULL
        ORDER BY created_at ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      `);
      if (pending.rows.length === 0) return [];

      const events: ProductEventWrite[] = pending.rows.map((row) => ({
        journeyId: row.journey_id,
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
