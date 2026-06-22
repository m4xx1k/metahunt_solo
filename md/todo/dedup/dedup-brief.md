# MetaHunt — Semantic vacancy deduplication implementation brief

> **Purpose:** context, concept, data schema, edge-cases, and open questions for
> implementing semantic dedup. Walk through the open questions with the user before
> writing any code.

---

## 1. Context and constraints

- **Project:** MetaHunt — ETL aggregator for Ukrainian IT vacancies (Djinni + DOU
  via RSS, NestJS backend, Temporal orchestration, PostgreSQL + Drizzle, Next.js
  frontend).
- **Deadline:** less than a week before thesis defense. MVP quality with emphasis
  on **demonstrability at the committee**.
- **Data:** ~3-4k vacancies in DB, ~66% Djinni / ~33% DOU. Both sources active;
  real cross-source duplicates present.
- **pgvector** already installed. No embedding logic in code yet.
- **Why this matters:** semantic dedup is declared in the thesis annotation,
  keywords, goals, scientific novelty, and object/subject of the internship report.
  Semantic dedup on vector embeddings + Golden Record is 1 of 3 declared novelty
  items. Removing it weakens novelty and requires rewriting ~20+ paragraphs in
  sensitive sections.

### Critical data constraint

**Djinni does not expose company name in the RSS feed.** Matching on `companyName`
is unreliable — for Djinni vacancies the field is `null` or LLM-extracted from
the description (unstable). The dedup concept must account for this: the pre-filter
is built on stable structured fields + publish date, and company name is used
**only as a soft signal**, never as a required criterion.

---

## 2. Goals

**System (code):**
1. A vacancy gets a semantic vector representation.
2. A **UniqueVacancy** entity exists — canonical grouping of vacancies describing
   the same position from different sources.
3. The Temporal pipeline automatically embeds new vacancies and resolves them into
   a group.
4. An operator UI exists for viewing UniqueVacancy, originals, merge metadata,
   manual unmerge, and re-merge.
5. When a vacancy description updates, the system correctly re-evaluates its group
   membership.

**For the defense (drives UX decisions):**
- Cross-source duplicate groups are visible on a dashboard.
- For any (Vacancy → UniqueVacancy) pair the "why merged" is visible: similarity
  score, which pre-filter fields matched, which embedding model, when.
- Metrics visible: total groups found, cross-source count, average similarity.
- Operator "not a duplicate" / "actually a duplicate" flow — fully clickable.

---

## 3. Hybrid deduplication concept

### Stage 1. Pre-filter (structural candidates)

Select candidate vacancies for which similarity computation makes sense. Hard
constraints:

- `vacancy.sourceId != candidate.sourceId` — **never match within the same source.**
- `|vacancy.publishedAt - candidate.publishedAt| <= WINDOW_DAYS` (start: 14 days,
  calibrate).
- `candidate.status` active (not archived).

Soft conditions (boosting signals, null-safe — do not exclude a candidate for null):

- `role` normalized-equal (lowercase, strip seniority/level from text) **or**
  `seniority` equal.
- `workFormat` equal (if both non-null).
- `companyName` equal after normalization (lowercase, strip "LLC/Ltd/Inc/TOV" etc)
  — **only when present on both sides**. For Djinni↔DOU pairs this is often null
  on one side — ignore in that case.

Pre-filter returns N candidates (start: 20-50) ranked by similarity next.

### Stage 2. Semantic similarity (ANN on pgvector)

Compute cosine similarity between embeddings for each candidate. Use an **HNSW
index** with `vector_cosine_ops`. SQL:

```sql
SELECT v.id, 1 - (v.embedding <=> $1) AS similarity
FROM vacancies v
WHERE v.source_id != $2
  AND v.published_at BETWEEN $3 AND $4
  AND v.status = 'active'
  AND ... -- other pre-filter conditions
ORDER BY v.embedding <=> $1
LIMIT 50;
```

Decision thresholds:

- `similarity >= HARD_THRESHOLD` (start: 0.92) → confident duplicate, auto-merge
  into the candidate's existing UniqueVacancy.
- `SOFT_THRESHOLD <= similarity < HARD_THRESHOLD` (start: 0.85-0.92) → suspicion,
  mark as `suggested_match`, operator confirms/rejects manually.
- `similarity < SOFT_THRESHOLD` → not a duplicate.

