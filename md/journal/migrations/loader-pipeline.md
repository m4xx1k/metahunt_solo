# loader-pipeline — silver vacancies from RSS records

> Status: spec / not started. Branch: `feat/loader-pipeline`.

## Goal

Build a per-vacancy pipeline workflow that loads a row in `vacancies` (silver) from each newly-extracted `rss_record`. The pipeline workflow is the unit of work for one vacancy after extraction. Today it has one stage (loader). Future stages (dedup, telegram) plug in by appending activities — no workflow rewrite needed.

## Scope

In:

- New schema: `companies`, `company_identifiers`, `nodes`, `node_aliases`, `vacancies`, `vacancy_nodes`.
- New module `apps/etl/src/loader/`: resolvers, loader service, activity, pipeline workflow.
- Per-source `external_id` extractor (Djinni, DOU) + parse-time population in `RssParseActivity`.
- `rss_records.external_id` becomes `NOT NULL` after a backfill migration.
- Wire `vacancyPipelineWorkflow` as `ABANDON` child from `rssIngestWorkflow` after each successful extraction.

Out (deferred to follow-on initiatives):

- Dedup workflow / `fingerprint_hash` / `vacancy_source` table / cross-source linking.
- Telegram notification (placeholder stage in pipeline noted, not implemented).
- `VacancyVersion` history (history lives in `rss_records`).
- Locations table (use `vacancy.locations jsonb` for now).
- ltree node hierarchy, `node_links`, `node_vector` embeddings.
- Moderation UI for `nodes WHERE status='NEW'`.

## Decisions (locked)

- **No `fingerprint_hash`**, no `vacancy_source` table, no `VacancyVersion`. Dedup is a separate initiative.
- **`vacancies.unique(source_id, external_id)`** is the identity key. `external_id` derived per-source via pure function at parse time.
- **Unified `nodes` table** for `ROLE` / `SKILL` / `DOMAIN`. `is_required` on `vacancy_nodes` defaults `true` (only meaningful for `SKILL`; harmless `true` for the others).
- **`role_node_id` and `domain_node_id` as direct FKs** on `vacancies` (semantically one each); skills go through `vacancy_nodes` (M2M).
- **Strict alias matching only** — no fuzzy / no semantic. Unknown nodes inserted with `status='NEW'` for later moderation.
- **Per-record child workflow** `vacancyPipelineWorkflow` started from `rssIngestWorkflow` with `parentClosePolicy: ABANDON` and deterministic `workflowId = vacancy-pipeline-{rssRecordId}`.
- **Locations** stored as `vacancy.locations jsonb` (`[{city, country}]`) — no normalized table yet.
- **No moderation UI** in this initiative; `nodes WHERE status='NEW'` accumulate for a later spec.

## Architecture

### Module layout

```
apps/etl/src/loader/
├── loader.module.ts
├── external-id/
│   ├── source-external-id.ts          # registry + extractor type
│   ├── source-external-id.spec.ts
│   └── extractors/
│       ├── djinni.ts
│       ├── djinni.spec.ts
│       ├── dou.ts
│       └── dou.spec.ts
├── services/
│   ├── company-resolver.service.ts
│   ├── company-resolver.service.spec.ts
│   ├── node-resolver.service.ts
│   ├── node-resolver.service.spec.ts
│   ├── vacancy-loader.service.ts
│   └── vacancy-loader.service.spec.ts
├── activities/
│   ├── load-vacancy.activity.ts
│   ├── load-vacancy.activity.spec.ts
│   └── index.ts
├── workflows/
│   ├── vacancy-pipeline.workflow.ts
│   └── index.ts
├── loader.controller.ts               # POST /loader/backfill?limit=N
└── loader.controller.spec.ts
```

### Schema (Drizzle, `libs/database/src/schema/`)

