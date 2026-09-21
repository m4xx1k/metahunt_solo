# requirement-groups — one "A or B" is one requirement

**Branch:** `feat/requirement-groups`
**Status:** design, decisions locked (§3). Nothing built.
**Written:** 2026-09-17.
**Linear:** unfiled.
**Related:** [`taxonomy-implication-graph.md`](./taxonomy-implication-graph.md) — its
Phase C shares Pass 1 below, not the whole initiative (R1).

---

## 0. Why

A posting that says "AWS **or** GCP **or** Azure" is stored today as three
required skills. Coverage is `Σ IDF(matched required) / Σ IDF(all required)`, so
a candidate who legitimately knows one of the three collects a third of an axis
they fully satisfy. The vacancy looks like a worse fit than it is and can drop
out of the feed entirely.

Measured on a local restore of the prod dump (2026-09-04, 18 152 postings /
14 904 Positions — prod itself is not reachable over TCP from this machine, the
Railway proxy port times out):

| | |
|---|---|
| Positions carrying surplus substitutes in MUST | 1470 (**10.2%** of corpus) |
| Mean share of required IDF weight unreachable on those | **13.4%** |
| Worst case | 50.5% |
| Positions requiring 2+ of {AWS, Google Cloud, Azure} | 547 |
| …requiring **all three** | 209 |

Other families with 2+ co-required: rdbms 437, e2e 197 (58 with three), broker
184, frontend 150, iac 70.

**Why this cannot be derived later.** Co-occurrence cannot recover the `or`.
A posting writes alternatives on one line, so substitutes co-occur *more* than
complements. Real `npmi` from `node_skill_cooc`:

```
substitutes                     complements
Angular / React        0.133    Appium    / Selenium   0.379
AWS / Azure            0.267    Redis     / PostgreSQL 0.452
AWS / Google Cloud     0.360    Docker    / Kubernetes 0.476
Kafka / RabbitMQ       0.476    TypeScript/ React      0.564
Cypress / Playwright   0.653  ← highest in the sample
```

The ranges overlap completely. `SUBSTITUTE_NPMI_MIN = 0.3` separates frontend
and nothing else. The `or` exists only in the posting text, so it has to be
captured at extraction time or not at all. This is the **only** fact in the
current extraction backlog with that property — axes, implications and versioning
are all derivable from what is already stored.

**Known consequence, already live.** `Playwright`, `Cypress`, `Selenium` and
`Appium` are all `is_core` / `stack='qa'`, and the substitute gate in
`recommendation.service.ts:190` keeps a same-stack framework when `npmi ≥ 0.3`.
Cypress/Playwright sits at 0.653, so a Playwright QA is told to learn Cypress.
That gate is rewritten against requirement groups once they exist (§9).

---

## 1. Goals

- **G1.** One stated choice costs one requirement, in both the numerator and the
  denominator of Fit.
- **G2.** Zero change to anything that is already correct. A flat required /
  optional list stays the product's view of a vacancy.
- **G3.** Every corpus pass is one BAML change plus one re-extraction, never two
  changes bundled into one pass with no way to tell which caused a shift.
- **G4.** No new stored judgement. The model reports what the posting says; every
  weight, tier and verdict stays computed.

Explicit non-goals: no `Requirement` object, no competency enum, no renaming of
requirements, no nested extraction contract. Those were considered and dropped —
see §10.

---

## 2. Invariants

These are the things that must hold for this change to be safe. **I1 and I5 are
the load-bearing ones**; break either and Fit corrupts silently.

- **I1 — the overlay is droppable.** The flat `required` / `optional` lists stay
  the complete truth. `alternatives` only says which of those names form one
  choice. Discard every group and behaviour is byte-for-byte today's. This is
  what makes the whole change revertible without a data migration.
- **I2 — groups are a partition of `required` only.** Each group has ≥2 members,
  every member appears in `required`, groups are disjoint, `optional` is never
  grouped. (Optional skills do not enter the coverage denominator, so grouping
  them buys nothing — this is also decision R2.)
- **I3 — a group id is local to one vacancy.** It is an arbitrary small integer
  with no meaning across rows, no FK, no vocabulary. It is a partition label.
- **I4 — a group of one is not a group.** After alias resolution two names can
  collapse to one node ("GCP" and "Google Cloud"). The remaining single row must
  be written as `NULL`, never as a group of one.
- **I5 — numerator and denominator use the same units.** Every place that sums
  required weight must collapse groups the same way. A pass that collapses the
  denominator but not the numerator inflates every Fit in the corpus.
- **I6 — `is_required` is uniform inside a group.** Guaranteed by I2; worth
  asserting in the loader because a mixed group would make the unit's priority
  undefined.

---

## 3. Decisions

Ten questions came up. All ten are decided; each row says what was chosen and
what that choice costs or unlocks. Nothing here is provisional — treat these as
settled unless new evidence shows up. R1–R8 are design decisions taken while
writing this plan; R9–R10 came out of measuring it on 2026-09-20.

### R1 — cap raise and grouping run as two separate corpus passes, not one

**Chosen.** Raising the `required`/`optional` caps and folding in
`taxonomy-implication-graph.md` Phase C's concept recovery is **Pass 1**.
Adding `alternatives` / `requirement_group` is **Pass 2**, started only after
Pass 1's shift has been observed on real data.

**Why.** Both passes move Fit for every user. Bundled into one re-extraction,
a regression afterward can't be attributed to "more skills per vacancy" versus
"groups changed the denominator" — there would be no way to tell which one to
revert. Split, each pass gets its own before/after read.

**Cost.** One extra full corpus pass. At `in: 7074` tokens/posting with
`cached: 6528` (the taxonomy prefix), this is still tens of dollars on
`deepseek-v4-flash`, not hundreds (§7 Pass 1 step 3 / Pass 2 step 5). The plan
in §7 is restructured around this split.

