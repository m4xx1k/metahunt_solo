import { index, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

/**
 * The durable, provider-cost-bearing result for one exact extraction contract
 * and input. rss_records remain separate observations and only reference this
 * artefact through their JSON audit sidecar.
 */
export const extractionArtifacts = pgTable(
  "extraction_artifacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    specHash: text("spec_hash").notNull(),
    inputHash: text("input_hash").notNull(),
    status: text("status").notNull(),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    data: jsonb("data"),
    error: text("error"),
    usage: jsonb("usage"),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    bamlVersion: text("baml_version").notNull(),
    bamlSourceHash: text("baml_source_hash").notNull(),
    taxonomyHash: text("taxonomy_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    unique("extraction_artifacts_spec_input_unique").on(t.specHash, t.inputHash),
    index("extraction_artifacts_lease_idx").on(t.status, t.leaseExpiresAt),
  ],
);