```ts
// companies.ts
export const companies = pgTable('companies', {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  slug: text().notNull().unique(),
  meta: jsonb(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// company-identifiers.ts
export const companyIdentifiers = pgTable('company_identifiers', {
  sourceId: uuid('source_id').notNull().references(() => sources.id),
  sourceCompanyName: text('source_company_name').notNull(),
  companyId: uuid('company_id').notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
}, (t) => [
  primaryKey({ columns: [t.sourceId, t.sourceCompanyName] }),
  index('company_identifiers_company_id_idx').on(t.companyId),
]);

// nodes.ts
export const nodeType   = pgEnum('node_type',   ['ROLE', 'SKILL', 'DOMAIN']);
export const nodeStatus = pgEnum('node_status', ['NEW',  'VERIFIED', 'HIDDEN']);

export const nodes = pgTable('nodes', {
  id: uuid().primaryKey().defaultRandom(),
  type: nodeType().notNull(),
  canonicalName: text('canonical_name').notNull(),
  status: nodeStatus().notNull().default('NEW'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique('nodes_type_canonical_name_key').on(t.type, t.canonicalName),
  index('nodes_status_type_idx').on(t.status, t.type),
]);

// node-aliases.ts
export const nodeAliases = pgTable('node_aliases', {
  name: text().primaryKey(),    // already lowercased + trimmed
  nodeId: uuid('node_id').notNull()
    .references(() => nodes.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('node_aliases_node_id_idx').on(t.nodeId)]);

// vacancies.ts (enums elided for brevity — match BAML enums)
export const vacancies = pgTable('vacancies', {
  id: uuid().primaryKey().defaultRandom(),
  sourceId: uuid('source_id').notNull().references(() => sources.id),
  externalId: text('external_id').notNull(),
  lastRssRecordId: uuid('last_rss_record_id').notNull()
    .references(() => rssRecords.id),

  title: text().notNull(),
  description: text(),

  companyId:    uuid('company_id').references(() => companies.id),
  roleNodeId:   uuid('role_node_id').references(() => nodes.id),
  domainNodeId: uuid('domain_node_id').references(() => nodes.id),

  seniority: seniority(),
  workFormat: workFormat('work_format'),
  employmentType: employmentType('employment_type'),
  englishLevel: englishLevel('english_level'),
  experienceYears: integer('experience_years'),

  salaryMin: integer('salary_min'),
  salaryMax: integer('salary_max'),
  currency: currency(),

  engagementType: engagementType('engagement_type'),
  hasTestAssignment: boolean('has_test_assignment'),
  hasReservation:    boolean('has_reservation'),

  locations: jsonb(),    // [{city, country}]

  loadedAt:  timestamp('loaded_at',  { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique('vacancies_source_external_key').on(t.sourceId, t.externalId),
  index('vacancies_company_id_idx').on(t.companyId),
  index('vacancies_role_node_id_idx').on(t.roleNodeId),
  index('vacancies_loaded_at_idx').on(t.loadedAt.desc()),
]);

// vacancy-nodes.ts
export const vacancyNodes = pgTable('vacancy_nodes', {
  vacancyId: uuid('vacancy_id').notNull()
    .references(() => vacancies.id, { onDelete: 'cascade' }),
  nodeId: uuid('node_id').notNull().references(() => nodes.id),
  isRequired: boolean('is_required').notNull().default(true),
}, (t) => [
  primaryKey({ columns: [t.vacancyId, t.nodeId] }),
  index('vacancy_nodes_node_id_idx').on(t.nodeId),
]);
```

All vacancy fields except `id`, `sourceId`, `externalId`, `lastRssRecordId`, `title`, `loadedAt`, `updatedAt` are nullable — RSS payloads are sparse and BAML returns `null` liberally.

### Per-source `external_id` extractors

