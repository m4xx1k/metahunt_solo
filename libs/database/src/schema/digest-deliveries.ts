import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { subscriptions } from "./subscriptions";

export const DIGEST_DELIVERY_STATUSES = ["pending", "completed"] as const;
export type DigestDeliveryStatus = (typeof DIGEST_DELIVERY_STATUSES)[number];

export const DIGEST_PROFILE_TYPES = ["feed", "cv"] as const;
export type DigestProfileType = (typeof DIGEST_PROFILE_TYPES)[number];

// Original delivery envelope survives Temporal/page retries. Progress is
// committed together with sent_notifications; completion is committed together
// with the digest_sent outbox event.
export const digestDeliveries = pgTable(
  "digest_deliveries",
  {
    id: text("id").primaryKey(),
    subscriptionId: uuid("subscription_id")
      .notNull()
      .references(() => subscriptions.id, { onDelete: "cascade" }),
    vacancies: integer("vacancies").notNull(),
    matchedVacancies: integer("matched_vacancies").notNull(),
    pages: integer("pages").notNull(),
    sentVacancies: integer("sent_vacancies").notNull().default(0),
    sentPages: integer("sent_pages").notNull().default(0),
    isFirstDigest: boolean("is_first_digest").notNull(),
    profileType: text("profile_type").notNull().$type<DigestProfileType>(),
    status: text("status").notNull().default("pending").$type<DigestDeliveryStatus>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    index("digest_deliveries_subscription_status_idx").on(t.subscriptionId, t.status),
    uniqueIndex("digest_deliveries_one_pending_idx")
      .on(t.subscriptionId)
      .where(sql`${t.status} = 'pending'`),
  ],
);

export type DigestDelivery = typeof digestDeliveries.$inferSelect;
export type NewDigestDelivery = typeof digestDeliveries.$inferInsert;
