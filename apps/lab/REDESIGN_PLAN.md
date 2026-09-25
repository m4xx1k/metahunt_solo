# Plan: Rebuilding MetaHunt Lab with `anyOf` (Requirement Groups)

**Status:** Draft / Proposal for Review  
**Date:** 2026-09-25  
**Target Package:** `apps/lab` (`@metahunt/lab`)  
**Context:** Migration `0058`, PRs #222 (`2374f9a`), #223 (`f90d9bd`), Tracker `requirement-groups.md`

---

## 1. Executive Summary & Problem Statement

### 1.1 What MetaHunt Lab Does Today
`apps/lab` is an isolated research application for exploring vacancy skill co-occurrence, skill ecosystems, and role conditioning. It has zero runtime database dependencies and consumes a single committed JSON artifact: [`src/data/graph.json`](src/data/graph.json).

### 1.2 The Fundamental Flaw of Raw Co-occurrence
Until recently, vacancy extraction produced a flat list of required skills. When a posting stated:
> *"Requirements: 3+ years with AWS or GCP or Azure; strong PostgreSQL and Redis"*

all five technologies were stored with `is_required = true`. 

Consequently, raw co-occurrence metrics (`pair_positions`, `lift`, `NPMI`) treated **substitutes** ("A or B") and **complements** ("A and B") identically. In fact, substitutes often exhibited higher NPMI than complements because they appeared in the exact same sentence. As documented in [`apps/lab/README.md`](README.md):
> *"Neither symmetry nor node_tech_meta category separates them. I2C/SPI are complements at symmetry 1.00; WireGuard/OpenVPN are substitutes at 0.93... Co-occurrence cannot tell these apart."*

To avoid telling candidates that they must learn both TensorFlow and PyTorch (the highest-NPMI edge in the graph), the lab maintained a hand-curated file [`src/data/pair-relations.json`](src/data/pair-relations.json) (149 pairs: `SUBSTITUTE`, `COMPLEMENT`, `IMPLIES`, `CONTESTED`). This left thousands of edges unclassified and 26 of the top 150 edges unlabelled.

### 1.3 The `anyOf` Breakthrough
With the introduction of `SkillRequirement { anyOf: string[] }` in BAML ([extract-vacancy.baml](../etl/baml_src/extract-vacancy.baml)) and `vacancy_nodes.requirement_group` / `position_nodes.requirement_group`:
- **Single-skill requirements** have `requirement_group IS NULL`.
- **Alternative/interchangeable choices** share a local non-null integer `requirement_group` within that vacancy.

This provides the exact empirical signal needed to distinguish substitutes from complements directly from data.

---

## 2. Corpus Audit & Data Findings (Dump 2026-09-25)

### 2.1 Database State
- **Dump file:** `metahunt_solo/backups/prod-20260925.sql.gz` (dumped 2026-09-25 18:13 UTC, 344 MB gzipped, ~1 GB uncompressed).
- **Active container:** `metahunt-db` (Postgres 18 on port 54323).
- **Lab database:** `metahunt_lab` has been refreshed to today's prod dump (via template clone from `metahunt_railway`). Safe to mutate. Previous lab state preserved in `metahunt_lab_backup_aug27`.
- **Database URL:** `LAB_DATABASE_URL=postgres://metahunt:metahunt123@localhost:54323/metahunt_lab`.

### 2.2 Date Distribution & Corpus Heterogeneity
The corpus cannot be processed across all time uniformly because `anyOf` was deployed and backfilled only for recent vacancies:

| Window / Week Start | Postings (Vacancies) | Canonical Positions | Vacancies with Groups |
|---|---|---|---|
| Historical (May 2026 – 2026-08-16) | 13,878 | 12,654 | **0** (flat extraction) |
| **2026-08-17** | 950 | 888 | **116** *(Starts 2026-08-19 07:16 UTC)* |
| **2026-08-24** | 1,028 | 979 | **223** |
| **2026-08-31** | 1,252 | 1,141 | **254** |
| **2026-09-07** | 1,256 | 1,160 | **291** |
| **2026-09-14** | 1,320 | 1,222 | **306** |
| **2026-09-21** | 1,274 | 1,168 | **568** |

**Key Metric in the clean window (`published_at >= '2026-08-19'`):**
- Total unique positions with verified skills: **5,401**.
- Positions with $\ge 1$ requirement group: **1,481** (**27.4%** of all tech positions).
- Total grouped links in `position_nodes`: **6,518**.
- Group sizes range from 2 up to 9 interchangeable skills (e.g. 9 QA frameworks, 7 embedded buses, 6 cloud services, 6 backend languages).

> [!WARNING]
> Running the pipeline on all-time data (`published_at < 2026-08-19`) will treat historical alternatives as complements, severely diluting the substitutability signal. The primary graph contract **must** be anchored to `published_at >= '2026-08-19'`.

---

## 3. Empirical Proof: Separating Substitutes from Complements

