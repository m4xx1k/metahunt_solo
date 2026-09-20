# requirement-groups — the measurement log

Evidence for [`requirement-groups.md`](requirement-groups.md): every run of this
initiative, in the order it happened, with what each number does and does not
say. The tracker keeps the plan and the decisions; this file keeps the numbers,
so neither grows past its cap.

Two rulers are in play and they answer different questions.

- **The golden set** (`apps/etl/src/eval/`) scores a requirement clause with an
  exact priority and an exact `anyOf` set against a hand-written label. It is
  sensitive, provider-paid, and sized in tens of rows.
- **Corpus coverage** counts, over all canonical postings, how often a skill
  named in the text is actually linked. It is free, label-free, and it is the
  question analytics and scoring actually ask.

A low golden-set number and a high coverage number are not a contradiction —
see "what the golden-set numbers actually mean" below.

---

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

#### Measured 2026-09-20 — what the golden-set numbers actually mean

The eval reads alarmingly low (recall 56.4%, precision 74.0%) for a task that is
mostly "find the name in the text". Decomposing every miss of the last run
against the **vacancy text**, rather than against the label, explains most of it:

| | count | name present in the text verbatim |
|---|---|---|
| missed (hurts recall) | 150 | 66 — **44%** |
| extra (hurts precision) | 63 | 44 — **70%** |

- **56% of "missed" is not written in the posting at all.** Those labels are
  interpretations of duties — `Load Balancing`, `Proxy Servers`,
  `Cost Forecasting`. The extractor is forbidden from minting exactly this kind
  of phrase (R10 is about relaxing that, carefully).
- **52 of the 150 missed labels do not resolve to a taxonomy node.** Even if the
  model produced them, nothing downstream could store them.
- **70% of "extra" is in the text verbatim** — a real skill the labeller did not
  write down. That is an incomplete ground truth, not a hallucination.
- Misses are concentrated: the FinOps row alone carried 23 of 150 (R9 removed
  it), the worst five rows carried 53. Mainstream stacks score far higher than
  the aggregate — Node.js 83%, Django 83%, Frontend 86% — while QA rows average
  58.4% against 65.6% for everything else, and QA was 7 of 25 rows.

#### Measured 2026-09-20 — corpus coverage, the number the product runs on

The golden set scores a *requirement clause with an exact priority and an exact
`anyOf` set* against a maximalist hand label. Analytics and scoring ask a
smaller question: is the skill attached to the posting at all. That is
measurable on the corpus with **no labels and no provider calls** — count
postings whose text mentions an unmistakable skill name, and how many of those
carry the link. On the 2026-09-19 snapshot, 16,169 canonical postings:

| skill | mentioned | linked | coverage |
|---|---|---|---|
| TypeScript | 2,953 | 2,933 | 97.2% |
| Playwright | 887 | 851 | 95.7% |
| Terraform | 1,448 | 1,415 | 95.6% |
| Kubernetes | 2,692 | 2,604 | 93.5% |
| Ansible | 547 | 510 | 93.1% |
| Docker | 3,876 | 3,691 | 92.7% |
| PostgreSQL | 3,034 | 3,014 | 92.7% |
| MongoDB | 970 | 1,000 | 89.0% |
| Django | 417 | 371 | 89.0% |
| Kafka | 1,414 | 1,254 | 88.3% |
| Redis | 1,685 | 1,485 | 88.0% |
| React | 2,672 | 2,358 | 87.1% |
| GraphQL | 689 | 597 | 85.5% |
| Grafana | 1,289 | 1,006 | 78.0% |
| **Jenkins** | 786 | 416 | **52.9%** |

**Median coverage is about 90%**, which is the honest figure for "can we build
analytics on this". Per-posting misses are largely uncorrelated noise that
averages out of a frequency count; a *systematic* gap does not — and Jenkins is
one. Every unlinked Jenkins sample looks the same:

```
experience with ci/cd tools (jenkins, github actions, etc.)
досвід роботи з jenkins, gitlab ci, argo cd або аналогічними системами
```

