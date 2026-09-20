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

Eight questions came up while designing this. All eight are decided; each row
says what was chosen and what that choice costs or unlocks. Nothing here is
provisional — treat these as settled unless new evidence shows up.

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

### R7 — golden-set approval covers only the 10 rows with a MUST group

**Chosen**, over approving all 25 or shipping ungated.

**Why.** Pass 2's release gate should cover exactly what Pass 2 changes. The
other 15 golden rows judge general extraction quality (role, seniority, plain
skills) — a different, already-shipped contract — and approving them buys
nothing for this feature. Per `apps/etl/src/eval/README.md`, only approved rows
participate in a release gate; a draft-only run never passes one.

**Consequence.** Pass 2 has a real, if narrow, release gate. Pass 1 (cap raise +
concepts) has no comparable golden-set gate today, and this decision does not
add one for it — that stays a follow-up if Pass 1's shift looks concerning.

### R8 — the SkillDiff single-chip rendering (`AWS / Azure / GCP` as one chip
instead of three) ships in the **next** release, not this one

**Chosen.** Pass 2 fixes the number (a fully-covered choice now reads 100% /
STRONG); the chip list still shows three red entries for one unmet choice,
which is cosmetically the same complaint that motivated this whole tracker.

**Consequence.** This is a real, visible loose end, not a silently dropped
detail — flagged here so it doesn't quietly fall off after Pass 2 ships. Carry
the group id out on `SkillRef` and collapse it in the renderer when this is
picked up (§6.5).

---

## 4. Extraction contract

`extract-vacancy.baml`, additive. `required` and `optional` keep their current
shape and rules. This ships in **Pass 2** (R1).

```baml
class SkillGroup {
  anyOf string[] @description(#"
    2+ names from `required` that the posting states as ONE choice
    ("AWS or GCP", "one of Kafka / RabbitMQ / NATS"). Copy the names exactly
    as written in `required`. A comma-separated stack that the posting wants
    cumulatively is NOT a group.
  "#)
}
```

added to `class Skills`:

```baml
  alternatives SkillGroup[] @description(#"
    Every explicit choice among REQUIRED skills, one entry per choice.
    Each name must also appear in `required` — this field groups them, it does
    not replace them. Never group `optional`. [] when the posting states no
    choice.
  "#)
```

Notes on why this shape:

- Members stay in `required`, so the cap raised in Pass 1 still counts them
  individually and every existing consumer of `skills.required` is untouched
  (I1, I2).
- A class rather than `string[][]` — self-documenting, and it does not depend on
  BAML's nested-array support. **Verify `SkillGroup[]` round-trips through
  `baml_client` codegen before writing the loader** — this is the one unresolved
  execution risk in the whole plan (§11).
- The model has already demonstrated this capability: the v2 eval contract
  (`extract-vacancy-requirements-v2.baml`) has an `anyOf` field, and the golden
  set carries 22 hand-labelled groups.

Prompt additions — reuse the rules already written and validated in the v2 file,
they are the same problem:

```
- Preserve one logical choice as one group: "AWS or GCP", "one of A/B",
  "A and/or B", "any framework: A, B, C".
- A comma-separated stack is cumulative unless the text marks it as a choice.
- Never split one choice into singletons; never merge two separate statements.
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
for each group g (index i, 1-based):
  ids = distinct(resolve(name) for name in g.anyOf)
  drop g if |ids| < 2                        # I4
  drop g if any id already carries a group   # I2 disjoint
  drop g if any id is not required           # I2 / I6 — this is where R2's
                                              # optional-only groups get dropped
  else: link[id].requirementGroup = i
```

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
| 5 | Re-extract the corpus again. New `spec_hash` (the BAML contract changed again). | data only; the backup |
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

#### Measured 2026-09-19, prompt only — the cap raise works

Taken before any corpus touch: the golden set is the whole measurement, so this
cost about a cent and needed no backup, no schedule pause and no prod access.
`pnpm eval --extractor production --repeat 3`, run against the same alias
snapshot `3b8a5cb4bc70` as the baseline.
`runs/2026-09-19-production-DeepSeekClient-cap20.*`.

| metric | before | after | delta | per-pass spread |
|---|---|---|---|---|
| recall | 49.9% | **55.4%** | **+5.4** | 0.9 |
| precision | 69.6% | 68.5% | −1.1 | 1.3 |
| F1 | 57.2% | **60.2%** | **+3.0** | 0.4 |
| or_split_errors | 13 | 16 | +3 | — |
| role accuracy | 52.0% | 53.3% | +1.3 | — |
| profile fields | 96.1% | 95.4% | −0.7 | — |

