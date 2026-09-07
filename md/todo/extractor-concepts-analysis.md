# Extractor concepts (Phase C) — analysis and proposed edit

**Date:** 2026-09-07. Companion to `extractor-concepts-prompt.md` (the spec) and
`taxonomy-kind-review-audit.md` (the `kind` review). Read-only analysis — no code
changed.

## Summary

The EXCLUDE-methodologies rule appears in **three** places in
`extract-vacancy.baml` (class field, function field, counter-example) plus a
fourth in `extract-candidate.baml`. `loadTaxonomy` has **no `kind` filter and no
size cap** — every VERIFIED node's canonical name is already in `{{ knownSkills }}`,
so the recovered concepts are *already in the prompt today*; only instruction text
kills them. The edit costs ~120 prompt tokens, not a vocab blowup. Recommendation:
relax vacancy extraction as specced, **and** treat `extract-candidate.baml` too —
but by adding a `knownSkills` parameter to `ExtractCandidate` (it currently gets
only `knownRoles`), not by loosening it free-form. The CV path is resolve-only and
cannot spawn nodes, so it is the low-risk half; leaving it alone makes `/match`
tell a candidate to "learn Microservices" from a CV that says microservices.

---

## 1. Every EXCLUDE site in `extract-vacancy.baml`

**Site 1 — `class Skills.required` @description**, lines 66-86. Verbatim 73-81:

```
    EXCLUDE:
      - Soft skills (communication, leadership, ownership, problem solving).
      - Generic categories (networking, scripting, relational databases,
        web testing, ai tools, technical documentation).
      - Process methodologies (Scrum, Agile, SDLC, STLC, unit testing,
        integration testing, regression testing).
      - Universal protocols / formats (HTTP, JSON, XML, REST as a concept).
        DO extract specific tools like Postman or named REST frameworks.
      - Tools every developer uses (git, terminal, IDE).
```

Cap on line 70: `databases (PostgreSQL), cloud (AWS). MAX 10 entries.`

**Site 1b — `class Skills.optional`**, lines 87-90: "Same EXCLUDE / DEDUPLICATE
rules as required. MAX 5 entries." — inherits by reference, no edit needed.

**Site 2 — the `skills Skills` field on `ExtractedVacancy`**, lines 151-155:

```
  skills Skills @description(#"
    Hard technical skills ONLY.
    EXCLUDE: soft skills, methodologies (Scrum/Agile), domain knowledge,
    certifications. Each entry is a single skill name.
  "#)
```

**Site 3 — counter-example block**, lines 324-332; offending line 328:
`skills.required: ["Unit Testing"]  ← process / methodology, exclude`

**knownSkills contract (unchanged anchor)**, lines 302-309 — "use the EXACT
spelling from the list … do NOT invent variant spellings of listed skills.
Canonical skills: {{ knownSkills }}".

**Latent regression proof:** the `dou_fullstack_talanovyti` test (lines 359-371)
already passes `knownSkills "…, Microservices"` (line 369) against a body
requiring microservices — today line 77 forbids emitting it.

**Out of scope but disagreeing today:** `extract-vacancy-requirements-v2.baml:96`
(eval-only V2 function) *already* allows `methodologies (TDD, BDD, …)`.

---

## 2. How `knownSkills` is built (`apps/etl/src/02-enrich/extraction/baml.extractor.ts`)

Lines 115-121: `SELECT type, canonicalName FROM nodes WHERE status = 'VERIFIED'`.

- **Status filter:** `VERIFIED` only. **No `kind` filter** — `nodes.kind` never
  referenced here, so every recovered CONCEPT is already in the prompt string.
- **Size bound:** none. `joinNamesByType` (`platform/shared/node-names.ts:6-15`)
  filters by type, locale-sorts (keeps prompt prefix byte-stable for provider
  prompt caching), `join(", ")` — no LIMIT, no df floor.
- **Cache:** 60 s in-process TTL. Injection: `b.ExtractVacancy(…, skills, …)` →
  `{{ knownSkills }}` at `extract-vacancy.baml:309`.
