# 002 — Position-grain skill sets and pair metrics

**Question.** Build the reproducible edge dataset the graph reads, and settle whether the position-skill aggregation rule is a real analytical parameter or a non-issue.

**Run.**
```bash
analytics/lab.sh -f analytics/experiments/002-position-skill-pairs/build.sql
analytics/lab.sh -f analytics/experiments/002-position-skill-pairs/sensitivity.sql
```
**Raw output.** [`sensitivity-results.txt`](sensitivity-results.txt)

---

## What it builds

| object | contents |
|---|---|
| `metalab_position_skill` | `(rule, position_id, node_id)` — REQUIRED, VERIFIED skills per canonical position, under both aggregation rules |
| `metalab_corpus` | N per rule — the denominator every probability uses |
| `metalab_skill` | per-skill support and prevalence |
| `metalab_pair` | pair counts for skills clearing support ≥ 25 |
| `metalab_edge` (view) | support, P(B\|A), P(A\|B), lift, NPMI, with raw counts alongside |

```text
rule   n_positions  skill_links  eligible_skills  pairs
rep         12,288       78,429              420  19,498
union       12,317       81,516              441  22,073
```

## Metric definitions

For skills A and B over N positions:

```text
support(A,B) = count(A∩B) / N
P(B|A)       = count(A∩B) / count(A)          asymmetric — read in the stated direction
lift(A,B)    = support(A,B) / (P(A)·P(B))     1.0 = independent
NPMI(A,B)    = ln(lift) / -ln(support(A,B))   in [-1,1], comparable across prevalences
```

Raw co-occurrence count is never used alone as relationship strength. Section "the popularity trap" in [003](../003-confounders/README.md) shows exactly why.

## Thresholds and why

- **min skill support = 25 positions** — set in [001](../001-position-grain-audit/README.md) from the support curve: retains 90.6% of link mass at 420 of 1,180 nodes, and is the smallest support where a conditional probability has a usable interval.
- **min pair support = 10 positions** — from the pair distribution below. At ≥10 the graph has 4,140 edges; the sparse-tail check in 003 shows lift ~100 routinely appears at 6–9 pairs, so 10 is the floor where lift stops being noise.

```text
rule   pairs   ≥5     ≥10    ≥25    ≥50
rep    19,498  7,192  4,140  1,731  821
union  22,073  8,081  4,710  1,940  925
```

No smoothing or shrinkage is applied. With a hard support floor the estimates are already stable, and adding shrinkage would trade interpretability for a correction nothing currently needs.

---

## Finding: the aggregation rule does not matter here

This was the one genuinely open design question, and the answer is **boring, which is the useful outcome**.

| measure | result |
|---|---|
| extra skill links under union | **+3.94%** (78,429 → 81,516) |
| positions that gain any skill | **977 of 12,317 (7.93%)** |
| mean skills gained per position | 0.251 |
| top-30 skills by support: max rank shift | **±1** |
| NPMI rank correlation on 4,140 shared edges | **ρ = 0.9984** |
| mean absolute rank shift | 47.6 places (of 4,140) |
| edges present under rep only | **0** |
| edges present under union only | 570 |

Top-25 edges by NPMI move by at most **0.009 NPMI** between rules.

**Why it comes out this way:** 88% of canonical positions have exactly one member (001, §2), so for the overwhelming majority of the corpus the two rules are *definitionally identical*. Union can only differ on the 12% of positions that were actually deduplicated.

**Consequence for v0:** representative-only stays the baseline and the artifact ships one arm, not two. This is recorded as measured robustness, not as an assumption. It is also a conditional result — if the corpus ever reaches a much higher duplication rate, or if the extractor becomes less stable across members, this has to be re-measured. `union` is retained in `metalab_position_skill` so re-running the comparison is one query.

Union never *removes* an edge (rep-only = 0), which is expected: the union skill set is a superset of the representative's, so it can only add.
