# Role + seniority stabilization — implementation plan

**Status:** ready for implementation; production mutation requires one explicit
go/no-go after the dry-run package is complete.

**Research input:**
[p1-role-contract-review.md](./p1-role-contract-review.md).

**Operational source of truth:** this file. If the research document and this
plan differ, this plan wins unless a later ADR explicitly replaces it.

## Outcome

After this work MetaHunt keeps the current small persisted contract:

```text
raw title + one role + one nullable seniority
```

No `responsibility_flags`, `organizational_scope`, second management ladder, or
other extracted axes are added. The contract becomes stable because:

- deterministic code owns source-title cleanup, explicit seniority, QA subtype,
  Mobile subtype, and unambiguous Lead discipline;
- the LLM handles only genuinely semantic role decisions;
- parent/child roles are never competing model answers;
- vacancy, CV, Requirements v2, browse, ranking, and dedup share one policy;
- dedup cannot be vetoed solely by inconsistent extracted role/seniority;
- migration is targeted, audited, reversible, and validated against production
  data before apply.

The practical end state is that a new title convention can be handled by adding
a fixture and one normalizer rule, without redesigning the schema or
re-extracting the whole corpus.

## Decisions locked by this plan

These defaults are selected from production evidence and do not need another
owner decision unless the data changes materially during implementation.

### Persisted seniority

Keep the existing enum:

```text
INTERN | JUNIOR | MIDDLE | SENIOR | LEAD | PRINCIPAL | C_LEVEL | null
```

Values above Senior are categories, not adjacent promotions:

| Evidence in normalized title                                          | Stored value |
| --------------------------------------------------------------------- | ------------ |
| Intern / Internship                                                   | `INTERN`     |
| Junior / Jr                                                           | `JUNIOR`     |
| Middle / Mid-level                                                    | `MIDDLE`     |
| Senior / Sr                                                           | `SENIOR`     |
| Lead / Team Lead / Tech Lead / Technical Lead                         | `LEAD`       |
| Staff / Principal / Distinguished / Fellow                            | `PRINCIPAL`  |
| CTO / CIO / CISO / Chief Technology/Data/Information/Security Officer | `C_LEVEL`    |
| Head / Director / VP without a real C-suite title                     | `LEAD`       |
| Architect without another level token                                 | `null`       |

Rules:

1. Deterministic code, not the LLM, owns these values.
2. A genuine alternative/range uses the lower accepted level:
   `Senior / Principal Engineer` -> `SENIOR`.
3. A compound executive position is not treated as a range:
   `CTO / Tech Lead` -> `C_LEVEL`.
4. Responsibilities, ownership, architecture, mentoring, hiring, and strategy
   cannot manufacture an upper-tail value.
5. Numeric minimum experience is a fallback only for a plain IC title with no
   upper-tail token:

   ```text
   0-1 years -> JUNIOR
   2-3 years -> MIDDLE
   4+ years  -> SENIOR
   ```

   `INTERN` still requires an explicit internship signal. Architect, Lead,
   Staff, Principal, Head, Director, VP, and C-suite titles never use the years
   fallback.

The 4-year Senior boundary is data-driven: among plain explicitly levelled
production vacancies, the experience medians are Junior=1, Middle=3, Senior=5;
among unlevelled titles with 4 required years, current extraction is Senior on
298 rows versus Middle on 192.

### Lead roles

`Team Lead`, `Tech Lead`, and `QA Team Lead` stop being valid writer outputs when
a discipline can be recovered. `LEAD` carries the advertised category; `role`
carries the work.

| Title                          | Role                                                            | Seniority |
| ------------------------------ | --------------------------------------------------------------- | --------- |
| Backend Tech Lead              | `Backend Engineer`                                              | `LEAD`    |
| QA Manual Team Lead            | `Manual QA Engineer`                                            | `LEAD`    |
| Android Team Lead              | `Android Engineer`                                              | `LEAD`    |
| ML Technical Lead              | `Machine Learning Engineer`                                     | `LEAD`    |
| Head / Director of Engineering | `Engineering Manager`                                           | `LEAD`    |
| CTO                            | `CTO (Chief Technology Officer)` or the approved executive role | `C_LEVEL` |