- **Identity coupling:** `identity()` (lines 70-99) folds `taxonomyHash` +
  `BAML_PRODUCTION_SOURCE_HASH` into `specHash`, the cache key in
  `cached-vacancy-extractor.ts:73-90`.
- **Downstream node creation:** `node-resolver.service.ts:15-33` is
  resolve-**or-create** — an alias miss inserts a `NEW` node. This is the
  fragmentation surface; C2's "don't invent" clause is load-bearing.

---

## 3. Proposed edit

### 3a. Replace `extract-vacancy.baml:73-81`

```
    NEVER extract — these are not skills, whatever the posting calls them:
      - Soft skills (communication, leadership, ownership, problem solving).
      - Generic category words (networking, scripting, relational databases,
        web testing, ai tools, technical documentation).
      - Universal protocols / formats (HTTP, JSON, XML, REST as a concept).
        DO extract specific tools like Postman or named REST frameworks.
      - Tools every developer uses (git, terminal, IDE).

    ARCHITECTURAL STYLES AND NAMED PRACTICES — Microservices, Event-Driven
    Architecture, Clean Architecture, DDD, CQRS, CI/CD, TDD, RAG, Prompt
    Engineering, MLOps, ETL, Observability and the like — extract one ONLY
    when the posting genuinely requires it AND its name appears VERBATIM in
    the prompt's `knownSkills` list. Copy the spelling from that list
    character for character. If the practice the posting names is not on the
    list, DROP it: never invent, rephrase, expand or abbreviate one
    ("event-driven design", "EDA", "Agile methodology" are all wrong — either
    the exact listed name or nothing).

    Any skill you output that is NOT on `knownSkills` must be a concrete
    technology — a language, framework, library, database, cloud service or
    tool. Never mint a new practice, methodology or architectural style.

    Prefer concrete technologies when the MAX cap forces a choice: a practice
    only takes a slot once every named technology the posting requires is in.
```

The "NEVER" block is the old list minus the methodologies bullet (nothing
loosens by accident); the gated block is C1; the "not on knownSkills ⇒ concrete
tech" sentence is C2 as a type constraint (the form an LLM follows best); the
last line handles the `MAX 10` cap (see §5).

### 3b. Replace `extract-vacancy.baml:151-155`

```
  skills Skills @description(#"
    Hard technical skills ONLY. Each entry is a single skill name.
    EXCLUDE: soft skills, domain knowledge, certifications.
    Architectural styles and named practices (Microservices, CI/CD, TDD, RAG)
    are allowed ONLY as an exact verbatim match from `knownSkills`. A skill
    that is not on that list must be a concrete technology, never a
    methodology.
  "#)
```

### 3c. The "Unit Testing" counter-example (line 328)

**Remove it** — its correctness is now data-dependent (wrong today, right the
moment someone verifies that node). Replace with rephrase/invented examples:

```
        skills.required: ["Agile methodology"]  ← invented practice, not in knownSkills
        skills.required: ["event driven design"] ← rephrase of a listed practice;
                                                   use the exact knownSkills name or drop it
```

Add a **positive** example after lines 311-322 so the model sees the gate
satisfied, not only violated:

```
    Example — a listed practice IS extractable
      knownSkills contains: "Microservices, CI/CD, RAG, Kafka"
      Input: "Event-driven microservices on Kafka, CI/CD pipelines,
              building a RAG pipeline. Agile/Scrum team."
      Output:
        skills.required: ["Microservices", "Kafka", "CI/CD", "RAG"]
          ← each one appears verbatim in knownSkills
          ← "Event-driven" is NOT emitted: no exact knownSkills entry here
          ← "Agile" / "Scrum" are NOT emitted: process, never a skill
```

### 3d. Companion code changes

- **Bump `PROMPT_VERSION`** `baml.extractor.ts:25` `4 → 5` (dashboard label only).
- **Put new `test` blocks in a NEW file** `apps/etl/baml_src/tests-vacancy.baml`,
  **not** in `extract-vacancy.baml` — `scripts/check-baml-production-identity.mjs:7`
  hashes `extract-vacancy.baml` whole (tests included), despite the generated
  file's comment claiming otherwise. In-file `test` blocks bust every
  `extraction_artifacts` row.