For any pair of skills $(A, B)$ co-occurring within a canonical position:
1. $N_{\text{substitute}}(A, B)$: count of positions where $A$ and $B$ share the **same** `requirement_group`.
2. $N_{\text{complement}}(A, B)$: count of positions where $A$ and $B$ are in **different** requirements (or both have `NULL` groups).
3. $N_{\text{total}}(A, B) = N_{\text{substitute}} + N_{\text{complement}}$.
4. **Substitutability Ratio:**
   $$S(A, B) = \frac{N_{\text{substitute}}(A, B)}{N_{\text{total}}(A, B)}$$

### Real Query Results on the 2026-08-19+ Corpus Slice:

| Pair $(A, B)$ | Total Co-occurrences | Substitute (OR) | Complement (AND) | $S(A, B)$ | Empirical Verdict |
|---|---|---|---|---|---|
| **ELT / ETL** | 69 | 57 | 12 | **82.6%** | `SUBSTITUTE` |
| **Vue.js / React** | 40 | 32 | 8 | **80.0%** | `SUBSTITUTE` |
| **Azure / Google Cloud** | 144 | 99 | 45 | **68.8%** | `SUBSTITUTE` |
| **Power BI / Tableau** | 44 | 30 | 14 | **68.2%** | `SUBSTITUTE` |
| **AWS / Azure** | 197 | 131 | 66 | **66.5%** | `SUBSTITUTE` |
| **Cypress / Playwright** | 47 | 31 | 16 | **66.0%** | `SUBSTITUTE` |
| **GitHub Actions / GitLab CI** | 69 | 45 | 24 | **65.2%** | `SUBSTITUTE` |
| **Claude Code / Cursor** | 137 | 86 | 51 | **62.8%** | `SUBSTITUTE` |
| **AWS / Google Cloud** | 205 | 126 | 79 | **61.5%** | `SUBSTITUTE` |
| **Jenkins / GitLab CI** | 85 | 52 | 33 | **61.2%** | `SUBSTITUTE` |
| **Kafka / RabbitMQ** | 84 | 47 | 37 | **56.0%** | `SUBSTITUTE` |
| **TensorFlow / PyTorch** | 69 | 35 | 34 | **50.7%** | `CONTESTED / SUBSTITUTE` |
| **PostgreSQL / MySQL** | 181 | 88 | 93 | **48.6%** | `CONTESTED` |
| **Java / Python** | 98 | 35 | 63 | **35.7%** | `CONTESTED` |
| **Bash / Python** | 228 | 60 | 168 | **26.3%** | `COMPLEMENT` |
| **Prometheus / Grafana** | 142 | 35 | 107 | **24.6%** | `COMPLEMENT` |
| **TypeScript / JavaScript** | 342 | 48 | 294 | **14.0%** | `COMPLEMENT` |
| **I2C / SPI** | 186 | 10 | 176 | **5.4%** | `COMPLEMENT` |
| **Redis / PostgreSQL** | 250 | 6 | 244 | **2.4%** | `COMPLEMENT` |
| **Docker / Kubernetes** | 352 | 8 | 344 | **2.3%** | `COMPLEMENT` |
| **TypeScript / React** | 442 | 0 | 442 | **0.0%** | `COMPLEMENT` |

The separation is statistically unambiguous:
- Complements sit at $S < 15\%$ (often $< 5\%$).
- True technological rivals/substitutes sit at $S > 50\%$ (often $60\% - 85\%$).
- Contested pairings (e.g. general multi-db support or multi-language backends) land in $30\% - 50\%$.

---

## 4. Rebuilding Architecture & Implementation Plan

### Phase 1: Analytical Pipeline Refactoring (`pipeline/`)

#### 1. Anchor Corpus Window in [`pipeline/02-pairs.sql`](pipeline/02-pairs.sql)
- Restrict input to positions published in the anyOf era:
  ```sql
  WHERE po.published_at >= '2026-08-19'
  ```
- Denominator $N_{\text{corpus}} \approx 5,401$ positions.
- Thresholds:
  - `min_skill_support = 15` (calibrated for the 5.4k 1-month window instead of the 12.7k all-time window, keeping $\approx$ the same statistical significance).
  - `min_pair_support = 5`.

#### 2. Re-engineer `metalab_pair` and Metrics in `02-pairs.sql`
- Store distinct counts for:
  - `pair_positions` (total co-occurrence)
  - `substitute_positions` (`a.requirement_group = b.requirement_group AND a.requirement_group IS NOT NULL`)
  - `complement_positions` (`a.requirement_group IS NULL OR b.requirement_group IS NULL OR a.requirement_group <> b.requirement_group`)
  - `substitute_rate = substitute_positions::float8 / pair_positions`
- **Cleaned Complement Lift and NPMI:**
  Calculate `complement_lift` and `complement_npmi` using $N_{\text{complement}}(A, B)$ instead of total co-occurrence:
  ```sql
  (p.complement_positions::float8 / c.n_positions) / (sa.prevalence * sb.prevalence) AS complement_lift
  ```
  *Impact:* Eliminates substitute distortions from the ecosystem graph. AWS + Azure will no longer register a misleadingly inflated ecosystem lift.

