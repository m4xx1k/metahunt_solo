import { pgTable, pgEnum, uuid, text, boolean, timestamp } from "drizzle-orm/pg-core";

import { nodes } from "./nodes";

// Structural skill metadata for gating reverse-ATS "learn next" recommendations.
// See md/journal/migrations/skill-metadata-recommendations.md and ADR-0010.
// Fully additive: where a skill has no row (or stack=null) the recommendation
// gates degrade to today's behaviour — never worse. Populated by the BAML
// ClassifySkills backfill over VERIFIED skills (classify-skills CLI).
//
// `category` is a pgEnum (stable vocab, like node_type/node_status). `stack` is
// plain text validated in app against TECH_STACKS — NOT an enum, so the stack
// vocab can grow later with no DB migration.
export const skillCategory = pgEnum("skill_category", [
  "LANGUAGE",
  "FRAMEWORK",
  "LIBRARY",
  "DATASTORE",
  "CLOUD",
  "TOOL",
  "PRACTICE",
  "SOFT",
]);

export type SkillCategoryValue = (typeof skillCategory.enumValues)[number];

export const nodeTechMeta = pgTable("node_tech_meta", {
  nodeId: uuid("node_id")
    .primaryKey()
    .references(() => nodes.id, { onDelete: "cascade" }),
  category: skillCategory("category").notNull(),
  stack: text("stack"), // null = stack-neutral; validated in app vs TECH_STACKS
  isCore: boolean("is_core").notNull().default(false),
  generic: boolean("generic").notNull().default(false),
  classifiedAt: timestamp("classified_at", { withTimezone: true }).notNull().defaultNow(),
});

export type NodeTechMeta = typeof nodeTechMeta.$inferSelect;
export type NewNodeTechMeta = typeof nodeTechMeta.$inferInsert;
