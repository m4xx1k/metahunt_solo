import {
  pgTable,
  pgEnum,
  uuid,
  text,
  jsonb,
  integer,
  timestamp,
  unique,
  primaryKey,
  index,
} from "drizzle-orm/pg-core";

import { nodes } from "./nodes";
// Reuse the existing enums — do NOT redeclare (drizzle would try to recreate
// the pg type). They mirror the BAML enums in extract-candidate.baml.
import { seniority, englishLevel } from "./vacancies";

// How a candidate row came to exist: `user` = a real uploaded CV; `sample` = a
// seeded demo profile the reverse-ATS picker ranks against (no file, no LLM).
export const candidateType = pgEnum("candidate_type", ["user", "sample"]);

// A candidate parsed from an uploaded CV — the reverse-ATS counterpart of a
// vacancy. See md/journal/migrations/reverse-ats.md (§3-4). `extracted` holds
// the raw ExtractedCandidate JSON (incl. unmatchedSkills strings); resolved
// SKILL nodes live in `candidate_nodes`. role/seniority/english are context
// flags only (not scored). `contentHash` makes re-upload idempotent — the same
// CV text never hits the LLM twice.
export const candidates = pgTable(
  "candidates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contentHash: text("content_hash").notNull(),
    sourceText: text("source_text").notNull(),
    extracted: jsonb("extracted").notNull().$type<Record<string, unknown>>(),
    type: candidateType("type").notNull().default("user"),
    role: text("role"),
    seniority: seniority("seniority"),
    englishLevel: englishLevel("english_level"),
    experienceYears: integer("experience_years"),
    // Optional full structured resume (ExtractedResume: fact atoms + provenance)
    // for CV tailoring — see md/journal/migrations/cv-cover-letter.md (ADR-0011).
    // Nullable by design: only tailoring-enabled candidates carry it, and the
    // whole feature reverts by dropping this column (no rewrite of existing rows).
    structured: jsonb("structured").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("candidates_content_hash_key").on(t.contentHash)],
);

// Presence-only skill links (no is_required — a CV just lists what it has).
export const candidateNodes = pgTable(
  "candidate_nodes",
  {
    candidateId: uuid("candidate_id")
      .notNull()
      .references(() => candidates.id, { onDelete: "cascade" }),
    nodeId: uuid("node_id")
      .notNull()
      .references(() => nodes.id),
  },
  (t) => [
    primaryKey({ columns: [t.candidateId, t.nodeId] }),
    index("candidate_nodes_node_id_idx").on(t.nodeId),
  ],
);

export type Candidate = typeof candidates.$inferSelect;
export type NewCandidate = typeof candidates.$inferInsert;
export type CandidateNode = typeof candidateNodes.$inferSelect;
export type NewCandidateNode = typeof candidateNodes.$inferInsert;