People-management duties do not change a Lead title to `Engineering Manager`.
That role requires an explicit Manager, Head, Director, or VP title. Mixed
player-coach positions remain browseable by their engineering discipline.

For a bare `Team Lead` or `Tech Lead`, the body is used by a closed-vocabulary
role-only classifier. If it cannot recover a discipline with acceptable
confidence, use `Software Engineer / LEAD` and emit an audit warning; never mint
a new `<something> Lead` role.

Legacy generic Lead nodes are hidden only after their vacancy count reaches
zero. They are not deleted in the first release, making rollback cheap.

### QA roles

Keep exactly three canonical roles:

```text
QA Engineer
Manual QA Engineer
Automation QA Engineer
```

Title-authoritative rules:

| Core-title evidence                       | Role                     |
| ----------------------------------------- | ------------------------ |
| Manual                                    | `Manual QA Engineer`     |
| Automation / AQA / SDET / Test Automation | `Automation QA Engineer` |
| Both Manual and Automation                | `QA Engineer`            |
| QA without subtype                        | `QA Engineer`            |

The body may extract skills and requirements, but it does not promote a generic
QA title into Manual or Automation. This intentionally trades a little
specificity for repeatability across sources.

`SDET`, `QA Engineer Auto`, `Test Automation Engineer`, and spelling variants
are aliases, not additional roles.

### Mobile roles

Keep exactly four canonical roles:

```text
Mobile Developer
iOS Engineer
Android Engineer
Cross-platform Mobile Engineer
```

Title-authoritative rules:

| Core-title evidence                                                         | Role                             |
| --------------------------------------------------------------------------- | -------------------------------- |
| iOS / Swift / Objective-C only                                              | `iOS Engineer`                   |
| Android / AAOS only                                                         | `Android Engineer`               |
| React Native / Flutter / Xamarin / Ionic / Capacitor / Kotlin Multiplatform | `Cross-platform Mobile Engineer` |
| Generic Mobile, or explicit iOS + Android without a cross-platform stack    | `Mobile Developer`               |

The body does not choose a narrower platform when the title is generic.

### Architect roles

Keep two architecture occupations:

```text
Software Architect
Solutions Architect
```

Map discipline-specific Architect titles to the discipline already used by the
product:

| Title family                                                         | Role                                                                     |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Solution Architect                                                   | `Solutions Architect`                                                    |
| Software / System / Technical Architect with architecture as the job | `Software Architect`                                                     |
| Data / DWH Architect                                                 | `Data Engineer`                                                          |
| Cloud / DevOps Architect                                             | `DevOps Engineer`                                                        |
| Security Architect                                                   | `Security Engineer`                                                      |
| AI / ML Architect                                                    | `AI Engineer` or `Machine Learning Engineer` from explicit title context |
| Hardware / RF Architect                                              | `Hardware Engineer` or the explicit verified specialist                  |
| Backend / Frontend Architect primarily delivering code               | underlying Backend / Frontend role                                       |

Do not reintroduce a generic `Architect` or a separate `Data Architect` in this
iteration. The existing role-v2 decision already merged Data Architect into
Data Engineer, and 29 of the 35 current Data Architect title rows are already
classified as Data Engineer. Architecture never implies seniority.

### Compatibility is consumer-specific, not another stored axis

Use one small reviewed map in code:

```text
QA Engineer -> {QA Engineer, Manual QA Engineer, Automation QA Engineer}
Mobile Developer -> {Mobile Developer, iOS Engineer, Android Engineer,
                     Cross-platform Mobile Engineer}
Hardware Engineer -> {Hardware Engineer, RF / Microwave Engineer}
Data Engineer -> {Data Engineer, any retained data specialist aliases}
```

Semantics:

- browse parent tracks include every listed child;
- dedup treats parent<->child as compatible, but Manual QA is not compatible
  with Automation QA and iOS is not compatible with Android/Cross-platform;
- recommendation uses an explicit map, never enum or array adjacency;
- no compatibility relation is persisted on each vacancy.

## Production baseline — read-only, 2026-08-22

All figures below came from production PostgreSQL through Railway using
`BEGIN READ ONLY`, a local statement timeout, and no writes.

### Corpus and upper tail