A named example inside a list of alternatives — the exact shape requirement
groups exist for. **Re-run this query after the corpus pass**: if Jenkins does
not move, grouping did not reach the case it was built for.

The query was ad hoc when this was first taken and is now checked in as
[`scripts/sql/corpus-skill-coverage.sql`](../../../scripts/sql/corpus-skill-coverage.sql),
so the before and after runs are the same query rather than two similar ones.
Re-run 2026-09-20 on the same snapshot, it reproduces every coverage figure in
the table above. Two `linked` counts in that table do not: the original counted
links without restricting them to the postings that mention the skill, which is
why MongoDB reads 1,000 linked against 970 mentioned. The percentages were
computed the right way, so they stand; the checked-in query keeps
`linked ⊆ mentioned` and gives MongoDB 863 of 970.

Two incidental corpus facts from the same pass: the average canonical posting
carries **6.9 required skills** and only **76 of 16,169 reach the cap of 20**, so
the cap is no longer the binding constraint after Pass 1 — and **428 canonical
postings carry no skills at all**, which nobody has looked at.

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
#### Measured 2026-09-20 — the rebalanced golden set, a new baseline (R9)

R9 is done: three Automation QA rows with no MUST group are gone, eight
hand-labelled rows are in, and the set is 29 rows. The new rows are two
`Software Engineer` (9.3% of the corpus and previously unrepresented), plus one
each of `AI Engineer`, `Data Analyst`, `Security Engineer`, `Hardware Engineer`
and `Frontend Engineer`, and a DevOps posting written almost entirely in
alternative lists. QA now holds 4 of 29 rows (13.8%) against 13.5% of the
corpus. **MUST groups go from 11 in 9 rows to 32 in 16 rows.**

`--extractor production --repeat 3`, two cents. The left column is the last run
against the old set (`2026-09-20-production-DeepSeekClient-25row.md`); the two
are **not comparable**, and the right column is the baseline every later run is
read against (`…-29row.md`).

| | 25-row set | 29-row set |
|---|---|---|
| F1 | 63.0% | **61.5%** |
| precision | 74.0% | **67.2%** |
| recall | 56.4% | **58.9%** |
| alternative accuracy | 57.0% | **59.2%** |
| `or_split_errors` | 8.3 | **21.3** |
| priority accuracy | 97.7% | **99.3%** |
| role accuracy | 57.3% | **59.8%** |
| profile fields | 97.4% of 51 | **95.6% of 61** |
| per-pass F1 spread | 1.4 pt | **0.7 pt** |

**`or_split_errors` tripling is the point, not a regression.** The old set gave
the extractor 11 chances to split a choice; this one gives it 32, and it splits
most of them. Precision falls for the same reason: every member the model emits
as its own requirement is an `extra` against one grouped label. Both numbers
now measure the thing Pass 2 exists to fix, which the old set barely could.

Where the splitting shows up, from the run itself:

```
Security Engineer  expected  nice:AppArmor|BitLocker|FileVault|Gatekeeper|…|SELinux
                   actual    nine separate `nice` requirements
AI Engineer        expected  must:Haystack|LangChain|LangGraph|LlamaIndex|Semantic Kernel
                   actual    must:Semantic Kernel + nice:LangChain + nice:LangGraph
```

