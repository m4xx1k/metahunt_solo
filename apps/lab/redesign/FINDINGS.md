# Findings behind the redesign

Context only — nothing here is a task. Measured on the lab database restored from the
2026-09-25 prod dump.

## 1. The cohort is the extraction contract, not a date

The anyOf re-extraction covered positions *first loaded* on or after 2026-08-19, and new
postings since the contract shipped. A `published_at >= '2026-08-19'` window therefore
still mixes in flat extractions:

| week (published) | canonical positions | anyOf contract | with a group | grouped / anyOf |
|---|---|---|---|---|
| 08-17 | 795 | 271 | 107 | 39.5% |
| 08-24 | 862 | 469 | 202 | 43.1% |
| 08-31 | 1020 | 588 | 224 | 38.1% |
| 09-07 | 1029 | 597 | 258 | 43.2% |
| 09-14 | 1073 | 612 | 274 | 44.8% |
| 09-21 | 1026 | 1022 | 444 | 43.4% |

The marker: `rss_records.extracted_data->'skills'->'required'->0` is an object
(`{anyOf: [...]}`) under the new contract and a string under the old one. Cohort: 3 563
positions; grouped positions outside it: 0 (the build asserts this).

A flat position has no groups, so it counts every pair as "and". Mixing them in
understates the substitute rate:

| pair | S on date window | S on anyOf cohort |
|---|---|---|
| AWS / Azure | 66.5% | 91.0% |
| PyTorch / TensorFlow | 50.7% | 81.4% |
| PostgreSQL / MySQL | 48.6% | 74.6% |
| Kafka / RabbitMQ | 56.0% | 77.0% |
| Bash / Python | 26.3% | 41.7% |
| Docker / Kubernetes | 2.3% | 3.4% |

## 2. Thresholds come from the hand labels

`pair-relations.json` (149 pairs) was used as the calibration set, pairs with ≥ 10 shared
positions in the cohort. Substitute rate by hand label: COMPLEMENT median 0.03, max 0.33;
SUBSTITUTE median 0.74, p25 0.61. With `SUBSTITUTE ≥ 0.5`, `COMPLEMENT ≤ 0.2`, `MIXED`
between, **no pair gets the opposite verdict**. A stricter floor of 20 pairs only moved
pairs into "too thin" without fixing a single error, so the floor stays at the export's
existing `min_pair_support = 10`.

Notable: LangGraph → LangChain is hand-labelled IMPLIES but observed at 70% "or" —
IMPLIES stays hand-made.

## 3. Support floors are absolute counts

`min_skill_support = 25` exists because a conditional probability first has a ±10pp
interval at 25 positions. That is independent of corpus size, so it stays 25 on the
smaller cohort (265 skills survive, down from 452). `min_role_positions` drops 300 → 150
because at 300 only 3 roles survive; 150 keeps 9 at roughly ±8pp.

## 4. `union` cannot carry groups

`requirement_group` is numbered per posting. Group 1 in one member and group 1 in another
are unrelated, so the member-union rule stays group-free and substitute metrics exist on
`rep` only.

## 5. Drift vs rarity

On the cohort, 90 of 149 hand-labelled pairs name a skill below the support floor. The old
drift check compared labels against graph nodes and would fail on all 90. The export now
carries `vocabulary` (every VERIFIED skill name), so drift means "renamed or removed from
the taxonomy", not "rare in this snapshot".

## 6. Deliberately not done

- Hyperedges for groups of 3+ (`{AWS, Azure, GCP}`): exact sets fragment, and the
  pairwise substitute edges already draw the Alternatives map.
- Substitute metrics per role: nothing reads them yet.
- `node_stats` counting `NEW` skills at `df = 1`: a product scoring issue, tracked in the
  requirement-groups migration, not the lab's.
- Re-extracting the rest of the corpus (~$2.6): the owner's call; when it happens, the
  cohort predicate simply grows and nothing else changes.
