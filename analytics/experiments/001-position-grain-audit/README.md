# 001 — Position-grain audit

**Question.** Is the corpus sound enough to compute skill co-occurrence at canonical-position grain, and what does the eligible universe look like once one position = one vote?

**Corpus.** `metahunt_lab`, restore of the Railway prod dump taken 2026-08-07. Grain `unique_vacancies.id`.
**Run.** `analytics/lab.sh -f analytics/experiments/001-position-grain-audit/query.sql`
**Raw output.** [`results.txt`](results.txt)

---

## Findings

### 1. The position-grain contract holds in the data

| check | value |
|---|---|
| source postings | 15,089 |
| canonical positions | 12,763 |
| postings with NULL `unique_vacancy_id` | 0 |
| positions whose canonical member belongs to another position | 0 |
| positions whose `vacancy_count` disagrees with the real member count | 0 |

`MET-128` has not landed as a schema constraint (`origin/main` stops at `0041`), but every invariant it would enforce is already satisfied by this snapshot. Position grain is unambiguous here. Nothing downstream needs the missing `NOT NULL`.

### 2. Deduplication touches ~12% of positions — so aggregation rule is a small lever

| members | positions | % |
|---|---|---|
| 1 | 11,227 | 87.97% |
| 2 | 1,179 | 9.24% |
| 3 | 199 | 1.56% |
| 4+ | 158 | 1.23% |

**Consequence:** representative-only and member-union can differ for at most 1,536 positions (12.03%). A large divergence between the two rules would therefore be surprising, and would itself indicate extractor instability rather than a genuine analytical choice. Experiment 002 measures it instead of assuming it.

Max group size is 20 members — a real repost cluster, not a dedup bug.

### 3. Two sources, and dedup moves weight between them

| source | postings | positions owned | % of positions |
|---|---|---|---|
| djinni | 8,908 | 7,265 | 56.92% |
| dou | 6,181 | 5,498 | 43.08% |

djinni contributes 59.0% of postings but owns 56.9% of positions: at position grain djinni's advantage shrinks. **Neither source dominates**, which makes a source-holdout check (recompute an edge on djinni-only and dou-only positions) both cheap and meaningful. This is the single most useful confounder control the corpus offers, and it is used in the GRILL.

### 4. VERIFIED-only is conservative on skills but not on positions

Raw skill links (posting grain, all 152,231 links → 152,231 rows across SKILL nodes):

| status | required | links | % of links | distinct skills |
|---|---|---|---|---|
| VERIFIED | yes | 93,690 | 61.54% | 1,184 |
| VERIFIED | no | 40,587 | 26.66% | 1,181 |
| NEW | no | 7,147 | 4.69% | 4,343 |
| NEW | yes | 6,741 | 4.43% | 3,776 |
| HIDDEN | yes | 2,550 | 1.68% | 167 |
| HIDDEN | no | 1,516 | 1.00% | 158 |

The taxonomy is **shaped exactly the way you'd hope**: 1,184 VERIFIED skills carry 88.2% of all link mass, while 4,343 NEW skills carry 9.1% — the NEW tier is a long tail of near-singletons (extractor one-offs, typos, hyper-niche libraries), not a hidden mainstream.

Position coverage under each candidate contract (denominator 12,763):

| rule | positions | % |
|---|---|---|
| any skill, any status | 12,525 | 98.14% |
| required, any status | 12,366 | 96.89% |
| required, not HIDDEN | 12,357 | 96.82% |
| **required, VERIFIED only** | **12,288** | **96.28%** |
| required, VERIFIED, ≥2 skills (pair-eligible) | 11,925 | 93.43% |

**Decision (data-driven, was an open question):** default eligibility = `SKILL` + `VERIFIED` + `is_required`. Tightening from "any status" to "VERIFIED only" costs **1.86 percentage points of position coverage** while removing 4,510 tail nodes that would otherwise generate spectacular-looking sparse-tail edges. That is a very cheap conservatism, so it is the default rather than a parameter the user must reason about. Node status remains exposed in the artifact so a NEW-inclusive rerun is a one-flag change.

### 5. Positions carry enough skills for pair analysis

Representative-only, required:

| filter | positions with ≥1 | mean skills | median | max |
|---|---|---|---|---|
| not HIDDEN | 12,357 | 6.83 | 7 | 44 |
| VERIFIED | 12,288 | 6.38 | 6 | 35 |

A median of 6 required skills per position gives ~15 pairs per position — dense enough that pair counts will not be starved, sparse enough that no smoothing machinery is needed yet.

### 6. Role coverage is near-total; seniority is good but not free

| | positions | % |
|---|---|---|
| with `role_node_id` | 12,731 | 99.75% |
| with `seniority` | 10,433 | 81.74% |

Role conditioning (Phase 5) is therefore **essentially loss-free** — the confounding check does not trade away sample. Seniority conditioning silently drops 18% of positions and must always be reported against its own denominator.

Top roles: Backend Engineer 17.56%, Full Stack 10.48%, DevOps 7.27%, QA 6.52%, Embedded 5.45%, Software Engineer 4.96%, Manual QA 4.77%, Frontend 4.40%, Data Engineer 3.60%, AI Engineer 3.28%.

Backend Engineer alone holding 17.6% of the corpus is the **primary confounding risk**: any "backend-flavoured" pair will look strong globally simply because backend is the largest single market segment. This is the hypothesis the role-conditioned check exists to attack.

### 7. The corpus is ~3 months and has no bulk-backfill spike

Positions by first-observation week (`MIN(vacancies.loaded_at)` over members):

```
2026-05-04  1345   2026-06-15   783   2026-07-27   743
2026-05-11  1528   2026-06-22   881   2026-08-03   714  (partial week)
2026-05-18   979   2026-06-29   665
2026-05-25  1088   2026-07-06   809
2026-06-01  1035   2026-07-13   646
2026-06-08   872   2026-07-20   675
```

The first two weeks run ~1.5× later weeks, consistent with initial catch-up ingestion of already-open postings rather than a synthetic backfill — there is no single week holding an implausible share. Still: **14 weeks cannot support any trend claim**, and none is made.

### 8. Support distribution sets the thresholds

Eligible skills (VERIFIED, required, representative-only), 12,288 positions:

| bucket | skills | link mass | % of mass retained |
|---|---|---|---|
| all | 1,180 | 78,429 | 100% |
| support ≥ 5 | 995 | 77,905 | 99.3% |
| support ≥ 10 | 744 | 76,208 | 97.2% |
| **support ≥ 25** | **420** | **71,046** | **90.6%** |
| support ≥ 50 | 232 | 64,504 | 82.2% |
| support ≥ 100 | 141 | 58,333 | 74.4% |

**Decision:** `min_skill_support = 25`. It keeps 90.6% of the observed link mass while cutting the node set from 1,180 to 420 — the point where the curve stops being cheap (going to 50 costs another 8.4pp of mass for only 188 more nodes removed). 25 positions is also the smallest support at which a conditional probability has a usable confidence interval (±~10pp at p≈0.5), which is the real reason to stop there rather than a rounder number.

Pair-support threshold is set in experiment 003 from the pair distribution, not guessed here.

---

## What this audit does NOT establish

- That `is_required` reflects what the vacancy text actually said. It is an extractor output; no golden set validates it. Everything downstream inherits that uncertainty.
- That the corpus represents the Ukrainian IT market. It represents djinni + dou RSS as observed over 14 weeks.
- That any position is currently open. Liveness is unobservable from this data.
