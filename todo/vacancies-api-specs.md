# TODO — Service + controller specs for `/vacancies`

**Target files:**
- `apps/etl/src/vacancies/vacancies.service.spec.ts` (new)
- `apps/etl/src/vacancies/vacancies.controller.spec.ts` (new)

**Current branch:** `feat/loader-pipeline`
**Last commit on this thread:** `0340ecf` (`feat(vacancies): expose silver feed via /vacancies api + web page`)
**Estimated time:** one focused session (~1–2 hours, no schema or contract changes)

---

## Why this exists

The vacancies API shipped in `0340ecf` with no test coverage beyond `app.module.spec.ts` (which only proves DI graph compiles). The service is the most consequential piece — joins five tables, applies verified-only filtering, batches a second query for skills — and the failure modes (wrong join, lost rows, leaked unverified nodes) are silent: the response stays a valid `ListVacanciesResponse` even when wrong.

The exact-equivalent test pattern already exists for `monitoring.service.spec.ts` and `monitoring.controller.spec.ts` (when present). Use those as the template — same DB-backed `Test.createTestingModule` style, same fixtures pattern.

This is F1 + F2 from [`md/journal/migrations/vacancies-api.md`](../md/journal/migrations/vacancies-api.md#followups). Land it before extending the API further.

---

## Read first

In order:

1. `apps/etl/src/monitoring/monitoring.service.spec.ts` — copy its scaffolding (fixtures helper, `beforeEach`/`afterEach` truncate + seed, DI bootstrap). Same shape applies here.
2. `apps/etl/src/vacancies/vacancies.service.ts` — what you're testing. Note the verified-only joins on `roleNode` / `domainNode` and the gated skills query.
3. `apps/etl/src/vacancies/vacancies.controller.ts` — query parsing branches.
4. `libs/database/src/schema/{vacancies,nodes,vacancy-nodes,companies,sources,rss-records}.ts` — fixture shape.
5. `apps/etl/src/vacancies/vacancies.contract.ts` — input/output shape contracts you're asserting against.

---

## What to cover

### Service spec (`vacancies.service.spec.ts`)

- **listing baseline.** Seed N vacancies all with VERIFIED roles. Assert `total === N`, `items.length === pageSize`, ordering = `loadedAt DESC`.
- **`q` ILIKE.** Two vacancies, titles `"Senior React Developer"` / `"Backend Engineer"`. `q="react"` → 1 hit, `q="ENGINEER"` → 1 hit (case-insensitive), `q="zzz"` → 0.
- **pagination.** 25 rows, `pageSize=10`, hit `page=1/2/3`. Assert `items.length` 10/10/5 and stable order.
- **default verified-only role filter.** Seed 3 vacancies: one with VERIFIED role, one with NEW role, one with `roleNodeId=null`. Default `list({})` → only the VERIFIED one. `total=1`.
- **`includeRoleless=true`.** Same seed → all 3 returned. `total=3`. The two non-verified rows have `role: null` in the DTO (not the original NEW node).
- **default verified-only skills.** Seed a vacancy with two skills: one VERIFIED, one NEW. Default `list({})` → response item's `skills.required` (or `.optional`) contains only the VERIFIED one.
- **`includeAllSkills=true`.** Same seed → both skills returned.
- **domain unverified.** Vacancy with NEW domain → response item has `domain: null` (no toggle for domain; always hidden when unverified).
- **company nullability.** Vacancy with `companyId=null` → response item has `company: null` (the LEFT JOIN already covers this; assert it explicitly).
- **locations flatten.** Seed `locations` as `[{city: "Kyiv", country: "Ukraine"}]` and `["Remote"]` (mixed jsonb). Both flatten to `string[]` in the DTO.
- **empty result.** `q="impossible-substring"` → `{ items: [], total: 0, page, pageSize }`.

### Controller spec (`vacancies.controller.spec.ts`)

- **default forwarding.** No params → service called with `{ page: 1, pageSize: 20, q: undefined, includeRoleless: undefined, includeAllSkills: undefined }`.
- **page parsing.** `page="0"`, `page="-1"`, `page="abc"` → `BadRequestException`. `page="3"` → forwarded as `3`.
- **pageSize parsing.** `pageSize="0"`, `pageSize="101"`, `pageSize="abc"` → 400. `pageSize="50"` → forwarded.
- **q trimming.** `q="  "` → forwarded as `undefined`. `q="  hello  "` → forwarded as `"hello"`.
- **boolean parsing.** Each of `"true"`, `"1"` → `true`. `"false"`, `"0"` → `false`. `"garbage"` → 400.

Use a service mock — `Test.createTestingModule` with `{ provide: VacanciesService, useValue: { list: jest.fn().mockResolvedValue(EMPTY_RESPONSE) } }`. The controller's only job is parsing.

---

## Fixture shape

For the service spec, you need a small `seedVacancy(opts)` helper. Sketch:

```ts
async function seedVacancy(db: DrizzleDB, opts: {
  title: string;
  roleStatus?: NodeStatus | null;  // null = no role
  domainStatus?: NodeStatus | null;
  skills?: Array<{ status: NodeStatus; isRequired: boolean }>;
  companyId?: string | null;
  loadedAt?: Date;
}) {
  // 1. ensure source + rss_record exist (one shared fixture for the suite is enough)
  // 2. optionally insert a role node + domain node with the right status
  // 3. insert vacancy row referencing them
  // 4. insert vacancy_nodes for each skill with its own node row
  return vacancyId;
}
```

Look at `apps/etl/scripts/fill-vacancies.ts` for the field minimum required by the schema (a fully-typed insert template is in there).

---

## How to measure (verification)

```bash
# 1. Run just the new specs.
cd apps/etl && npx jest src/vacancies

# 2. Then the broader suite to catch regressions.
pnpm --filter @metahunt/etl test

# 3. End-to-end smoke against the running ETL — the existing one-liner still
#    has to work after this change:
curl -s "http://localhost:4567/vacancies?pageSize=2" | jq '.items | length'  # → 2
curl -s "http://localhost:4567/vacancies?includeRoleless=garbage" -w "%{http_code}"  # → 400
```

---

## Definition of done

- Both spec files exist and pass `npx jest src/vacancies`.
- `pnpm --filter @metahunt/etl test` is green.
- No new lint warnings.
- Coverage for `vacancies.service.ts` and `vacancies.controller.ts` ≥ 90% statements (eyeball — no need to wire up nyc reports).
- `vacancies-api.md` tracker's F1+F2 bullets struck through (or the followups list trimmed).

---

## Things to NOT do

- Don't refactor the service while writing tests. If you find a bug, capture it as a failing test first, then fix in a separate commit.
- Don't mock Drizzle in the service spec — use a real DB exactly like `monitoring.service.spec.ts`. Mocking the query builder gives false confidence.
- Don't add filters that aren't shipped yet (`sourceId`, `seniority`, etc. are declared in the contract but not wired). Those are F4 in the tracker — separate session.
- Don't expand contract decisions (D1–D13) here. This task is verification of what shipped, not new design.

---

## Commit format

Match the existing convention:

```
test(vacancies): service + controller specs

- service spec: pagination, q ILIKE, verified-only role/skills toggles,
  domain hiding, locations flatten, empty result
- controller spec: param parsing edge cases (page, pageSize, q,
  includeRoleless, includeAllSkills)
```