Read it against the spread, which is this run's own noise estimate: **recall
moved 6x its noise band, so it is real. Precision moved less than its noise
band, so on this evidence the cap raise did not measurably cost precision** —
which is not the same as "cost nothing", only that 25 rows cannot resolve a
movement this small. F1 is a genuine gain either way.

Two things this does not measure, both by construction. It says nothing about
`node_stats`, coverage or Fit — those need the corpus, and the corpus is
untouched. And `or_split_errors` got worse (13 → 16): more slots means less
pressure to collapse "A or B" into one entry, so Pass 2 inherits a slightly
bigger problem than the baseline suggested. That is the contract Pass 2 exists
to fix, not a regression to chase here.

Two things that pass carries: reasoning removes OR splitting entirely on the same
model (`or_split` 2.7 → 0.0 for 5x the cost), and the `profile` labels exist so a
prompt edit aimed at skills cannot silently move work format or English level.

#### Measured 2026-09-20, prompt only — grouping works, the model is shy

`pnpm eval --extractor production --repeat 3`, same alias snapshot
`3b8a5cb4bc70`, same taxonomy, 75 provider calls for under a cent.
`runs/2026-09-20-production-DeepSeekClient.*`. The golden set was not touched:
no label, `metadata` or alias entry moved, so this reads against the cap-raise
baseline directly.

| metric | cap20 | with groups | delta | this run's spread |
|---|---|---|---|---|
| precision | 68.5% | 73.6% | +5.1 | 4.0 |
| recall | 55.4% | 55.6% | +0.2 | 2.7 |
| F1 | 60.2% | 62.2% | +2.0 | 2.1 |
| or_split_errors | 16 | **8.7** | **−7.3** | 3.0 |
| alternative accuracy | 55.8% | 56.0% | +0.2 | — |
| priority accuracy | 96.9% | 98.4% | +1.5 | — |
| profile fields | 95.4% | 95.4% | 0 | — |

**`or_split_errors` is the only metric that moved past its own noise**, and it is
the one this pass exists to move: 16 → 8.7 against a spread of 3.0. Precision
rose 5.1 against a spread of 4.0 — marginal, and mechanically expected rather
than earned: a group's members stop emitting one clause each, so a correctly
grouped choice removes two or three "extra" clauses from the actual set. F1's
+2.0 sits inside its 2.1 spread. **Recall did not move, which is what mattered
to watch**: the grouping instructions did not cost the cap raise's +5.4.

`alternative accuracy` barely moves by construction and should not be read as
the result: it is the share of *all* expected clauses whose `anyOf` set matched,
and ~90% of them are single-entry, which match trivially. The group-level number
has to be counted separately:

| | cap20 | with groups |
|---|---|---|
| labelled group clauses reproduced exactly | 0 of 22 | 5 of 22 |
| of the 14 that are MUST (reachable) | 0 | **5 — 36%** |
| groups the model emitted at all | 0 | 6 |

8 of the 22 labelled groups are optional-only, so R2 makes them unreachable by
construction — `alternatives` groups `required` only. Against the 14 reachable
ones the model produces 5. It is conservative, not wrong: of 6 groups emitted, 5
matched a label exactly. The misses are plain choices it left flat —
`Angular|React|Vue.js`, `Cypress|Playwright|WebdriverIO`, `ELT|ETL`.

Consequence for the corpus pass: a choice the model leaves flat scores exactly as
it does today, so 36% is a partial win with no downside, not a half-broken
feature. Whether to spend a few cents tuning the prompt before the corpus pass or
accept 36% and revisit is open — noted in §11.

#### Measured 2026-09-20, second pass — three examples instead of one