If no candidate exceeds SOFT for a new vacancy, create a **new UniqueVacancy**
with this vacancy as canonical.

### What to embed

Starting version: concatenation of `role` + `seniority` + `description` (raw or
post-LLM-normalized — see open questions). Optionally add the required-skills
string. Model: `text-embedding-3-small` (1536 dim, $0.02/1M tokens). Store
`embeddingModel` as a column for future migrations.

**Open question:** embed raw RSS description or post-LLM normalized description?
Raw is more stable and cheaper but noisier. Agree with user before coding.

---

## 4. DB schema changes

### 4.1. Vacancy — new columns

- `embedding vector(1536)` nullable
- `embeddingModel text` nullable — e.g. `'text-embedding-3-small'`
- `embeddingGeneratedAt timestamptz` nullable
- `embeddingSourceHash text` nullable — sha256 of the text the embedding was
  generated from (detects "embedding stale" after description update)
- `uniqueVacancyId uuid` nullable, FK → `unique_vacancies.id` ON DELETE SET NULL

### 4.2. New table `unique_vacancies`

| Field | Type | Purpose |
|---|---|---|
| `id` | uuid PK | |
| `canonicalVacancyId` | uuid FK → vacancies.id | The vacancy shown as "primary" in the group. Initial strategy: earliest by `publishedAt`; re-selected on unmerge/archive. |
| `centroidEmbedding` | vector(1536) | Mean of all member embeddings. Used as the anchor point when adding new vacancies. Recomputed on every merge/unmerge. |
| `sourceCount` | int | Denormalized count of distinct `sourceId`s in the group. |
| `vacancyCount` | int | Denormalized vacancy count in the group. |
| `firstSeenAt` | timestamptz | `publishedAt` of the earliest vacancy in the group. |
| `lastSeenAt` | timestamptz | `publishedAt` of the latest vacancy in the group. |
| `mergedSkills` | jsonb | Union skill set (union required, union optional) — for feed UI/filters. |
| `salaryMin`, `salaryMax`, `salaryCurrency` | | Aggregated salary range (min of mins, max of maxes — or the most complete value). |
| `status` | enum `active`/`archived` | If all member vacancies are archived → group archived. |
| `manualOverride` | bool | true if an operator intervened — automatic re-evaluation is suppressed for this group. |
| `createdAt`, `updatedAt` | | |

### 4.3. New table `unique_vacancy_links` (audit + diagnostics)

Vacancy ↔ UniqueVacancy association with decision history. Separate from the FK
on `Vacancy.uniqueVacancyId` (which holds current state only); this table holds
history.

| Field | Type | Purpose |
|---|---|---|
| `id` | uuid PK | |
| `vacancyId` | uuid FK | |
| `uniqueVacancyId` | uuid FK | |
| `similarity` | numeric(5,4) | Score at time of assignment (null for canonical / new group). |
| `matchedAgainstVacancyId` | uuid FK nullable | The specific vacancy it matched against (for UI explanation). |
| `prefilterMatches` | jsonb | Which fields matched: `{role: true, workFormat: true, seniority: true, company: false, dateWindowDays: 2}`. |
| `decidedBy` | enum `auto`/`operator` | |
| `decidedByUserId` | uuid nullable | If operator. |
| `action` | enum `linked`/`unlinked`/`canonical_assigned` | |
| `embeddingModel` | text | Which model made the decision. |
| `createdAt` | timestamptz | |

This is the **key table for thesis defendability** — the UI shows "why this vacancy
is here" from its data.

### 4.4. New table `unique_vacancy_blocklist` (prevent re-auto-merge after unmerge)

When an operator says "not a duplicate", record the pair so the automation never
re-merges it even if similarity increases.

| Field | Type |
|---|---|
| `vacancyAId` | uuid FK |
| `vacancyBId` | uuid FK |
| `reason` | text nullable |
| `createdAt` | timestamptz |
| UNIQUE | `(LEAST(a,b), GREATEST(a,b))` |

### 4.5. Indexes

- `vacancies.embedding` — HNSW with `vector_cosine_ops`, `m=16, ef_construction=64` (starting values, calibrate as needed).
- `vacancies.uniqueVacancyId` btree.
- `vacancies (sourceId, publishedAt)` btree — for pre-filter.
- `unique_vacancy_links.vacancyId`, `.uniqueVacancyId` btree.

---

## 5. Embedding pipeline (Temporal)