| Metric                                                             |         Value |
| ------------------------------------------------------------------ | ------------: |
| Vacancies                                                          |        16,604 |
| Upper-tail title rows                                              | 1,859 (11.2%) |
| Stored `LEAD`                                                      |  1,232 (7.4%) |
| Stored `PRINCIPAL`                                                 |    307 (1.8%) |
| Stored `C_LEVEL`                                                   |    106 (0.6%) |
| Architect titles stored as Principal without any upper-level token |           168 |

### QA

Current supply:

| Role                   | Vacancies | Positions | Track refs | Subscription refs |
| ---------------------- | --------: | --------: | ---------: | ----------------: |
| QA Engineer            |     1,047 |       883 |          1 |                 2 |
| Manual QA Engineer     |       823 |       669 |          2 |                 3 |
| Automation QA Engineer |       387 |       312 |          2 |                 2 |
| QA Team Lead           |        62 |        52 |          0 |                 0 |

Applying the locked title rules projects the 2,319 rows to:

| Target role            |  Rows |
| ---------------------- | ----: |
| QA Engineer            | 1,104 |
| Manual QA Engineer     |   604 |
| Automation QA Engineer |   611 |

746 QA rows would change role. This is why QA must be a targeted migration with
track/subscription checks, not a blind taxonomy merge.

### Mobile

Current supply:

| Role                           | Vacancies | Positions | Track refs |
| ------------------------------ | --------: | --------: | ---------: |
| Mobile Developer               |       144 |       124 |          1 |
| Cross-platform Mobile Engineer |       151 |       136 |          1 |
| Android Engineer               |       114 |        97 |          1 |
| iOS Engineer                   |       107 |        92 |          1 |

Applying the locked title rules projects the 516 rows to:

| Target role                    | Rows |
| ------------------------------ | ---: |
| Mobile Developer               |   76 |
| Cross-platform Mobile Engineer |  202 |
| Android Engineer               |  130 |
| iOS Engineer                   |  108 |

134 Mobile rows would change role.

### Generic Lead nodes

| Role         | Vacancies | Position groups | Published in last 90d | Track refs | Subscription refs |
| ------------ | --------: | --------------: | --------------------: | ---------: | ----------------: |
| Team Lead    |       163 |             137 |                   141 |          0 |                 0 |
| Tech Lead    |       117 |             106 |                   117 |          0 |                 0 |
| QA Team Lead |        62 |              53 |                    61 |          0 |                 0 |

Of these 342 rows, 242 expose a discipline directly in the title and can be
mapped deterministically. The remaining 100 need the closed role-only pass.

### Candidate/CV impact

Production has 31 user candidates and 5 samples. Candidate role is currently a
free string and still contains old `Backend Developer`, `Frontend Developer`,
and `Full Stack Developer` forms. One user candidate is stored as `LEAD` from
years alone. Candidate role/seniority are context fields and are not currently
scored, so this can be migrated after vacancy correctness without changing
ranking during the cutover.

### Existing user-facing references

There are 32 active subscriptions. Generic Lead roles have zero track and
subscription references. QA roles and Solutions Architect do have references,
so those nodes are retained and repointed rather than deleted. Every migration
dry-run must resolve `subscriptions.params` UUIDs explicitly because JSONB has
no foreign key.

## When the owner is needed

The default is autonomy. Do not interrupt the owner for implementation choices
already fixed above.

### Owner not needed

The agent may do all of the following without another decision:

- read production data through Railway or `scripts/prod-db-url.sh`;
- add/update docs, fixtures, unit tests, integration tests, and eval tooling;
- implement title normalization, deterministic seniority, role policy, and
  compatibility maps;
- modify prompts and generated BAML client code;
- fix local-only tooling, including the stale `db-restore.sh` container default;
- run local migrations against a Docker database or disposable test database;
- run production migration commands in dry-run/read-only mode;
- prepare the exact production command sequence, audit report, expected row
  counts, rollback payload, and estimated model/embedding cost;
- commit implementation work on the feature branch when requested as part of
  the implementation session.

### Owner needed exactly once for environment setup

Docker is currently unavailable inside this WSL distro because Docker Desktop
WSL integration is disabled. When DB integration tests are reached, the owner
must enable integration for this distro. No product decision is involved. Unit
work can proceed before this.

