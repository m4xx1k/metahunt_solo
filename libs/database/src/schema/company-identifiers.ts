import { pgTable, uuid, text, primaryKey, index } from 'drizzle-orm/pg-core';
import { sources } from './sources';
import { companies } from './companies';

export const companyIdentifiers = pgTable(
  'company_identifiers',
  {
    sourceId: uuid('source_id')
      .notNull()
      .references(() => sources.id),
    sourceCompanyName: text('source_company_name').notNull(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ columns: [t.sourceId, t.sourceCompanyName] }),
    index('company_identifiers_company_id_idx').on(t.companyId),
  ],
);

export type CompanyIdentifier = typeof companyIdentifiers.$inferSelect;
export type NewCompanyIdentifier = typeof companyIdentifiers.$inferInsert;