### R2 — group `required` only, never `optional`

**Chosen.** Matches I2. `optional` never enters the coverage denominator, so
grouping it changes nothing scored — only adds bookkeeping.

**Consequence.** The model will still sometimes emit an optional-only group (8
of the 22 golden-set groups are optional-only). The loader drops these by rule,
not as an error — the drop-rate tripwire in §8 already separates this reason
from the reasons that indicate real confusion.

### R3 — a group's weight is `MIN(members' weight)`

**Chosen**, with the true value (a real IDF over "positions requiring any
member") noted as a future refinement once groups exist to compute it from.

**Why MIN and not MAX.** `weight` is inverse document frequency: rare skill,
high weight. "Any of AWS/Azure/GCP" is satisfied by strictly more Positions than
"AWS" alone, so its true df is at least as high as the most common member's —
which makes its true weight at most the *lowest* member's weight. `MIN` is the
tightest bound reachable without materialising a group-level df. `MAX` would
claim the group is *rarer* than its rarest member — the opposite of true — and
would make every grouped vacancy over-rank. Full reasoning repeated in §6.1
where the SQL lives.

**Consequence.** Groups score at a lower bound of their real weight — slightly
easier to satisfy, in the same direction §8.1 already measures as a net
positive coverage shift. It doesn't mask the problem, just mildly double-dips in
the same direction. Revisit only once real data shows it matters.

### R4 — `relevance` (the sort key) collapses the same way `coverage` does

**Chosen.** Both numbers appear on the same card, so leaving one collapsed and
the other flat would be an I5 violation across two fields instead of one:
knowing two of three interchangeable tools would still sort above knowing one,
even though both now show the same Fit.

**Consequence.** Sort order shifts wherever a Position carries a group, not
only its Fit tier. This ships in Pass 2 step 7 (§7), the same step coverage
changes in — one sort shift, not two.

### R5 — excluding a skill only removes a Position when every member of its
unit is excluded

**Chosen.** Today `feed.service.ts:726` and the digest matcher in
`subscription-matcher.service.ts` drop a Position when **any** required node is
excluded. A user who excluded Azure would keep losing "AWS or Azure" postings
they could take on AWS — latent today (three flat requirements, so at least
consistent) and visibly wrong the moment the group exists.

**Consequence.** A real behaviour change to an existing filter, but it does
nothing until `requirement_group` has data, so it ships as part of Pass 2 and is
dormant risk-free until then.

### R6 — `recommendation.service.ts`'s second coverage formula is fixed in the
same release, via a shared CTE

**Chosen.** That service does not call `scoringCtes`; it re-derives the same
coverage formula in its own `vreq`/`vcov` CTEs (§6.3). Left alone, Pass 2 would
ship a fresh, visible bug the same week groups land: an AWS candidate told to
"learn Azure" because Azure still reads as an ungrouped missing requirement that
lifts coverage.

**Consequence.** Pass 2 grows by one more file. Extracting the shared CTE isn't
strictly required for correctness (both call sites could just duplicate the
`unit` logic), but it's the only thing that stops the two implementations from
drifting apart again the way they already had to be reconciled once
(`scoringCtes` itself was pulled out of `RankingService` for exactly this
reason, MET-144).

### R7 — golden-set approval covers only the rows with a MUST group

**Chosen**, over approving the whole set or shipping ungated. The count was 10
of 25; after R9 removed the FinOps row it was 9 of 24, and after the rebalance
landed it is **16 of 29**, carrying 32 MUST groups.

**Why.** Pass 2's release gate should cover exactly what Pass 2 changes. The
other 15 golden rows judge general extraction quality (role, seniority, plain
skills) — a different, already-shipped contract — and approving them buys
nothing for this feature. Per `apps/etl/src/eval/README.md`, only approved rows
participate in a release gate; a draft-only run never passes one.

**Consequence.** Pass 2 has a real, if narrow, release gate. Pass 1 (cap raise +
concepts) has no comparable golden-set gate today, and this decision does not
add one for it — that stays a follow-up if Pass 1's shift looks concerning.

Approving also **narrows the summary to approved rows** (`apps/etl/src/eval/README.md`),
so it is done last: measure against the draft set first, approve immediately
before Pass 2 ships wide (settled 2026-09-20).

### R8 — the SkillDiff single-chip rendering (`AWS / Azure / GCP` as one chip
instead of three) ships in the **next** release, not this one

**Chosen.** Pass 2 fixes the number (a fully-covered choice now reads 100% /
STRONG); the chip list still shows three red entries for one unmet choice,
which is cosmetically the same complaint that motivated this whole tracker.

**Consequence.** This is a real, visible loose end, not a silently dropped
detail — flagged here so it doesn't quietly fall off after Pass 2 ships. Carry
the group id out on `SkillRef` and collapse it in the renderer when this is
picked up (§6.5).

### R9 — the golden set is rebalanced to the corpus, and the FinOps row is gone

**Chosen 2026-09-20.** The 25-row set was written for contract coverage, not for
resemblance to the corpus, and it shows: 7 of 25 rows are QA against ~13% of
Positions, while `Software Engineer` (9.3% of the corpus, the second-largest
role) has no row at all, and neither do AI, Security, Hardware or Data Analyst —
together about a fifth of the corpus.

The FinOps row is **deleted, not relabelled** (done 2026-09-20, the set is 24
rows). It carried 25 labels, 23 of which the extractor missed, and most of those
labels are concept phrases with no taxonomy node behind them
(`Cost Forecasting`, `Tag Governance`, `Commitment Management`). It moved the
aggregate by roughly three points and diagnosed nothing.