#### 3. Update Confounders in [`pipeline/03-confounders.sql`](pipeline/03-confounders.sql)
- Ensure role conditioning filters respect the `published_at >= '2026-08-19'` window and evaluate in-role associations over `complement_positions`.

#### 4. Export Schema in [`pipeline/04-export.sql`](pipeline/04-export.sql)
Emit an extended edge definition:
```json
{
  "a": 12,
  "b": 34,
  "pairs": 197,
  "substitutePairs": 131,
  "complementPairs": 66,
  "substituteRate": 0.665,
  "pBgivenA": 0.385,
  "pAgivenB": 0.412,
  "lift": 1.45,
  "npmi": 0.28,
  "complementLift": 0.48,
  "complementNpmi": -0.09,
  "relation": "SUBSTITUTE"
}
```
Automatic `relation` derivation heuristic:
- `SUBSTITUTE`: `substituteRate >= 0.50` AND `substitutePairs >= 5`
- `COMPLEMENT`: `substituteRate <= 0.15` AND `complementPairs >= 10`
- `CONTESTED`: otherwise
- `IMPLIES`: joined from curated `pair-relations.json` (see §5).

Emit `alternativeGroups` array (hyperedges of size $\ge 3$):
```json
[
  { "skills": ["AWS", "Azure", "Google Cloud"], "positions": 86 },
  { "skills": ["Playwright", "Cypress", "Selenium"], "positions": 28 },
  { "skills": ["PostgreSQL", "MySQL", "Microsoft SQL Server"], "positions": 24 }
]
```

---

### Phase 2: Frontend & UI Adaptation (`src/`)

#### 1. Types (`src/types.ts`)
Extend `Edge` with `substitutePairs`, `complementPairs`, `substituteRate`, `complementLift`, `complementNpmi`, and `relation`. Add `AlternativeGroup` type.

#### 2. Skill Dossier (`src/views/SkillDossier.tsx`)
- In the **Forks (Alternatives)** section:
  Replace reliance on `curated.pairs` with direct query on `edges` where `relation === 'SUBSTITUTE'` or `substituteRate >= 0.40`.
  Display the empirical substitutability percentage (e.g. `Vue.js (80% substitute, 32 positions)`).
- Show companion technologies based on `complementNpmi` instead of raw NPMI.

#### 3. Graph Map (`src/views/Map.tsx`)
Add a view selector:
1. **Ecosystem Mode (Complements only):** Filters edges with `relation === 'COMPLEMENT'` or `complementNpmi >= 0.2`. Renders genuine tech stacks (e.g. Python $\rightarrow$ FastAPI, PostgreSQL, Docker, PyTest; React $\rightarrow$ TypeScript, Next.js, Tailwind).
2. **Competition Mode (Substitutes only):** Filters edges with `relation === 'SUBSTITUTE'`. Renders clusters of technologies competing for the same vacancy slots (Cloud providers, UI frameworks, Message brokers, Databases).

#### 4. Relations Check & Curation (`src/views/Relations.tsx` & `pipeline/relations-check.mjs`)
- Update `relations-check.mjs` to compare hand-curated labels against empirical `substituteRate`.
- Keep `pair-relations.json` for:
  - Directional implications (`IMPLIES`: Alembic $\rightarrow$ SQLAlchemy, Next.js $\rightarrow$ React) which symmetric `anyOf` cannot capture.
  - Low-support manual ground truth.

---

## 5. Critical Questions & Review Items for Next Agent

1. **Window Size vs Statistical Power:**
   - 5,401 positions (since 2026-08-19) is ~42% of the original 12,773-position dataset.
   - *Review question:* Should we lower `min_skill_support` from 25 to 15 (or 12) to retain coverage of niche verified skills?
2. **Hyperedges vs Pairwise Projection:**
   - When a posting requires `[AWS, GCP, Azure]`, it creates $\binom{3}{2} = 3$ substitute edges.
   - *Review question:* Does pairwise projection cause triangle distortion in Louvain clustering, or is it sufficient to weight edges by $1 / (\text{group\_size} - 1)$?
3. **Handling Contested Edges:**
   - Some edges (e.g. `PostgreSQL / MySQL` at 48.6%, `Bash / Python` at 26.3%) appear as both substitutes and complements depending on company size and architectural scope.
   - *Review question:* Can role conditioning (`03-confounders.sql`) explain whether contested edges are role-dependent (e.g. Data Engineer wants both Python+Bash, DevOps accepts either)?
4. **Preserving `IMPLIES`:**
   - `anyOf` only detects symmetric equivalence ("A or B"). It does not detect asymmetric prerequisites ("Next.js implies React", "Alembic implies SQLAlchemy").
   - *Review question:* How should `IMPLIES` from `pair-relations.json` best interface with empirical `SUBSTITUTE` / `COMPLEMENT`?