### Owner needed exactly once for production apply

Before any production write, present one go/no-go package containing:

- git commit and deployed code identity;
- dry-run counts by old/new role and seniority;
- every active subscription change;
- position/posting/group conservation report;
- unresolved/refused rows;
- live-eval accuracy/stability results and provider cost;
- embedding count/cost estimate;
- backup path/checksum and tested rollback command;
- maintenance-window duration.

One `go` authorizes the complete bounded sequence: backup, pause schedules,
deploy compatible writer, apply migration, re-embed/re-dedup the approved scope,
verify, and resume. Do not ask for approval between those steps unless an
automatic stop condition fires.

### Automatic stop conditions requiring the owner

Stop and report instead of improvising if any of these occurs:

- the dry-run has any refusal or cannot map more than 2% of affected rows;
- an active subscription would become empty or broaden unexpectedly;
- a verified track loses all effective role nodes;
- vacancy/posting/position/group conservation differs from the approved dry-run;
- dedup precision fixtures regress or a gold override merges a labelled
  negative pair;
- live role accuracy is below 95% or cross-source pair consistency below 100%;
- estimated provider cost exceeds the approved package by more than 20%;
- backup verification fails;
- production is not running the approved commit;
- any migration invariant fails after apply.

## Implementation phases

### Phase 0 — make the test environment trustworthy

Tasks:

1. Fix `scripts/db-restore.sh` default container from the retired
   `metahunt-railway-db` to Compose's `metahunt-db` and cover the default with a
   shell-level smoke check.
2. Enable Docker Desktop WSL integration when DB tests are reached.
3. Start infra with `pnpm docker:infra` and verify PostgreSQL health on 54323.
4. Run unit/eval tests before restoring any snapshot.
5. For snapshot integration, create a fresh production dump, verify gzip, and
   restore only into the local Docker database. Never point test commands at
   production.

Acceptance:

- local `metahunt-db` is healthy;
- migrations apply from a clean/restored snapshot;
- local row counts match the snapshot manifest;
- no production credential is written to disk or logs.

### Phase 1 — one shared classification policy

Create a code-owned module, suggested location:

```text
apps/etl/src/02-enrich/classification/
  title-normalizer.ts
  advertised-seniority.ts
  deterministic-role.ts
  role-compatibility.ts
  role-policy.spec.ts
```

Responsibilities:

1. `normalizeSourceTitle(source, rawTitle)` removes source presentation such as
   the DOU company/location suffix but preserves the raw stored title.
2. `advertisedSeniority(coreTitle, experienceYears)` implements the locked
   rules and returns value + evidence + confidence.
3. `deterministicRole(coreTitle)` locks QA/Mobile/unambiguous Architect/Lead
   mappings or returns `unresolved` with a closed allowed-role subset.
4. `roleCompatibility(left, right, consumer)` owns browse/dedup compatibility.
5. Every decision returns an audit reason, not only the final enum/string.

Tests must include Ukrainian/English punctuation, slashes, en/em dashes,
abbreviations, HTML entities, DOU wrappers, and reordered source titles.

Acceptance:

- the same core title normalizes identically across DOU and Djinni;
- all explicit seniority and QA/Mobile fixtures are deterministic;
- parent/child compatibility is symmetric and sibling incompatibility is
  explicit;
- no network/model call is required.

### Phase 2 — align every extractor and writer

Tasks:

1. Production vacancy writer runs deterministic policy before/after the LLM:
   locked fields cannot be overridden by model output.
2. For unresolved roles, send the model a small closed candidate set instead of
   the entire mutable VERIFIED taxonomy where possible.
3. Remove generic Lead roles from new writer output.
4. Update production BAML descriptions and examples to match the code policy.
5. Replace Requirements v2's private seniority parser with the shared module.
6. Update candidate extraction rules: Architect does not imply Principal,
   7+ years does not imply Lead, old Developer names normalize to Engineer.
7. Regenerate the BAML client and pass `pnpm baml:identity:check`.
8. Store classification evidence in extraction audit metadata or structured
   logs; do not add user-facing vacancy columns.

Acceptance:

- vacancy, candidate, and Requirements v2 return the same result for shared
  fixtures;