**Target composition**, weighted by the owner's segment counts rather than by
single roles: Backend 2,458 · Data & AI 2,215 · QA 2,192 · DevOps 2,104 ·
Fullstack 1,552 · Frontend 625. Roughly: keep Backend and Fullstack as they are,
keep at most 4 QA, add Data & AI and Software Engineer rows, and add one each
for Security, Hardware and Data Analyst for balance.

**Consequence.** Every metric recorded in this tracker so far was measured on
the 25-row set. They stay as the record of what was true then, and the first run
after the rebalance is a **new baseline** — do not compare across the change.
Re-baseline once, after the dataset work is finished, not after each row.

**Done 2026-09-20.** The set is **29 rows**: three Automation QA rows without a
MUST group dropped, eight added (two `Software Engineer`, and one each of
`AI Engineer`, `Data Analyst`, `Security Engineer`, `Hardware Engineer`,
`Frontend Engineer`, plus a DevOps posting written almost entirely in
alternative lists). QA is 4 of 29 (13.8%) against 13.5% of the corpus, and
**MUST groups go from 11 in 9 rows to 32 in 16 rows**, which moves the R7 gate
from 9 rows to 16. The new baseline is F1 61.5% / precision 67.2% / recall
58.9% / `or_split_errors` 21.3, per-pass spread 0.7 points — see the
measurement log. `or_split_errors` tripling is the set finally exercising the
failure Pass 2 exists to fix, not a regression.

### R10 — the `knownSkills` list is guidance, not a whitelist

**Chosen 2026-09-20.** Today the prompt allows an architectural style or named
practice **only** when it appears verbatim in `knownSkills`, and forbids minting
a new one outright. That rule was added to stop invented practices, and it
worked — but it also froze the taxonomy: nothing new can enter through
extraction, so the list only ever grows by hand.

**New rule to write:** the model may trust `knownSkills` as the canonical
spelling and should prefer it, and may emit a genuinely new name when the
posting really requires something the list does not contain. The bar stays on
what a skill *is* — a concrete technology, tool, or an established named
practice — not on membership in the list.

**Why this needs care rather than a one-line edit.** `node_stats` counts
**NEW and VERIFIED nodes alike** — only HIDDEN is excluded — so anything the
extractor mints immediately enters the IDF weights, and a typo or a one-off
phrase lands as a rare, high-weight node. That is the exact failure the fat-tail
smoothing constant K=5 exists to dampen, and loosening the rule pushes more
traffic through it. Before this ships: measure how many distinct NEW nodes one
batch mints, and be ready to keep a lighter guard (for example: a new name must
look like a product or technology name, never a sentence or a duty).

**Consequence.** This is a third corpus pass in waiting, not part of Pass 2 —
it moves `specHash` on its own. Fold it in with a re-extraction that is already
being paid for, exactly as the ROLE cleanup is meant to ride along (§7).

---

## 4. Extraction contract

