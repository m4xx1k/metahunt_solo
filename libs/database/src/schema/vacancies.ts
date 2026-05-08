import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  jsonb,
  integer,
  boolean,
  unique,
  index,
} from 'drizzle-orm/pg-core';
import { sources } from './sources';
import { rssRecords } from './rss-records';
import { companies } from './companies';
import { nodes } from './nodes';

// Match BAML enums in apps/etl/baml_src/extract-vacancy.baml
export const seniority = pgEnum('seniority', [
  'INTERN',
  'JUNIOR',
  'MIDDLE',
  'SENIOR',
  'LEAD',
  'PRINCIPAL',
  'C_LEVEL',
]);

export const workFormat = pgEnum('work_format', ['REMOTE', 'OFFICE', 'HYBRID']);

export const employmentType = pgEnum('employment_type', [
  'FULL_TIME',
  'PART_TIME',
  'CONTRACT',
  'FREELANCE',
  'INTERNSHIP',
]);

export const englishLevel = pgEnum('english_level', [
  'BEGINNER',
  'INTERMEDIATE',
  'UPPER_INTERMEDIATE',
  'ADVANCED',
  'NATIVE',
]);

export const currency = pgEnum('currency', ['USD', 'EUR', 'UAH']);

export const engagementType = pgEnum('engagement_type', [
  'PRODUCT',
  'OUTSOURCE',
  'OUTSTAFF',
  'STARTUP',
  'AGENCY',
]);

export const vacancies = pgTable(
  'vacancies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sourceId: uuid('source_id')
      .notNull()
      .references(() => sources.id),
    externalId: text('external_id').notNull(),
    lastRssRecordId: uuid('last_rss_record_id')
      .notNull()
      .references(() => rssRecords.id),

    title: text('title').notNull(),
    description: text('description'),

    companyId: uuid('company_id').references(() => companies.id),
    roleNodeId: uuid('role_node_id').references(() => nodes.id),
    domainNodeId: uuid('domain_node_id').references(() => nodes.id),

    seniority: seniority('seniority'),
    workFormat: workFormat('work_format'),
    employmentType: employmentType('employment_type'),
    englishLevel: englishLevel('english_level'),
    experienceYears: integer('experience_years'),

    salaryMin: integer('salary_min'),
    salaryMax: integer('salary_max'),
    currency: currency('currency'),

    engagementType: engagementType('engagement_type'),
    hasTestAssignment: boolean('has_test_assignment'),
    hasReservation: boolean('has_reservation'),

    locations: jsonb('locations'),

    loadedAt: timestamp('loaded_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique('vacancies_source_external_key').on(t.sourceId, t.externalId),
    index('vacancies_company_id_idx').on(t.companyId),
    index('vacancies_role_node_id_idx').on(t.roleNodeId),
    index('vacancies_loaded_at_idx').on(t.loadedAt.desc()),
  ],
);

export type Vacancy = typeof vacancies.$inferSelect;
export type NewVacancy = typeof vacancies.$inferInsert;