- three repeated live-model runs cannot change locked fields;
- zero new `Team Lead`, `Tech Lead`, or `QA Team Lead` role writes;
- provider-free PR tests cover every rule.

### Phase 3 — make dedup independent of classifier luck

Tasks:

1. Add a cleaned-description fingerprint independent of the raw source title.
2. Keep the existing exact `Title + Description` path for same-source identity.
3. Add a cross-source exact-body path requiring compatible normalized core
   titles, date window, and no known-company conflict.
4. Evaluate an identity embedding built from normalized raw title + cleaned
   description, excluding extracted role, seniority, format, and skills.
5. Retain structural gates on the ordinary ANN path, but use role compatibility
   instead of exact parent/child equality.
6. Add a stricter gold override for role/seniority disagreement only when raw
   identity evidence and independent company/title corroboration pass calibrated
   thresholds.
7. Persist the disagreement in `DedupReason` for audit and canonical-field
   repair.

Do not choose new similarity thresholds by intuition. Calibrate against:

- known cross-source duplicates;
- same-company boilerplate negatives;
- same title/different project negatives;
- the 11 reviewed upper-tail pairs;
- QA parent/child and Mobile parent/child cases.

Acceptance:

- cross-source pair consistency is 100% on labelled positives;
- zero labelled negatives merge;
- non-gold ANN precision gates do not weaken;
- exact/body-split health queries return zero eligible split groups;
- embedding change has a measured cost and bounded backfill plan.

### Phase 4 — build the targeted migration CLI

Add a dedicated dry-run-by-default command rather than hiding this inside normal
extraction. Suggested interface:

```text
pnpm role-contract:migrate -- --plan <json>
pnpm role-contract:migrate -- --plan <json> --apply --yes-prod
pnpm role-contract:migrate -- --run-id <id> --rollback --yes-prod
```

The plan contains exact row IDs and expected old values. Apply uses compare-and-
swap predicates so concurrent or changed rows are refused, not overwritten.

Migration order:

1. QA deterministic reassignment.
2. Mobile deterministic reassignment.
3. Generic Lead rows with explicit title discipline.
4. Closed-vocabulary role-only extraction for the remaining ~100 Lead rows.
5. Architect role correction.
6. Deterministic seniority correction, including unsupported
   Architect->Principal and Head->C-level rows.
7. Candidate role/seniority normalization for the 31 user + 5 sample rows.
8. Repoint aliases/tracks/subscription UUIDs where a node identity changes.
9. Hide zero-count generic Lead nodes; do not delete them in this release.

Persist or durably write an audit record for every changed row:

```text
run_id, entity_type, entity_id,
before_role, after_role,
before_seniority, after_seniority,
reason, input/spec identity, changed_at
```

Acceptance:

- dry-run and apply are idempotent;
- apply count exactly equals approved plan count;
- rollback restores every before-value;
- zero source nodes are hidden with remaining vacancies;
- active subscription coverage is unchanged unless explicitly listed in the
  go/no-go package;
- positions and group rollups are repaired for every changed member.

### Phase 5 — build the release dataset and gates

Create a versioned, human-readable fixture set containing at least:

- 11 reviewed DOU/Djinni pairs (22 observations);
- 20 QA boundaries;
- 20 Mobile boundaries;
- 20 Lead/Manager/Head/CTO boundaries;
- 20 Architect/Staff/Principal boundaries;
- 20 dedup negatives with shared company boilerplate.

Score:

- role exact accuracy;
- seniority exact accuracy;
- cross-source pair consistency;
- repeated-run stability;
- parent/child compatibility correctness;
- dedup positive recall and labelled-negative precision;
- unresolved/refusal rate.

Release gates:

```text
locked-field accuracy            = 100%
cross-source pair consistency    = 100%
overall reviewed role accuracy   >= 95%
overall seniority accuracy       >= 98%
labelled-negative dedup merges   = 0
unresolved affected rows         <= 2%
```

Default CI/Jest never calls DeepSeek/OpenAI. Live evaluation is explicit,
records model/spec identity, runs ambiguous rows three times, and has a declared
cost ceiling.

### Phase 6 — local end-to-end rehearsal

Against the Docker production snapshot:

1. deploy the compatible writer locally;
2. run migration dry-run and save the report;
3. apply the exact plan;
4. re-embed/re-dedup the intended scope;
5. run invariants and API/feed/track/subscription smoke tests;
6. run rollback;
7. prove the snapshot returns to its original checksums/counts;
8. apply again to prove idempotency.

Required invariants:

```text
vacancy count unchanged
posting count unchanged
every vacancy has one unique_vacancy_id
no pending dedup after the sweep
track effective role set non-empty where it was non-empty before
no active subscription widens or becomes empty
no unsupported generic Lead writer outputs
no Architect-only title implies Principal
no Head/Director-only title implies C_LEVEL
QA/Mobile explicit-title violations = 0
eligible exact/body duplicate splits = 0
```

### Phase 7 — production dry-run package

Use one of these access paths:

```bash
# Read-only/ad-hoc SQL
prod_role_db_url="$(scripts/prod-db-url.sh)"
psql "$prod_role_db_url"

# Repository CLIs against production
DATABASE_URL="$(scripts/prod-db-url.sh)" pnpm role-contract:migrate -- --plan <plan>

# Railway service environment when ETL/Temporal variables are also required
railway run --service @metahunt/etl -- <command>
```

Every ad-hoc audit query uses:

```sql
BEGIN READ ONLY;
SET LOCAL statement_timeout = '30s';
-- query
ROLLBACK;
```

Never print, persist, or paste the production URL. Never use production as the
integration-test database.

The completed package is the single owner approval gate described above.

### Phase 8 — production apply

After owner `go`:

1. Verify Railway production ETL is the approved commit.
2. Create and verify a full PostgreSQL backup.
3. List, then pause `rss-ingest-hourly`, `tg-digest-daytime`, and `dedup-sweep`.
4. Deploy the compatible writer/readers before changing stored rows.
5. Re-run the read-only dry-run and require byte-identical plan identity/counts.
6. Apply the targeted migration.
7. Refresh taxonomy stats/rollups.
8. Re-embed and re-resolve only the approved scope unless identity-embedding v2
   was explicitly approved as a measured full backfill.
9. Run every invariant and compare with the go/no-go package.
10. Resume all schedules and verify they are active.
11. Check API health, feed counts, track counts, dedup pending count, and logs.
12. Save the run ID, audit artifact, backup checksum, deployed commit, and final
    counts in a migration journal.

If any post-apply invariant fails, keep schedules paused, rollback data using the
run audit or full backup as appropriate, redeploy the previous compatible code,
verify baseline invariants, then resume.

### Phase 9 — observation and retirement

For seven days after release, record daily:

- new role/seniority distributions;
- attempts to write hidden/generic Lead roles;
- unresolved role rate;
- Architect/Head policy violations;
- QA/Mobile explicit-title violations;
- exact/body split count;
- dedup gold overrides and conflicts;
- feed/track counts and active subscription delivery failures.

After seven clean days:

- remove legacy writer compatibility for generic Lead roles;
- keep hidden nodes and slug/name aliases for at least one release cycle;
- archive this plan into `md/journal/migrations/` with final measured results;
- encode the locked product contract in an ADR so future prompt work cannot
  silently redefine it.

## Expected implementation slices

The work should land in independently reviewable commits/PR slices:

1. local DB tooling fix + production-derived fixtures;
2. shared title/seniority/role policy + unit tests;
3. vacancy/CV/Requirements writer alignment;
4. dedup identity + compatibility changes;
5. migration CLI + local rehearsal;
6. production dry-run artifacts;
7. approved apply + migration journal.

Do not mix the production data apply into the code-review commit.

## Definition of done

This problem is finished when:

- all writers use the same policy;
- explicit QA/Mobile/level decisions are deterministic code paths;
- generic Lead roles receive no new rows and legacy rows are migrated;
- Architect and upper-level semantics match this document;
- dedup cannot split a gold duplicate solely because role/seniority differs;
- browse, recommendation, tracks, subscriptions, and CV handling use explicit
  compatibility instead of accidental enum/taxonomy ordering;
- migration rollback has been rehearsed locally and production invariants pass;
- seven-day monitoring is clean;
- the final ADR and migration journal make the contract discoverable without
  reopening this research.