- **Hand-update `BAML_PRODUCTION_SOURCE_HASH`** at
  `baml-production-identity.generated.ts:4` — the "GENERATED by" header is
  misleading, `check-baml-production-identity.mjs` only verifies and throws.
  Workflow: run `pnpm baml:identity:check`, paste the **first** hex string from
  the thrown message (its labels are swapped, lines 19-21).

---

## 4. Open question — `extract-candidate.baml` (CV extraction)

**Yes, treat it — but add a parameter, don't blanket-relax.**

- **Fact 1:** `ExtractCandidate` (lines 75-78) takes `text` + `knownRoles` only —
  **no `knownSkills`**. `candidate.extractor.ts:26-41` loads all VERIFIED nodes,
  then keeps only ROLE names. The "verbatim in knownSkills" rule is not
  expressible on the CV side today; mirroring the wording without the parameter
  would cause exactly the free-form minting C2 forbids.
- **Fact 2:** the CV path **cannot create nodes**. `candidate-loader.service.ts:21-23`
  + `ranking.service.ts:48-106` — resolve-only SELECT, misses stored as
  `unmatchedSkills`. No fragmentation risk at all.
- **Fact 3:** leaving it creates a growing regression. Post-Phase-C, JDs carry
  `Microservices`/`CI/CD`/`RAG` in `vacancy_nodes`; the CV extractor drops the
  same terms, so `/match` marks them **missing** for a candidate whose CV says
  them, and `RecommendationService.recommend` (`recommendation.service.ts:34-48`)
  can recommend learning a practice the CV already names — a wrong answer in the
  flagship feature. Required coverage also drives the fit tier, so fit is
  understated for practice-heavy senior CVs.

**Recommendation:** in the same PR — add `knownSkills: string` to
`ExtractCandidate`, pass `joinNamesByType(verified, "SKILL")` from
`candidate.extractor.ts` (rows already fetched, one-line cache-shape change),
inject a `Canonical skills: {{ knownSkills }}` block mirroring the vacancy file,
rewrite `extract-candidate.baml:15-17` with the same NEVER / verbatim-gated
split. `extract-candidate.baml` is **not** in the identity hash list, so it
cannot invalidate the vacancy cache; CV extraction is one call per new CV,
content-hash-deduped — the larger prompt costs almost nothing.

**Steelman for vacancy-only-now:** `CandidateSkills.required` allows `MAX 30` and
says "Be generous on required". Concepts are high-df / low-IDF — little ranking
signal, but they inflate **required coverage %**, which sets the fit tier. A
defensible alternative: ship vacancy-only, watch the tier distribution a week,
then do the CV side. The analysis still favours shipping both — an inflated tier
is a symmetric change on both sides of the same ratio; the split state is an
outright wrong "learn X".

---

## 5. Risks

