import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  unique,
  index,
} from 'drizzle-orm/pg-core';
import { users } from './users';
import { candidates } from './candidates';

// Ownership link between a user and a (shared, content-hashed) candidate CV.
// candidates stay anonymous and deduped — this link is what a login claims.
// MVP: one active CV per user (isActive); replace = new row + old isActive=false.
export const userCvs = pgTable(
  'user_cvs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    candidateId: uuid('candidate_id')
      .notNull()
      .references(() => candidates.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique('user_cvs_user_candidate_key').on(t.userId, t.candidateId),
    index('user_cvs_user_id_idx').on(t.userId),
  ],
);

export type UserCv = typeof userCvs.$inferSelect;
export type NewUserCv = typeof userCvs.$inferInsert;