Current pipeline: `extract → parse → load`. Add a new step **between** parse and
load (or at the end — agree with agent based on where vacancy creation/update
logic currently lives).

### New activity: `embedVacancyActivity`

Input: `vacancyId`.
Logic:
1. Load Vacancy.
2. Build embedding text (see §3).
3. Compute `embeddingSourceHash = sha256(embeddingText)`. If
   `vacancy.embeddingSourceHash === newHash` and `embeddingModel === current` →
   skip (idempotency).
4. Call OpenAI embeddings API. Retries and timeouts as in other LLM activities.
5. Write `embedding`, `embeddingModel`, `embeddingGeneratedAt`, `embeddingSourceHash`.
6. Call `resolveUniqueVacancyActivity(vacancyId)`.

### New activity: `resolveUniqueVacancyActivity`

Input: `vacancyId`.
Logic:
1. Load Vacancy with embedding.
2. **If Vacancy already has `uniqueVacancyId`** → this is an update; go to UPDATE
   branch (see §6.1).
3. Otherwise — NEW or re-resolve.
4. Run pre-filter + ANN candidate search (see §3).
5. Check blocklist — discard any pairs in `unique_vacancy_blocklist`.
6. Among the remaining, find the best match:
   - `similarity >= HARD_THRESHOLD` → join `candidate.uniqueVacancyId`, record
     link with `decidedBy='auto'`, update UniqueVacancy aggregates (centroid,
     counts, mergedSkills, salary, lastSeenAt).
   - `SOFT <= similarity < HARD` → do not auto-merge. Create own UniqueVacancy
     (sole member), record suggested matches as rows in `unique_vacancy_links`
     with `action='suggested'` — operator sees the hint.
   - Nothing above SOFT → create new UniqueVacancy, this vacancy = canonical.

### Backfill

Separate Temporal workflow / batch CLI:
1. Iterate vacancies WHERE `embedding IS NULL`, batches of 100, via
   `embedVacancyActivity`.
2. After all have embeddings — iterate again via `resolveUniqueVacancyActivity`
   in deterministic order (`publishedAt ASC`) so older vacancies become canonical.
3. ~10-15 minutes for 3-4k vacancies, $0.5-1 in OpenAI API cost.

---

## 6. Edge-cases — must handle

### 6.1. Vacancy description update

RSS record with the same `sourceId + externalId` but new description → Vacancy
update → `embeddingSourceHash` changed.

Sequence:
1. Recompute embedding.
2. Check if the vacancy still belongs in its current UniqueVacancy:
   - Compute cosine similarity between new embedding and `centroidEmbedding`.
   - `>= HARD_THRESHOLD` → stay in group, update aggregates, add
     `unique_vacancy_links` record with `action='reconfirmed'`.
   - `< SOFT_THRESHOLD` → **drift**:
     - If current UniqueVacancy has `manualOverride=true` → leave it, only record
       a warning in links.
     - Otherwise — detach (`uniqueVacancyId = null`), trigger re-resolve as new.
     - If it was canonical → re-select canonical from remaining members (next by
       `publishedAt`), recompute centroid.
   - `SOFT <= sim < HARD` → stay in group, add warning.

Drift is only acted on for strong changes to preserve UI stability.

### 6.2. Operator unmerge

Operator says "this vacancy is not a duplicate":
1. `vacancy.uniqueVacancyId = null`.
2. Record in blocklist pairs: (this vacancy, every other vacancy in former group).
3. Run `resolveUniqueVacancyActivity` for this vacancy — it finds another group
   (not in blocklist) or becomes canonical of a new one.
4. If it was canonical in the previous group — re-select canonical from the rest,
   recompute centroid/aggregates. If 1 vacancy remains — group is valid
   (sole-member).
5. Record `unique_vacancy_links` with `action='unlinked'`, `decidedBy='operator'`.
6. Mark current UniqueVacancy `manualOverride=true` (discussed decision — confirm
   with user).

### 6.3. Manual merge (operator says "this is a duplicate")

UI: select two UniqueVacancy → "merge":
1. Select the "surviving" group (older by `firstSeenAt`).
2. Move all vacancies from the merged group into the surviving one: update
   `uniqueVacancyId`.
3. Recompute centroid, mergedSkills, salary, counts.
4. Delete the merged UniqueVacancy.
5. Record links with `action='manual_merge'`.
6. Remove corresponding pairs from blocklist.