Both postings mark the list as a choice in the source ("at least one … such
as", "such as … or"), so these are true `or_split` errors, not label disputes.

Two labels were corrected after reading the first run and before this baseline
was taken: `Attack Surface Reduction` was missing from the Security row's
native-controls list (it is verbatim in the posting), and the Hardware row's
RF-module sentence was over-grouped — the `або` there binds only
`down-converters` and `SDR`, the rest of that sentence is cumulative.

Only three labels across the eight new rows fail to resolve to a taxonomy node
(`Down-converters`, `Frequency Synthesizers`, `File Integrity Monitoring`),
against 31 unresolvable labels among the rows that were already there. Two
alias collisions are worth knowing before reading a score: `LoRA` normalizes
onto `LoRa`, the radio protocol, and `SOPS` onto `SOPs`. The scorer
canonicalizes both sides through the same map, so neither biases a comparison.

The per-pass spread fell from 1.4 to 0.7 points, so this set's noise floor is
lower than the old one's — but still read nothing under about 1.5 F1 points as
a result.

---

#### Measured 2026-09-20 — the contract shape under-groups, not the model

The 29-row baseline reads low enough to raise "is `deepseek-v4-flash` simply
not good enough". It is not the model. Three runs over the same 29 rows and
the same labels, changing one thing at a time:

| | F1 | MUST groups of 32 | two-member of 23 | `or_split` | role | p50 | out tokens |
|---|---|---|---|---|---|---|---|
| DeepSeek, production contract | 61.5% | 11 | **5** | 21.3 | 59.8% | 1.4s | 6k |
| DeepSeek, v2 contract | 65.6% | 18 | **12** | 17.0 | 96.6% | 1.7s | 11k |
| Muse, v2 contract | 67.1% | 19 | **12** | 6.0 | 93.1% | **54s** | **153k** |

**Changing the contract buys +4.1 F1 and +7 groups. Changing the model buys
+1.5 F1 and +1 group.** On two-member choices — the "AWS or GCP" case this
whole tracker is named after — both models land on exactly 12 of 23. A
reasoning model thinking 38× longer for 14× the output tokens does not see
the eleven that DeepSeek misses.

The mechanism is in the class shape. Production asks for the same information
twice:

```
class Skills {
  required     string[]        // flat list
  optional     string[]
  alternatives SkillGroup[]    // now go back and restate some of those names in pairs
}
```

`alternatives` is a second pass over an answer the model has already written,
and it is the pass that gets skipped. The v2 contract has no flat form at all —
`requirements: [{priority, anyOf}]`, so every requirement is already a list and
grouping is not extra work. Same model, same posting, 5 vs 12 two-member
groups.

The misses are not subtle cases. Verbatim from the production run:

```
AWS | Azure              ← "Experience with Azure or AWS cloud"
Docker | Kubernetes      ← "Experience with Docker or Kubernetes"
ETL | ELT                ← the prompt itself names "ETL/ELT" as a worked example
EDR | XDR,  MDM | UEM    ← "EDR/XDR", "MDM/UEM"
Sigstore | Cosign,  Microsoft SQL Server | Oracle Database
```

Longer enumerations are fine in both contracts (3-member: 5 of 6 on
production). The failure is specific to binary choices.

Two more things the same runs settle.

**Minting is a prompt property, not a model property.** The v2 contract passes
no `knownSkills` at all, and both models invent at the same rate: 95 names with
no taxonomy node out of 559 for DeepSeek, 76 of 581 for Muse, against **2 of
389** for the production contract which does pass the list. On the RF posting
the unconstrained prompt produced `noise analysis`, `linearity analysis`,
`frequency planning`, `deviation analysis` — duties, not skills — plus `PhD`
and `electrical/radio engineering degree`. That is the ceiling on R10's risk,
measured rather than guessed. R10 keeps the list as guidance so the real number
is lower, but it is not zero and no model choice avoids it.

**Role accuracy is taxonomy debt.** 59.8% on production against 96.6% on v2,
same model. Production feeds the 100 VERIFIED role nodes from the database; v2
feeds the closed 30-role enum. 37 of those 100 roles carry no positions at all.
This prices the ROLE cleanup deferred on 2026-09-19 at roughly 37 points of
role accuracy.

**Cost note against switching models.** 153k output tokens for 29 postings on
the reasoning challenger. Extrapolated to 16,169 canonical postings that is not
the $1.7–4 the corpus pass is budgeted at, for +1.5 F1. Fix the contract before
reconsidering the model.

Artifacts: `2026-09-20-requirements-v2-DeepSeekClient.*` and
`2026-09-20-requirements-v2-OpenRouterMuseClient.*`. The Muse run is a single
pass — read nothing under about 1.5 F1 points from it.

---
