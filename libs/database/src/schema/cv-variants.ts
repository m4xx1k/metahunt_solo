import { pgTable, uuid, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";

import { candidates } from "./candidates";

// A tailored CV or cover letter derived from a candidate's structured resume for
// one target vacancy — see md/journal/migrations/cv-cover-letter.md (ADR-0011).
// `payload` is the constrained mapping (SELECT/REORDER/REPHRASE + guard verdicts),
// never free prose. `kind` is a plain text tag (not an enum) so the whole feature
// reverts with a single `DROP TABLE` — no orphaned pg enum type to clean up.
// `vacancyId` is free text (a vacancy id or a pasted-JD hash), nullable for drafts.
export const cvVariants = pgTable(
  "cv_variants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    candidateId: uuid("candidate_id")
      .notNull()
      .references(() => candidates.id, { onDelete: "cascade" }),
    vacancyId: text("vacancy_id"),
    kind: text("kind").notNull().default("tailored"),
    payload: jsonb("payload").notNull().$type<Record<string, unknown>>(),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("cv_variants_candidate_id_idx").on(t.candidateId)],
);

export type CvVariant = typeof cvVariants.$inferSelect;
export type NewCvVariant = typeof cvVariants.$inferInsert;