```ts
// loader/external-id/source-external-id.ts
export type RssIdInputs = { guid?: string; link?: string };
export type ExternalIdExtractor = (item: RssIdInputs) => string;

import { djinniExtractor } from './extractors/djinni';
import { douExtractor }    from './extractors/dou';

const EXTRACTORS: Record<string, ExternalIdExtractor> = {
  djinni: djinniExtractor,
  dou:    douExtractor,
};

export function extractExternalId(sourceCode: string, item: RssIdInputs): string {
  const fn = EXTRACTORS[sourceCode];
  if (!fn) throw new Error(`No external_id extractor for source '${sourceCode}'`);
  const id = fn(item);
  if (!id) {
    throw new Error(
      `Empty external_id derived for source '${sourceCode}' from ${JSON.stringify(item)}`,
    );
  }
  return id;
}

// extractors/djinni.ts
// e.g. https://djinni.co/jobs/789122-some-title/  →  "789122"
export const djinniExtractor: ExternalIdExtractor = (item) => {
  const url = item.guid ?? item.link ?? '';
  const m = url.match(/\/jobs\/(\d+)/);
  if (!m) throw new Error(`djinni: cannot derive external_id from ${url}`);
  return m[1];
};

// extractors/dou.ts
// e.g. https://jobs.dou.ua/companies/acme/vacancies/356789/  →  "356789"
export const douExtractor: ExternalIdExtractor = (item) => {
  const url = item.guid ?? item.link ?? '';
  const m = url.match(/\/vacancies\/(\d+)/);
  if (!m) throw new Error(`dou: cannot derive external_id from ${url}`);
  return m[1];
};
```

### `rss_records.external_id` migration

1. Backfill script: for every existing row, look up `source.code`, run extractor on `(guid, link)`. On extractor throw → log + leave that row's `external_id` as NULL (these rows will be unloaded; they remain as bronze artifacts).
2. Migration: `ALTER TABLE rss_records ALTER COLUMN external_id SET NOT NULL`. Run after backfill. If any unparseable rows remain, either delete them (operator decision) or fix the extractor before running this step.

### `RssParseActivity` change