`extract-vacancy.baml`. Shipped twice: as an additive `alternatives` overlay
(PR #219, 2026-09-20), then **replaced the same day** by the shape below, after
the overlay measured at 5 of 23 binary choices (measurement log).

```baml
class SkillRequirement {
  anyOf string[]   // one requirement; almost always one entry
}

class Skills {
  required SkillRequirement[]   // MAX 20 requirements
  optional SkillRequirement[]   // MAX 10 requirements
}
```

Why this shape and not the overlay it replaced:

- `alternatives` asked the model to restate, as pairs, names it had already
  written into a flat list. That second pass over a finished answer is the one
  that gets skipped, and `alternatives: []` is schema-valid, so nothing failed
  loudly. With `anyOf` native there is no second pass to skip.
- One entity fewer, not one more. Every existing consumer of `skills.required`
  reads it through the loader, which is the only code that touches the field.
- `optional` carries requirements too (owner's call, 2026-09-20). R2 is
  unchanged — the loader still numbers `required` only — but a nice-to-have
  choice is now expressible, and the golden set can score it.
- Members can no longer name a skill outside the posting's own list: the
  members ARE the list.

Prompt rules that ride with it — the v2 file's alternative rules, plus an
explicit slash-pair rule worth 5 more binary groups on its own:

```
- One logical choice is one list: "AWS or GCP", "one of A/B", "A and/or B",
  "any framework: A, B, C".
- A slash joins a choice whenever each side is a skill on its own, spaces or
  not: EDR/XDR, MDM/UEM, ETL / ELT, C/C++, RF/Microwave. Never emit the
  slashed string as one name, never split it into two requirements.
  A slash inside one established name — CI/CD, TCP/IP — is one skill.
- A comma-separated stack is cumulative unless the text marks it as a choice.
- Never split one choice into one-entry requirements; never merge two
  separate statements.
```

---

## 5. Resolution and storage

### 5.1 Schema

```sql
ALTER TABLE vacancy_nodes ADD COLUMN requirement_group smallint;
```

and `requirement_group` added to the `position_nodes` view.

`NULL` = a standalone requirement = every row that exists today.

**Why a column and not a `vacancy_requirements` table.** The fact being stored is
"which of this vacancy's existing links are one choice" — a partition of rows
that already exist. A table would add a join and an FK and carry no fact the
column does not. If a requirement ever needs its own attributes (depth, hard
gate), that is when it earns a table.

**Why `smallint`.** The value is an index within one vacancy; the corpus maximum
is 44 skills on a single posting.

### 5.2 Loader

`resolveSkillLinks` in `vacancy-loader.service.ts` already dedupes by resolved
node and lets required win over optional. It gains one step: resolve each group's
names to node ids, then stamp the group number onto those links.

```
for each required requirement r (in extraction order):
  ids = distinct(resolve(name) for name in r.anyOf)
  if |ids| < 2:                              # an ordinary flat requirement,
    continue                                 # including one aliased onto one node
  if any id already carries a group:         # I2 disjoint
    drop the number, keep the links          # reason: overlapping
  else: link[id].requirementGroup = next number
```

The loader reads both shapes, permanently. `rss_records.extractedData` keeps
whatever contract wrote it, and only canonical postings are ever re-extracted
(the stale query joins `unique_vacancies`), so a duplicate's record keeps flat
names forever. Without that read, any later load of an old record — the
loader backfill's extracted-but-never-loaded set, or a manual reload — would
resolve zero skills and store a vacancy with none, silently.

Three of the four drop reasons the overlay needed are unreachable under the
reshaped contract and were removed with it: `unknown-member` and
`optional-member` cannot happen when the members are the required list itself,
and `too-few-members` is not a failure but the ordinary flat case. Only
`overlapping` is left, and it still drops the number rather than the
extraction (I1).

Every rule is a **drop of the offending group, never of the extraction**. A
malformed overlay degrades to today's flat behaviour (I1). Log the drop *with its
reason* and the vacancy id — §8's tripwires depend on separating benign drops
(optional-only, alias-collapsed) from confused ones (overlapping groups).

`SkillLink` gains `requirementGroup?: number`; `replaceSkills` writes it. That
method is `DELETE` + `INSERT` for the whole vacancy, so re-extraction rewrites
group numbering wholesale and no stale group can survive.

---

## 6. Scoring

Coverage is implemented in **two** places, not one (§6.3). Both must collapse or
I5 breaks. Start with `score.sql.ts`: today `scoringCtes` aggregates over link
rows, and it gains one CTE that collapses rows into **requirement units** before
the per-Position aggregate:

```sql
unit AS (
  SELECT pn.position_id,
         coalesce(pn.requirement_group::text, 'n' || pn.node_id::text) AS unit,
         pn.is_required,
         min(ns.weight)                        AS w,
         bool_or(c.node_id IS NOT NULL)        AS matched,
         bool_or(tm.is_core AND tm.stack IS NOT NULL)            AS concrete_core,
         bool_or(tm.is_core AND tm.stack IN (SELECT stack FROM css)) AS instack_core
  FROM position_nodes pn
  JOIN node_stats ns ON ns.node_id = pn.node_id
  LEFT JOIN cand c ON c.node_id = pn.node_id
  LEFT JOIN node_tech_meta tm ON tm.node_id = pn.node_id
  GROUP BY 1, 2, 3
)
```

`agg` then aggregates `unit` instead of `position_nodes`, with `SUM(w)` over
units, `count(*)` over units, and `bool_or` lifted one level. An ungrouped row
becomes a unit of one, so its `min(w)` is its own weight and nothing about it
changes (I1).

### 6.1 Group weight — `MIN`, per R3

Full reasoning and accepted cost are in R3 (§3) — this is the single easiest
place to get it backwards, so read that before touching this CTE. The absolute
value matters less than I5: numerator and denominator both take the unit's `w`,
so a matched group contributes exactly the weight it removes from the
denominator.

### 6.2 What moves

- `coverage` — a matched alternative now covers the whole choice. This is the
  point of the change.
- `required_total` — counts units, so the UI's "3 of 8 required" starts counting
  choices. More honest, and visible to users.
- `relevance` (the sort key) — collapses too, per R4.
- `FIT_STRONG_MIN` / `FIT_GOOD_MIN` — the denominator shifts corpus-wide, so
  these stop being calibrated. Re-eyeball them on the new coverage distribution
  in Pass 2 (§7, Pass 2 step 6). They are documented in `ranking.contract.ts`
  as v1 expert guesses with no ground truth, so this is a re-guess on better
  data, not a regression from a known-good value.

### 6.3 The second coverage implementation — fixed per R6

`recommendation.service.ts` does **not** call `scoringCtes`. Its `vreq` / `vcov`
CTEs re-derive `required_total_w` and `matched_required_w` with the same formula,
and `unlock` then computes `(matched_required_w + vr.weight) / required_total_w`
for each missing required skill.

Left alone, this produces the same class of wrong recommendation the Playwright →
Cypress bug is: **"learn Azure" to a candidate who already has AWS**, because
Azure still reads as a missing required skill that lifts coverage. Two changes:

- `vreq` collapses to units exactly as `unit` does above.
- a skill whose unit is already satisfied is not an unlock candidate at all, and
  a skill in an unsatisfied group adds the *unit's* weight, never its own.

Both call sites import one shared CTE (R6) rather than duplicating the `unit`
logic a second time.

### 6.4 Exclusion — fixed per R5

`feed.service.ts:726` drops a Position when **any** required node is excluded.
Rule going forward: exclude only when every member of the unit is excluded.
Same fix applies to `subscription-matcher.service.ts`, which reads the same
params for digests.

### 6.5 SkillDiff — deferred per R8

An unmatched group puts all its members into `diff.missing`, so a user sees three
red chips for one choice — cosmetically the exact complaint this change fixes.
The fix: carry the group id out on `SkillRef` and render one chip
`AWS / Azure / GCP`. Not in this release (R8) — the numbers are right in Pass 2
and only the chip list stays noisy until the follow-up.

---

## 7. Plan

Two corpus passes, per R1. Pass 1 widens what gets extracted; Pass 2 restructures
how it scores. Start Pass 2 only after Pass 1's shift has been observed and looks
sane — that's the entire point of splitting them.

### Pass 1 — widen extraction (cap raise + concepts)

**Start here.** Scope is the cap raise and the EXCLUDE-list split, nothing else.
The role cleanup below is deferred (decided 2026-09-19) — it is measured, not
scheduled.

| | |
|---|---|
| Baseline, already taken | `apps/etl/src/eval/runs/2026-09-19-production-DeepSeekClient.*` — F1 57.2%, recall 49.9%, precision 69.6%, `or_split` 13, profile 96.1% |
| What to watch | **recall against precision.** Recall should rise; precision is the risk the cap raise buys it with. |
| After step 4 | `pnpm eval --extractor production`, compare to that baseline |
| Do not touch | `FIT_STRONG_MIN` / `FIT_GOOD_MIN` — Pass 2 moves the same numbers again |

The golden set stays at its current 25 rows; postings with unsettled roles are
deliberately not added to it, so the eval is not blocked on the role question.

Editing `extract-vacancy.baml` moves `BAML_PRODUCTION_SOURCE_HASH`, hence
`specHash`, hence every row of `extraction_artifacts`. The full re-extraction in
step 3 is that, and it is intended here rather than accidental. Roughly $7 over
18k postings at the cached-input rate.

Shared with `taxonomy-implication-graph.md` Phase C (its EXCLUDE-list split for
recovered concepts is the same kind of change: touches `extract-vacancy.baml`,
moves `node_stats` broadly, no code-gated behaviour change).

#### The ROLE cleanup — deferred, but measured

Not part of Pass 1. Recorded here because when it does happen it should ride
along with a re-extraction that is already paid for: `identity()` hashes every
VERIFIED role, domain and skill into `taxonomyHash`, which feeds `specHash`,
which keys `extraction_artifacts` — so hiding a single role re-extracts the whole
corpus exactly as the cap raise does. On its own it costs a second full pass.

Measured on the corpus (`_done/local-eval.md`): 100 VERIFIED roles, of which the 30
the v2 contract intends already exist and already carry 12,921 of 14,904
positions. The other 70 carry 1,754, and 37 of them carry none at all — those
are pure prompt noise and hide with no data migration. The work that needs a
decision is concentrated:

| positions | role | intended target |
|---|---|---|
| 940 | QA Engineer | **stays** — decided 2026-09-19, see below |
| 156 | Solutions Architect | architect is a modifier, not a discipline |
| 122 | Team Lead | the underlying discipline |
| 114 | Software Architect | the underlying discipline |
| 85 | Tech Lead | the underlying discipline |
| 76 | Systems Engineer | Systems Administrator / DevOps Engineer |
| 75 | BI Developer | Data Analyst / Data Engineer |
| 39 | Mobile Developer | Android / iOS / Cross-platform |
| 39 | CTO | v2 has no C-level role |

**`QA Engineer` stays as a discipline** (decided 2026-09-19). It is more than half
the role work and genuinely ambiguous — a posting often does not say whether it
means automation or manual — so splitting 940 positions would invent a
distinction the source does not make. The target list is therefore 31, not 30,
and those 940 positions need no migration at all.

Consequence to settle before Pass 1 ships: the eval's `RequirementsV2Role` enum
and the golden-set labels still use the closed list of 30. Either the enum gains
`QA_ENGINEER` and the affected labels are reviewed, or the eval keeps reporting a
mismatch that is now a deliberate divergence rather than a defect.

**Settled 2026-09-19: the divergence is deliberate, the enum is not changed.**
`extract-vacancy-requirements-v2.baml:11` keeps `AUTOMATION_QA_ENGINEER` and
`MANUAL_QA_ENGINEER` and gains no flat `QA_ENGINEER`. Two reasons. The enum and
the labels belong to the **v2 eval contract**, not to production `ExtractVacancy`
— the production role list comes from the database taxonomy — so the 940
positions the discipline decision protects are untouched either way. And adding
the member moves golden-set labels, which are ground truth: that is its own
review, and doing it inside Pass 1 would make the recall/precision comparison
read against a moved baseline.

The cost of settling it this way is confined to one number: `role accuracy` on
`--extractor production` (52.0% at baseline) keeps counting every QA posting as a
mismatch. It was already not the metric Pass 1 watches. Do not read a `role
accuracy` move as a result of the cap raise; revisit the enum with the rest of
the ROLE cleanup, on its own re-extraction.

The eval's `role accuracy` of 52% on the production extractor is mostly the
100-role overlap rather than misclassification, and it is the number to
re-measure afterwards.

| # | Step | Reversible |
|---|---|---|
| 1 | BAML: raise `required` cap 10 → 20, `optional` 5 → 10; fold in Phase C's EXCLUDE-list split. **Done 2026-09-19** — the caps moved in `extract-vacancy.baml`; the EXCLUDE-list split needed no work, C1 + C2 were already the standing text there ("extract one ONLY when … appears VERBATIM in `knownSkills`" + "never mint a new practice"). `BAML_PRODUCTION_SOURCE_HASH` → `6fa929fd…`. | git |
| 2 | `scripts/db-backup.sh`, then pause Temporal schedules (`scripts/temporal-schedules.ts pause`). | — |
| 3 | Re-extract the corpus. New `spec_hash`, every artifact re-runs. ~18k postings; `usage` shows `in: 7074` of which `cached: 6528` (taxonomy prefix cached) — tens of dollars on `deepseek-v4-flash`. | data only; the backup |
| 4 | Refresh `node_stats` and `node_skill_cooc`. **Observe the new coverage distribution before touching `FIT_STRONG_MIN`/`FIT_GOOD_MIN`** — Pass 2 shifts the same numbers again, so recalibrating twice in one initiative is wasted motion unless Pass 1 alone looks broken (§11). | git |
| 5 | Resume schedules. | — |

This pass is fully visible to users the moment step 3 lands: more required
skills per vacancy changes `node_stats` df for every skill, which moves coverage
and relevance for everyone. It is not code-gated — there is no "flip a switch"
step here.

#### Re-extraction depth — settled 2026-09-19

**First batch target: positions first loaded on or after 2026-08-19** (roughly a
month back, ~2.5–3k positions, under a dollar). The date is a target for how
deep to go, not a constant anywhere in the code: **the IDF cutoff is derived in
SQL from what has actually been re-extracted**, so the window can only ever
describe real corpus state, never promise one that was not paid for.

The steps below still read as a corpus-wide migration with a backup and a
schedule pause around it. That framing came from an estimate of "tens of
dollars" that the measured numbers do not support: at $0.0001 per call the whole
canonical corpus is $1.7–4. Treat those steps as proportionate to that, not to a
migration — the worst realistic outcome is that `FIT_STRONG_MIN` /
`FIT_GOOD_MIN` need retuning, which is a code change against untouched data.

One rule is not caution and does hold: **no taxonomy edits while a batch runs.**
`taxonomyHash` feeds `specHash`, so verifying a single node mid-run turns every
artifact already paid for into a cache miss. That is the only way this gets
expensive.

If the first batch behaves, there is no reason to stop at a window. A full
re-extraction makes the corpus homogeneous and **removes the need for a windowed
`node_stats` entirely** — the window exists only to keep a *partial*
re-extraction internally consistent, and at this price partial is a choice, not
a constraint.

### Pass 2 — structure requirements (alternatives / requirement_group)

| # | Step | Reversible |
|---|---|---|
| 1 | `pnpm db:generate` migration: `requirement_group` column + `position_nodes` view. Deploy. Nothing writes it yet, nothing reads it. **Done 2026-09-20** (PR #218, migration `0058`) — hand-edited to `CREATE OR REPLACE VIEW`: the generated `DROP VIEW` fails, `node_stats`, `node_skill_cooc` and both track views depend on it. | drop column |
| 2 | BAML: `SkillGroup` + `alternatives` (§4). Verify codegen round-trips (§11). **Done 2026-09-20** — codegen round-trips, §11.1 closed; `BAML_PRODUCTION_SOURCE_HASH` → `4f089c9a…`. | git |
| 3 | Loader: resolve + stamp groups, the three drop rules (§5.2). Unit-test each. **Done 2026-09-20** — four reasons, not three: a member outside this posting's skills is its own case, because group names are matched against already-resolved links and never resolve a node of their own. | git |
| 4 | `scripts/db-backup.sh`, then pause Temporal schedules. | — |
| 5 | Re-extract the corpus again. New `spec_hash` (the BAML contract changed again). **Done 2026-09-21** — 2 959 postings (`since=2026-08-19`), 88 min, ~$1 billed, 0 failures. Jenkins coverage in the window 71.1% → 93.0%. | data only; the backup |
| 6 | Refresh `node_stats` and `node_skill_cooc`. Re-set `FIT_STRONG_MIN` / `FIT_GOOD_MIN` on the now-settled distribution. | git |
| 7 | Switch `scoringCtes` **and** `recommendation.service.ts` to units (§6.3, R6), and the exclusion predicate to unit semantics (§6.4, R5). **This is the step that changes user-visible Fit for this pass.** | git revert, data untouched |
| 8 | Resume schedules. Check the tripwires in §8.2. | — |

Because the passes are split (R1), a regression after Pass 2 step 8 is
attributable: revert Pass 2 step 7 first (pure code revert, data untouched). If
Fit still looks wrong afterward, the cause is Pass 1, and the only way back is
the Pass 1 step 2 backup — Pass 1's shift lives in the data, not behind a flag.

### Verification

The eval this section assumes now exists and runs from disk — `pnpm eval`, see
`local-eval.md`. Baselines were taken before any of this ships:

| | production, before Pass 1 |
|---|---|
| F1 | 57.2% |
| recall | 49.9% (10 of 25 rows need more than its 10 + 5 cap) |
| or_split_errors | 13 of 25 rows |
| role accuracy | 52.0% |
| profile fields | 96.1% of 51 checked |

The measurement log — every run, its numbers and how to read them — lives in
[`requirement-groups-measurements.md`](requirement-groups-measurements.md). This
file keeps the plan and the decisions; that one keeps the evidence.

- **Before Pass 2 step 5**, run the new contract over the golden set
  (`apps/etl/src/eval/`) and compare groups against the hand-labelled `anyOf`
  entries — 32 MUST groups in the 29-row set after R9, all of them reachable
  (R2). Done three times already; see the measurement log.
- **Release gate (R7):** approve only the rows carrying a MUST group — 16 of the
  current 29 — and do it immediately before Pass 2 ships wide, because
  approving narrows the summary to approved rows. The rest stay draft: they test
  the already-shipped contract, not this feature.
- **After Pass 2 step 7**, the metric is how many Positions changed Fit tier, not
  skill accuracy. Expect movement concentrated in DevOps / Security / SysAdmin —
  the roles with both the highest cap saturation (48% / 42% / 40%) and the
  substitute families.

---

## 7a. Where this stands — 2026-09-20

**Shipped to prod.** `vacancy_nodes.requirement_group` + the column on the
`position_nodes` view (PR #218, migration `0058`). Deployed, verified on prod,
0 rows grouped — nothing user-visible moved. The migration is hand-written:
drizzle-kit's `DROP VIEW` + `CREATE VIEW` fails because four objects depend on
that view, so it is `CREATE OR REPLACE`. **Any future change to `position_nodes`,
`positions` or `postings` hits the same trap.** Shipped alongside: `seo-audit.yml`
no longer pins a pnpm version against `packageManager` (it had been failing on
every branch, including `main`).

**Merged 2026-09-20 (PR #219, `5291ceb`).** Extraction (`SkillGroup` +
`Skills.alternatives` + three prompt examples), the loader (stamping, four drop
reasons, members matched by alias-normalized name so a group can never mint a
node), `reextractWorkflow`, and the eval adapter. Nothing in it changes a
user-visible number: the field is written, no scorer reads it. `specHash` is
`dcb8e6cc…`. No migration rode with it, so the deploy moved nothing. New
postings extracted from here on carry groups; the existing corpus does not
until it is re-extracted.

**The contract was reshaped the same day, on `feat/skills-anyof-contract`.**
`Skills.required`/`optional` are lists of `anyOf` requirements and
`alternatives` is gone (§4); the loader numbers a choice as it resolves it and
keeps one drop rule instead of four (§5.2); `adaptLegacySkills` is gone from the
eval, so both extractors now measure the same object. Three passes each on the
29 rows: binary grouping 5 → 10 on the reshape, → 15 of 23 with the slash-pair
rule, `or_split_errors` 21.3 → 6.7, F1 61.5% → 67.4%. Nothing re-extracted,
nothing merged: `BAML_PRODUCTION_SOURCE_HASH` moves, so merging is a deploy and
the owner's call.

**The corpus pass ran 2026-09-21 (Pass 2 step 5).** 2 959 canonical postings —
the last month — re-extracted on prod in 88 minutes for about $1 billed, zero
failed artifacts, after a verified 332 MB dump taken through the Postgres
container. In the window: required links 21 534 → 28 778, postings with no
skills 53 → 13, 2 106 groups over 42% of postings (mean size 2.51, max 9), and
**Jenkins coverage 71.1% → 93.0%** — the number this tracker was named after.
Five groups were read against their postings' own words and all five are right,
including the nine-member one. Corpus-wide coverage moves less (Jenkins 52.9% →
56.4%) simply because 18% of 16 169 postings has been re-extracted so far.
The open item this created is minting: 271 new nodes, roughly one in eight not
a skill (roles, duties, metrics, certifications). Details and tables in the
measurement log.

**Rehearsed 2026-09-20, on 60 postings of the local dev database.** The first
hand-start of `reextractWorkflow` failed outright — `CachedVacancyExtractor`
had no `identity()`, so the stale-posting query could not ask for the current
`specHash` and the workflow died on its first activity. Fixed on
`feat/skills-anyof-contract`. With the fix the whole path runs: 39 groups over
22 of 60 postings, mean size 2.44, zero `overlapping` drops, 4 new nodes
minted, `node_stats` refreshed. Every §8.2 tripwire is inside its band. The
corpus pass itself is still not started.

**Not started.** The corpus re-extraction — the workflow has no schedule and no
endpoint, it starts by hand. Depth is settled 2026-09-20: the **2026-08-19
batch** (~2.5–3k positions, $0.30–0.75), not the whole corpus, so the windowed
`node_stats` cutoff stays in play. Pass 2 step 7 (switching `scoringCtes`,
`recommendation.service.ts` and the exclusion predicate to units) is a separate
commit and a separate deploy, and it is the only step that moves Fit.

**The order changed on 2026-09-20, after measuring it.** Three runs over the
same 29 rows showed the *contract shape* under-groups, not the model: changing
the contract is worth +4.1 F1 and +7 MUST groups, changing the model +1.5 and
+1, and both models miss the same eleven two-member choices. `alternatives` is
a second pass over an answer already written, and it is the pass that gets
skipped — production produces 5 of 23 binary groups where the `anyOf`-native v2
contract produces 12. The corpus pass therefore waits on reshaping `Skills`
around `anyOf`; paying for a re-extraction that still under-groups by half buys
half the feature. Same runs priced the deferred ROLE cleanup at ~37 points of
role accuracy, and showed minting tracks the prompt rather than the model.
Numbers and mechanism in the measurement log.

**Working order from here.** Reshape the contract, then the ROLE list, iterating
each on the golden set at a cent a run until the numbers stop moving; then ONE
corpus pass with the final prompt; then step 7. Every one of those moves
`specHash`, so iterating them on the cheap ruler first is what keeps R1's
attribution without paying for a corpus pass per change.

**Spent so far:** about six cents, seven golden-set runs. The corpus batch from
2026-08-19 is $0.30–0.75; the whole canonical corpus is $1.7–4.

**R9 is done 2026-09-20.** The golden set is 29 rows with 32 MUST groups and a
new baseline; the R7 gate is 16 rows, not 9.

**Decided but not yet built:** R10 (`knownSkills` becomes guidance rather than a
whitelist). R10 moves `specHash` on its own, and the owner decided 2026-09-20 to
**fold it into the same re-extraction** as the groups rather than pay for a
separate pass. That bundles two changes into one measurement — accepted against
R1's default — so the count of distinct NEW nodes minted by the first batch is
the tripwire that tells the two apart, and it is measured before `node_stats`
is refreshed.

**The one rule that costs money if broken:** no taxonomy edits while a batch
runs. Verifying a single node moves `taxonomyHash` → `specHash`, and every
artifact already paid for becomes a cache miss.


## 8. Risks, measured

### 8.1 What the change does, simulated

Run on the same local restore, over all 35 real candidates × every Position they
score against (253 435 pairs), collapsing the six known substitute families:

| | |
|---|---|
| pairs changing Fit tier | **6.83%** |
| promoted | 12 945 (5.1%) |
| demoted | 4 371 (1.7%) |
| mean coverage delta | **+2.52pp** |

**Demotions are correct, not a bug.** A candidate holding all three clouds used to
collect three weights in the numerator for one choice. Collapsing removes that
inflated credit, and since coverage is a fraction below 1, removing equal amounts
from numerator and denominator lowers it. Expect to see demotions and do not
"fix" them.

### 8.2 The real failure mode: over-grouping

Under-grouping degrades to today. **Over-grouping inflates Fit corpus-wide**, and
that is the direction that damages the product — the feed fills with false STRONG
and the user stops trusting the badge.

Simulated worst case, the model grouping every same-`(category, stack)` required
skill:

| | intended | over-grouped |
|---|---|---|
| pairs changing tier | 6.83% | **14.13%** |
| mean coverage delta | +2.52pp | **+8.51pp** |
| share of pairs at STRONG | 3.34% → ~3.4% | 3.34% → **7.01%** |

STRONG doubling is the signature. Tripwires after Pass 2 step 5, before Pass 2
step 7 ships wide:

- **Share of scored pairs at STRONG.** Baseline 3.34%. Materially above ~4% means
  over-grouping, not a better matcher.
- **Mean group size.** Golden set says **2.55**, max 5. A mean above ~3 means the
  model is collapsing stacks, not choices.
- **Share of postings with ≥1 MUST group.** Golden set says **40%** (48% counting
  optional groups). This is much higher than the 10.2% of the corpus that shows
  surplus substitutes today, because most groups are pairs the extractor already
  collapses to one name. A rate far above 50% is suspicious; a rate near 0 means
  the field is being ignored.
- **Group-drop rate by reason** (§5.2). Separate the benign from the signal:
  groups dropped for being `optional` are expected — 8 of the 22 golden groups are
  optional-only and R2/I2 discard them by design. Groups dropped for
  `<2 nodes after resolution` are also benign (alias collapse). Groups dropped for
  *overlap* mean the model is confused and the rate should be near zero.

### 8.3 Smaller things that will bite

- **`node_skill_cooc` counts intra-group pairs**, so grouping does not fix the
  co-occurrence view — "Playwright or Cypress" still registers as co-occurrence.
  Excluding same-group pairs is a follow-up (§9), not part of this change.
- **A group spanning two real axes** ("Kubernetes or Terraform" written loosely by
  a recruiter) collapses two genuinely different requirements. Nothing detects
  this. It is rare and self-limiting, and the alternative — second-guessing the
  posting — violates G4.

## 9. Where this goes next

**Immediately unblocked, small:**

- Rewrite the substitute gate in `recommendation.service.ts` against
  `requirement_group` instead of `npmi` — fixes Playwright → Cypress (§0).
- Exclude same-group pairs from `node_skill_cooc`. Groups are ground truth about
  which co-occurrences are choices, so removing them should sharpen every `npmi`
  the implication miner reads. Measure the shift on the pairs in §0 before
  assuming it helps.
- Ship the SkillDiff single-chip rendering deferred in R8.

**The next real capability.** Groups are the first per-vacancy fact about a
*requirement* rather than about a skill. Once they exist and the drop rate is
low, the same overlay pattern extends without a schema rewrite:

- a `hard_gate` flag on a unit — "no Kubernetes, no interview" — which is a veto,
  not coverage, and therefore does not need a candidate-side counterpart;
- `depth` on a unit, if the corpus shows postings distinguishing "familiar with"
  from "deep";
- competencies, but as filters or vetoes only, and only once
  `extract-candidate.baml` can emit them (§10).

Each is another nullable column on the same rows, gated the same way. That is the
point of storing a partition instead of an object: the object can arrive later,
made of columns that earned their place one at a time, instead of being guessed
up front.

**What would make this obsolete.** If the extractor ever becomes reliable enough
to emit requirements as first-class objects with stable identity, groups become a
degenerate case of that. Nothing here blocks it — `requirement_group` is a
partition label, and a real requirement table would simply absorb it.

---

## 10. Rejected

- **A nested `Requirement` object replacing the flat skill list.** Breaks I1 and
  every consumer of `skills.required` (feed, digest, SEO job-posting, skill-diff)
  for one fact that an overlay carries.
- **A `Competency` enum for requirements with no named technology.** Matching is
  two-sided. `extract-candidate.baml` draws from the same `knownSkills`, so a CV
  cannot produce a competency; every MUST competency would be an uncoverable
  denominator, making hardware and QA fits *worse*. Revisit only as a filter or
  veto, never as coverage, and only after the candidate side can emit them.
- **An `axis` column on the skill directory.** It exists:
  `node_tech_meta.category` + `stack`. The real debt is that `stack` is filled on
  321 of 1224 classified nodes, which is why the ADR-0010 gates silently pass most
  skills. That is a backfill, not a schema change.
- **Mining alternatives from co-occurrence.** §0.
- **`model` / `version` columns on extraction rows.** `extraction_artifacts`
  already carries `model`, `provider`, `baml_version`, `baml_source_hash`,
  `spec_hash`, `taxonomy_hash`.

---

## 11. Open

All ten design questions are resolved in §3. What is left is execution and
sequencing:

1. ~~`SkillGroup[]` must round-trip through `baml_client` codegen~~ — **closed
   2026-09-20.** Codegen emits the interface and the field, `b.parse` parses a
   response carrying groups, and a response omitting the field coerces to `[]`
   rather than failing. No `string[][]` fallback needed.
2. ~~**How far to push the grouping prompt**~~ — **closed 2026-09-20.** The
   ceiling was the class shape, not the wording. Reshaping `Skills` around
   `anyOf` took binary grouping 5 → 10 of 23, and the slash-pair rule measured
   separately on top of it took it to 15. What is left is eight misses, of
   which one is a naming mismatch and one a disputed label; the rest are
   ordinary recall, not a contract defect. Pushing the prompt further is no
   longer the lever — a corpus pass is.
3. **Whether Pass 1 alone shifts `FIT_STRONG_MIN`/`FIT_GOOD_MIN`** enough to
   need an interim recalibration, or whether the single recalibration after
   Pass 2 (§7, Pass 2 step 6) is enough. Decide on the corpus, not in advance —
   the "before" distribution is in the measurement log.
4. ~~**Sequencing R9 and R10 against the corpus pass.**~~ R9 is done. R10 is
   written and held (PR #221). The owner chose to fold R10 into the same
   re-extraction; the measurement afterwards argues for detaching it — an
   unconstrained prompt mints 95 names with no taxonomy node out of 559 against
   2 of 389 with the list, and no model choice avoids it. Bundling it with the
   contract reshape means one measurement covering two changes, which is what
   R1 exists to prevent. Owner's call, now with a number on it.
5. **428 canonical postings carry no skills at all.** Found while measuring
   coverage, unexamined.