### 6.4. Pre-filter collision

New vacancy has `>=HARD` similarity with candidates from **multiple different**
UniqueVacancy groups:
- Strategy: join the one where `centroidEmbedding` is closest (highest similarity
  to centroid, not to a specific candidate).
- Optionally record a suggestion for manual merge of those groups.

### 6.5. Canonical vacancy archived

If the canonical Vacancy transitions to `archived`:
- Re-select canonical from the active group members (next earliest).
- If all archived → `UniqueVacancy.status = archived`, not shown in the public
  feed.

### 6.6. Idempotency

- Embed activity: idempotent by `embeddingSourceHash + embeddingModel`.
- Resolve activity: idempotent by `(vacancyId, embeddingSourceHash, uniqueVacancyId)`
  — if state unchanged, do nothing.
- Any update to `unique_vacancies` is in a transaction with the Vacancy update.

---

## 7. Operator frontend surfaces

- `/operator/unique-vacancies` — list with filters: standard feed filters
  (role/seniority/workFormat), `sourceCount >= 2` (cross-source only — the star
  view for the defense), `manualOverride=true`. Group card: canonical title,
  salary range, `sourceCount`, `vacancyCount`, link to detail.
- `/operator/unique-vacancies/:id` — group detail: member list (source, URL,
  publishedAt, canonical/member/archived status, similarity to centroid, unmerge
  button), "why merged" block (from `unique_vacancy_links`), suggested matches
  (confirm/reject), optional side-by-side description diff.
- `/operator/dedup-metrics` — total UniqueVacancy count, cross-source count,
  similarity histogram, manual overrides, suggested→confirmed/rejected counts.
- **Public feed** (open question — see §8): switch from `Vacancy` to
  `UniqueVacancy` display, showing "available on N platforms" with source links.

---

## 8. Open questions (agree before writing code)

1. **What to embed:** raw RSS description or post-LLM normalized text? Which
   fields to concatenate?
2. **Embedding model:** `text-embedding-3-small` (1536d, cheap) vs
   `text-embedding-3-large` (3072d, more accurate)?
3. **UniqueVacancy canonical embedding:** centroid (mean, more stable against
   drift) or embedding of the canonical vacancy (simpler to explain)?
4. **Public feed roll-out:** switch immediately to UniqueVacancy display or use a
   feature flag during stabilization?

---

## 9. Calibration parameters (externalize to config)

```
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIMENSIONS=1536
HARD_THRESHOLD=0.92
SOFT_THRESHOLD=0.85
PREFILTER_DATE_WINDOW_DAYS=14
PREFILTER_TOP_N=50
HNSW_M=16
HNSW_EF_CONSTRUCTION=64
HNSW_EF_SEARCH=40
```

Starting values from literature (HNSW Malkov-Yashunin). Calibrate on 20-30
manually verified pairs before fixing values in the thesis report: label ~30
pairs (10 clear duplicates, 10 clearly different, 10 borderline), build ROC,
pick threshold where precision >= 0.95. Thresholds 0.85/0.92 should be confirmed
or adjusted against the internship report values (0.88-0.92).

---

## 10. Extracted field types available for pre-filter (from user)

LLM parser returns in `ExtractedVacancy` (these fields are available for
pre-filter):

```typescript
{
  role, seniority, skills: {required, optional}, experienceYears,
  salary: {min, max, currency}, englishLevel, employmentType,
  workFormat, locations, domain, engagementType,
  companyName,  // unstable — Djinni does not expose it
  hasTestAssignment, hasReservation
}
```

Pre-filter reliability order: `publishedAt` (date window), `sourceId`
(same-source exclusion), `role` (normalized), `seniority`, `workFormat`.
`companyName` — bonus only when present on both sides. Salary/english/skills —
can be added to scoring later, not critical for MVP.

---

## 11. Defense readiness checklist

- Live dashboard with a cross-source group example (Djinni + DOU for the same
  position) — find 2-3 convincing real examples and save them for demo.
- "Why merged" block for a specific example (similarity score + pre-filter fields).
- Metrics: total groups, % cross-source, similarity distribution.
- Manual unmerge → re-resolve demo — shows operator loop and Human-in-the-Loop.
- Diagram: pre-filter → ANN → threshold → decision (+ HNSW diagram already in
  internship report, fig. 1.2).
- Cosine similarity formula and thresholds 0.85/0.92 consistent with the report.