| Risk | Assessment |
|---|---|
| Prompt-size blowup | **Not real.** `loadTaxonomy` filters on `status` only — the ~150 concepts are already in `{{ knownSkills }}` and priced into every call. Growth = ~120 tokens of instruction text. |
| **Near-duplicate node spawning** (`event-driven design` / `EDA` / …) | **The real risk.** `node-resolver.service.ts:15-33` resolve-or-create; a miss inserts a `NEW` node with `kind = NULL`. `normalizeAliasName` only strips separators — can't collapse acronyms or `design`↔`architecture`. Mitigation: the "must be concrete tech" clause (prompt-level, probabilistic) **plus** hand-seed 2-4 aliases per verified concept (§2.4) and watch `nodes WHERE status='NEW' AND created_at > <deploy>` for a week. Acronym-collision warning: `EDA` = Event-Driven Architecture *and* Electronic Design Automation. |
| **`knownSkills` may not contain the recovered concepts on prod** | Data-dependent — Phase D3 `taxonomy:migrate --apply` may not have run on prod. **Verify before merge:** `SELECT kind, status, count(*) FROM nodes WHERE type='SKILL' GROUP BY 1,2;` + spot-check `Microservices`, `CI/CD`, `RAG`, `Event-Driven Architecture`. If still HIDDEN on prod, the change is a no-op in production while green locally. |
| **`MAX 10 entries` cap** | Concepts now compete for the same 10 required slots as concrete tech; 8 technologies + microservices/CI/CD/DDD can push a real datastore out → degrades matching. Handled by the priority sentence in §3a. Raising the cap to 12 changes token cost and every downstream df/IDF distribution — not in this PR. |
| Extraction cache invalidation | Editing the file changes `specHash` → every `extraction_artifacts` row is a miss. **Marginal cost ≈ zero** — `taxonomyHash` is in the same `specHash` and the un-hiding migration already changed the taxonomy, so the cache is already cold. Forward-only; only new postings pay. |
| Named spec files | Both mock the BAML client — a wording change alone breaks **neither** (`baml.extractor.spec.ts:3-6` mocks `b.ExtractVacancy`; `requirements-v2.baml.extractor.spec.ts` mocks a different function in a different file). Nothing in CI exercises this rule today — that's the problem (see §6). |
| `baml:generate` | Regenerates `baml_client/` incl. `inlinedbaml.ts` (embeds the full `.baml` source). Forgetting it = runtime keeps the old prompt. Must be committed. |
| `baml:identity:check` | Fails until the hash is hand-updated (§3d). Runs in CI — a forgotten update reds the build rather than shipping silently. |
| `additional-skills.service.ts:51-57` | "You probably also know X" comes from `node_skill_cooc` filtered by `node_tech_meta.generic = false`. Recovered concepts with no `node_tech_meta` row pass (`COALESCE(m.generic, false) = false`) → expect `CI/CD` / `Microservices` chips in suggestions. Not a bug, a visible product change. |

---

## 6. Verification

```bash
pnpm --filter @metahunt/etl baml:generate     # regenerates baml_client + inlinedbaml.ts
pnpm baml:identity:check                      # fails until the hash is hand-updated
pnpm lint
pnpm test:etl
pnpm test:etl:int
pnpm build:all
```

Taxonomy precondition before merge:

```bash
DATABASE_URL=$(scripts/prod-db-url.sh) psql -c \
  "SELECT canonical_name, kind, status FROM nodes
    WHERE type='SKILL'
      AND canonical_name IN ('Microservices','CI/CD','RAG','Event-Driven Architecture','ETL','MLOps');"
```

All must be `VERIFIED` or the prompt change is inert on prod.

Live check: a JD body "event-driven microservices, CI/CD, RAG pipeline" →
`skills.required` contains `Event-Driven Architecture`, `Microservices`, `CI/CD`,
`RAG` — each only because that exact node is VERIFIED.

**Fixtures to add** (the two named specs are mock-based and pass unchanged —
nothing in CI exercises the rule):

1. **`apps/etl/baml_src/tests-vacancy.baml` (new)** — `test vacancy_concepts_gated
   { functions [ExtractVacancy] … }` with `knownSkills` including
   `Microservices, CI/CD, RAG` but **not** `Event-Driven Architecture`, over a
   body naming all four; correct output emits three, drops the fourth. The only
   test that verifies the gate. New file, not `extract-vacancy.baml` (cache).
2. **`baml.extractor.spec.ts:48-55`** — add `{ type: "SKILL", name:
   "Microservices" }` to `bootstrap()` default rows, assert it reaches the
   `knownSkills` argument. Pins "no `kind` filter in `loadTaxonomy`".
3. `apps/etl/src/eval/vacancy-requirements-v2.dataset.json` — untouched (V2 is
   separate, already permits methodologies).
4. `apps/etl/src/02-enrich/extraction/__fixtures__/dou-fullstack-talanovyti.ts` —
   if it asserts an expected skill set, `Microservices` becomes a legitimate
   expected value.
5. If §4 is taken: a mirror row in the `BamlCandidateExtractor` spec asserting
   `ExtractCandidate` now receives a skills argument.