The first grouping prompt carried one example, in one surface form ("X or Y"
spelled with the word "or"). Every miss was the same choice written differently:
a colon list with a quantifier ("at least one test automation framework:
Cypress, WebdriverIO, or Playwright"), a parenthesised list ("Any framework
(React, Vue, Angular, etc.)"), and a slash pair ("Strong ETL/ELT experience").
The prose rules named those forms; the single example did not show them, and the
example is what the model follows.

Replaced with three examples, one per surface form, plus an explicit slash
guard: `CI/CD` and `TCP/IP` are one name, `ETL/ELT` is two skills. All nine
skill names used in the examples are VERIFIED taxonomy nodes in exactly that
spelling, so no example teaches a name the extractor would then have to invent.

| | one example | three examples |
|---|---|---|
| MUST groups reproduced (of 14 reachable) | 5 — 36% | **8 — 57%** |
| groups emitted at all | 6 | 9 |
| precision | 73.6% | 74.0% |
| recall | 55.6% | 56.4% |
| F1 | 62.2% | 63.0% |
| or_split_errors | 8.7 | 8.3 |
| profile fields | 95.4% | 97.4% |
| per-pass spread (precision / F1 / or_split) | 4.0 / 2.1 / 3.0 | **2.7 / 1.4 / 1.0** |

The aggregate metrics moved inside their own noise, as expected — grouping
changes the shape of a handful of clauses, not the bulk of them. The group count
is the result: 5 → 8 of 14, and the run also got measurably more stable (every
spread narrowed), which is what more examples usually buy.

Of the 9 groups emitted, 8 matched a label exactly. The ninth is
`ArduPilot | PX4` on the UAV row — plausibly a real choice the labels do not
carry. Check it when approving the 10 MUST-group rows (R7); if it is right, the
label moves, not the prompt.

The six remaining misses are not one problem:

- `ELT | ETL` — both skills extracted, left ungrouped, despite the example using
  that exact phrase. Slash pairs are still the weakest form.
- `C | C++` — same shape, and arguably a label question rather than a model one.
- `JavaScript | TypeScript`, and two three-way FinOps tool choices.
- `MariaDB | MySQL` — not a grouping miss at all: MariaDB was never extracted.

Two prompt iterations cost under two cents in total. A third is available but
has a clear diminishing look to it; 57% grouped with the rest scoring exactly as
today is a reasonable state to pay for the corpus with.

- **Before Pass 2 step 5**, run the new contract over the 25-row golden set
  (`apps/etl/src/eval/`) and compare groups against the 22 hand-labelled `anyOf`
  entries.
- **Release gate (R7):** approve only the 10 golden-set rows carrying a MUST
  group before Pass 2 ships wide. The other 15 stay draft — they test the
  already-shipped contract, not this feature.
- **After Pass 2 step 7**, the metric is how many Positions changed Fit tier, not
  skill accuracy. Expect movement concentrated in DevOps / Security / SysAdmin —
  the roles with both the highest cap saturation (48% / 42% / 40%) and the
  substitute families.

#### Measured 2026-09-20 — the Fit distribution before Pass 2

There was no Fit-level baseline at all, which made "did Pass 2 help" unanswerable.
Taken on the 2026-09-19 prod dump restored locally
(`backups/Postgres-railwayssh-20260919-223122.sql.gz`, 16,169 Positions, 45
candidates with resolved skills), $0 and no prod access. The query mirrors
`scoringCtes` exactly — coverage over required weight, tiers at 0.8 / 0.5 — over
every (candidate, Position) pair sharing at least one skill: 403,037 pairs.

| tier | pairs | share | avg coverage |
|---|---|---|---|
| STRONG (≥0.8) | 11,222 | 2.78% | 0.950 |
| GOOD (0.5–0.8) | 32,384 | 8.03% | 0.619 |
| STRETCH (<0.5) | 359,431 | 89.18% | 0.171 |

Per candidate: 249 STRONG and 720 GOOD on average (median 218 / 628), and every
candidate has at least one STRONG. Coverage is heavily bottom-loaded — 57% of
pairs sit under 0.2, only 1.9% reach exactly 1.0 — which is what makes
`FIT_STRONG_MIN` / `FIT_GOOD_MIN` worth re-eyeballing on the post-Pass-2
distribution (Pass 2 step 6) rather than before.

Re-run the same query after step 7 and compare tier shares; that, not skill
accuracy, is the metric for the switch to units.

---

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

All eight design questions this doc raised are resolved in §3. What's left is
execution risk, not decision:

1. ~~**`SkillGroup[]` must round-trip through `baml_client` codegen**~~ —
   **closed 2026-09-20.** `baml-cli generate` emits `interface SkillGroup` and
   `alternatives: SkillGroup[]` in both `types.ts` and `partial_types.ts`, and
   `b.parse.ExtractVacancy` parses a response carrying groups. A response that
   omits the field coerces to `[]` rather than failing, so the old shape still
   parses. No `string[][]` fallback needed, and no provider call was made.
2. **How far to push the grouping prompt.** One iteration took it from 36% to
   57% of the reachable golden-set choices (5 → 8 of 14) for about a cent. The
   remaining misses are concentrated in slash pairs (`ETL/ELT`, `C/C++`), and
   one of them may be a label question rather than a prompt one. Ungrouped
   choices score exactly as today, so this gates nothing.
3. **Whether Pass 1 alone shifts `FIT_STRONG_MIN`/`FIT_GOOD_MIN`** enough to need
   an interim recalibration, or whether the single recalibration planned after
   Pass 2 (§7, Pass 2 step 6) is enough. Decide after watching Pass 1 step 4's
   output — don't pre-guess it.