- Inject `sources.code` once per activity invocation (already has `sourceId` in scope).
- For each parsed RSS item, compute `external_id` via `extractExternalId(sourceCode, { guid, link })` **before** the dedup hash check.
- If extractor throws → `logger.warn` + skip the item entirely (don't insert into `rss_records`). Keeps unparseable items out of bronze.
- Persist `external_id` on every new `rss_records` row.

### Loader algorithm

`VacancyLoaderService.loadFromRecord(rssRecordId)` runs in a single DB transaction:

```
record    = SELECT * FROM rss_records WHERE id = rssRecordId
extracted = record.extractedData as ExtractedVacancy

companyId = extracted.companyName
  ? CompanyResolver.resolve(record.sourceId, extracted.companyName)
  : null

roleNodeId   = extracted.role   ? NodeResolver.resolve('ROLE',   extracted.role)   : null
domainNodeId = extracted.domain ? NodeResolver.resolve('DOMAIN', extracted.domain) : null

skillLinks = [
  ...(extracted.skills?.required ?? []).map(s => ({ nodeId: NodeResolver.resolve('SKILL', s), isRequired: true  })),
  ...(extracted.skills?.optional ?? []).map(s => ({ nodeId: NodeResolver.resolve('SKILL', s), isRequired: false })),
]

vacancyId = INSERT INTO vacancies (source_id, external_id, last_rss_record_id, title, description,
                                   company_id, role_node_id, domain_node_id,
                                   seniority, work_format, employment_type, english_level,
                                   experience_years, salary_min, salary_max, currency,
                                   engagement_type, has_test_assignment, has_reservation, locations)
            VALUES (...)
            ON CONFLICT (source_id, external_id) DO UPDATE SET
              last_rss_record_id = EXCLUDED.last_rss_record_id,
              title              = EXCLUDED.title,
              description        = EXCLUDED.description,
              company_id         = EXCLUDED.company_id,
              role_node_id       = EXCLUDED.role_node_id,
              domain_node_id     = EXCLUDED.domain_node_id,
              ...                                                    -- all extracted fields
              updated_at         = now()
            RETURNING id

DELETE FROM vacancy_nodes WHERE vacancy_id = vacancyId
INSERT INTO vacancy_nodes (vacancy_id, node_id, is_required)
  VALUES ...skillLinks...

return vacancyId
```

Idempotent: re-running on the same `rssRecordId` converges. Re-running on a fresher `rssRecordId` for the same `(source_id, external_id)` overwrites with the latest content (latest-wins). Vacancy history is retained in `rss_records`, not in `vacancies`.

### Resolver behaviors

**`CompanyResolver.resolve(sourceId, sourceCompanyName)`:**

1. SELECT `company_id` FROM `company_identifiers` WHERE `(source_id, source_company_name) = (?, ?)`. Hit → return.
2. Miss: compute `slug = slugify(sourceCompanyName)`. SELECT `id` FROM `companies` WHERE `slug = ?`.
   - Hit → INSERT `company_identifier` pointing at it (race-safe: `ON CONFLICT DO NOTHING`).
   - Miss → INSERT `companies`, then INSERT `company_identifier`. Both with `ON CONFLICT DO NOTHING` + re-SELECT to handle concurrent loaders.

**`NodeResolver.resolve(type, name)`:**

1. `normalized = lower(trim(name))`.
2. SELECT `node_id` FROM `node_aliases` WHERE `name = normalized`. Hit → return.
3. Miss:
   - INSERT INTO `nodes` `(type, canonical_name, status='NEW')` ON CONFLICT `(type, canonical_name)` DO NOTHING RETURNING `id`. If no row returned, SELECT existing.
   - INSERT INTO `node_aliases` `(name=normalized, node_id)` ON CONFLICT DO NOTHING.
   - Return `node_id`.

Both resolvers are race-safe under concurrent pipeline workflows. The `ON CONFLICT DO NOTHING` + re-SELECT pattern avoids unique-violation exceptions when two loaders insert the same alias / company simultaneously.

### Pipeline workflow

```ts
// loader/workflows/vacancy-pipeline.workflow.ts
import { proxyActivities } from '@temporalio/workflow';
import type { LoadVacancyActivity } from '../activities/load-vacancy.activity';

const { loadVacancy } = proxyActivities<typeof LoadVacancyActivity.prototype>({
  startToCloseTimeout: '1m',
  retry: { maximumAttempts: 3, initialInterval: '5s', backoffCoefficient: 2 },
});

export async function vacancyPipelineWorkflow(rssRecordId: string): Promise<void> {
  await loadVacancy(rssRecordId);
  // future: const vacancyId = await loadVacancy(rssRecordId);
  //         await dedupVacancy(vacancyId);
  //         await notifyVacancy(vacancyId);
}
```

### Trigger from `rssIngestWorkflow`

```ts
// rss/workflows/rss-ingest.workflow.ts (modified)
const results = await Promise.allSettled(
  newItemIds.map((id) => extractAndInsert(id)),
);

const successfulIds = newItemIds.filter((_, i) => results[i].status === 'fulfilled');

await Promise.all(
  successfulIds.map((rssRecordId) =>
    startChild('vacancyPipelineWorkflow', {
      args: [rssRecordId],
      workflowId: `vacancy-pipeline-${rssRecordId}`,
      parentClosePolicy: ParentClosePolicy.ABANDON,
    }),
  ),
);
```

Deterministic `workflowId` makes `rssIngestWorkflow` re-runs safe — Temporal rejects duplicate IDs by default, so a re-fired ingest doesn't double-load. Use `WorkflowIdReusePolicy.ALLOW_DUPLICATE_FAILED_ONLY` if a failed pipeline should be re-runnable on the next ingest pass.

### Temporal worker registration

In `apps/etl/src/temporal/temporal.module.ts`:

- Generalize `workflowsPath` per the existing TODO comment. Build a small barrel `apps/etl/src/workflows/index.ts` that re-exports from `rss/workflows` and `loader/workflows`. Point `workflowsPath` at that barrel directory.
- Append loader activities to the worker: `activityClasses: [...RSS_ACTIVITIES, ...LOADER_ACTIVITIES]`.

### HTTP backfill (parallels existing `extract-missing` pattern)

`POST /loader/backfill?limit=N`:

```sql
SELECT r.id FROM rss_records r
WHERE r.extracted_at IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM vacancies v
    WHERE v.source_id = r.source_id AND v.external_id = r.external_id
  )
ORDER BY r.created_at ASC
LIMIT N
```

Run `loadFromRecord` in-process per id. Return `{ attempted, succeeded, failed }`. Mirrors `RssBackfillService.extractMissing` (default 100, max 500). Useful when a prior `vacancyPipelineWorkflow` failed and the workflowId reuse policy blocks a fresh attempt.

## Task breakdown

Tests-first per project convention (TDD). Each task is its own commit on `feat/loader-pipeline`; PR opens after T18.

| # | Task | Test gate |
|---|---|---|
| T1 | Drizzle schema files + barrel export (companies, company_identifiers, nodes, node_aliases, vacancies, vacancy_nodes) | TS compiles; Drizzle introspect clean |
| T2 | Generate migration; verify SQL diff | Migration runs against fresh DB without errors |
| T3 | `extractors/djinni.ts` + spec (real fixture URLs from existing `__fixtures__/`) | Spec passes for valid + invalid URLs |
| T4 | `extractors/dou.ts` + spec | Same |
| T5 | `source-external-id.ts` registry + spec | Spec passes for known + unknown source codes |
| T6 | Modify `RssParseActivity` to call extractor per item; skip-on-throw with `logger.warn`; spec extension | Existing spec extended; new test verifies `external_id` populated on inserted rows |
| T7 | Backfill script (`libs/database/scripts/backfill-rss-external-id.ts`): populate `rss_records.external_id` for existing rows; report unparseable | Run against local DB; manual verify counts |
| T8 | Migration: `ALTER rss_records.external_id SET NOT NULL` | Migration runs after T7 backfill |
| T9 | `NodeResolver` service + spec (race-safe alias resolution) | Spec covers exact hit, miss-create, concurrent-insert race |
| T10 | `CompanyResolver` service + spec | Spec covers identifier-hit, slug-hit-add-identifier, full-create |
| T11 | `VacancyLoaderService` + spec (transactional upsert + `vacancy_nodes` rewrite) | Spec covers create, update, skill set replacement, null-companyName |
| T12 | `LoadVacancyActivity` + spec (Nest activity decorator wiring) | Activity resolves loader; spec covers the happy path |
| T13 | `vacancyPipelineWorkflow` (loader-only stage today) | Workflow bundles via webpack; smoke test via local Temporal |
| T14 | `LoaderModule` + register in `AppModule`; activities exported | `AppModule` smoke spec extended; all DI resolves |
| T15 | Generalize `workflowsPath` to multi-feature barrel; update worker config | Worker boots; both workflows visible in Temporal UI |
| T16 | Modify `rssIngestWorkflow` to fan out `vacancyPipelineWorkflow` per successful extraction (`ABANDON` child) | Existing `rss-ingest` spec extended |
| T17 | `LoaderController` + backfill endpoint + spec | E2E: stuck record loads via `POST /loader/backfill`; counts correct |
| T18 | E2E smoke: `curl /rss` → wait → verify `vacancies` populated, `nodes WHERE status='NEW'` accumulating | Manual; document in `md/runbook/` |

## Future stages (out of scope)

Both append-only on `vacancyPipelineWorkflow` — neither requires changes to the loader.

- **`dedupVacancyWorkflow(vacancyId)`** — fingerprint or fuzzy matching across `(source, external_id)` pairs to link cross-source duplicates. Will introduce `vacancy_source` table and soft-delete merged duplicates. Fingerprint shape candidate: `sha256(company_id || ':' || normalized_title || ':' || primary_country)`.
- **`notifyVacancyWorkflow(vacancyId)`** — Telegram fan-out. Per-channel/per-user filter rules read from a future `notification_subscriptions` table.
