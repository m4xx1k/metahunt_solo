# 0014 — The skill graph runs at position grain, in an isolated lab

**Status:** accepted · 2026-08-08 · MET-129

## Context

MetaHunt's corpus can answer questions about how skills relate, but the first
attempt (PR #170) put the answer at `/dashboard/metalab` behind the product's
auth, with the research SQL in a top-level `analytics/` directory. That coupled a
tool we want to break weekly to a product we want to keep stable, and gave the
research directory no owner. Separately, the existing `node_skill_cooc`
materialized view already computed co-occurrence — but at the wrong grain.

## Decisions

### 1. One canonical position is one observation

Edges are counted over `unique_vacancies`, not `vacancies`. A job reposted on
Djinni and DOU is one market fact, not two. MET-128 made the position group
mandatory in the database, which is what makes this enforceable rather than
aspirational.

`node_skill_cooc` is posting-grain and requirement-blind: 43,221 pairs against
19,498 here, with pair counts averaging 3.3× larger. It was rebuilt rather than
reused. Fixing the view itself is MET-131, deliberately sequenced *after* the lab
settles its metric shape so the definition is written once.

### 2. The v0 contract is conservative and stated in the UI

```
grain             = canonical position
requirement layer = REQUIRED only
eligibility       = nodes.type = SKILL AND status = VERIFIED
aggregation       = representative member only
min skill support = 25   ·   min pair support = 10
liveness claim    = none
```

The support floors are not taste. Measured: lift above 100 appears routinely at
6–9 shared positions. The floors are the fix; a cleverer formula is not.

Aggregation rule was measured rather than assumed: representative-only vs
member-union moves NPMI rank correlation only to ρ = 0.9984, and the top 25 edges
shift by at most 0.009. 88% of positions have exactly one member, so the rules
are definitionally identical on most of the corpus.

### 3. Rank by NPMI, explain with lift, verify with counts

Raw co-occurrence is never offered as a standalone ranking. SQL + Python is the
second-largest pair in the corpus at lift 1.28 and NPMI 0.091 — popularity, not
relationship. All three numbers stay visible so an edge can be argued with.

### 4. Role is a control, not a filter

Conditioning inside a role changes conclusions materially: Docker/Kubernetes
falls from lift 3.63 to 1.19 inside DevOps, TypeScript/React from 4.13 to 1.19
inside Full Stack, I2C/SPI from 43.1 to 3.14 inside Embedded. No edge fell below
independence — none is pure artifact — but global lift overstates the ecosystem
effect by 2–14×.

In-role pairs carry their own support floor (default 25). A role is a smaller
denominator, so the global floor of 10 lets the sparse tail back in.

### 5. The lab is an isolated app reading a committed artifact

`apps/lab` is Vite + React, in the workspace but outside every shared task. The
mechanism is script naming: `lab`, `lab:build`, `lab:check`, `lab:data` — nothing
called `dev`/`build`/`lint`/`test`, so `pnpm dev`, `pnpm lint` and `pnpm
build:all` skip it with no exclusions to keep in sync. **Renaming a lab script to
a standard name silently undoes this.**

Script naming isolates *commands*, not *dependency resolution* — a distinction CI
taught us within ten minutes. The lab's scaffold pinned TypeScript 6 while the
repo runs 5.x; root `ts-node` declared no typescript of its own, so it resolved
the highest version in the workspace and two unrelated scripts
(`analytics:catalog`, `seo:audit`) failed on promoted deprecation errors. The
root now pins its own `typescript`, so shared tooling no longer depends on what
any app happens to add. Adding a package to this workspace can still shift
versions for everyone; only an explicit root pin prevents it.

The app reads one committed JSON and never queries a database at runtime.
Regeneration is explicit, against a local restore of a prod dump; the pipeline
wrapper refuses any `DATABASE_URL` that is not the lab one. Committing the
artifact means the UI can only show numbers that were reviewed.

## Consequences

**Accepted:** the artifact goes stale after a taxonomy migration until someone
runs `lab:data`. This is the price of reproducibility and is preferred to a UI
that silently changes under the reader.

**Accepted:** two implementations of co-occurrence exist until MET-131 lands.

**Open — the taxonomy is flat.** `nodes` has no parent/child relation. Measured on
2026-08-08: 87 edges and 119 of 420 skills look like duplicates, but most are
legitimate subsumption (SQLAlchemy→Python at P=1.00, Expo→React Native,
Pinia→Vue.js) that the model cannot express. Genuine duplicates are few and are
handled by the `skill-dupes-v1` migration plan. A hierarchy would let the graph
fold children into parents on demand; it is not adopted here.

**Open — no trend is possible.** The corpus is roughly 14 weeks, and the only
honest axis is when we observed a posting, not when it was published. Trends
require weekly snapshots starting now.

**Open — `is_required` is unvalidated.** Every REQUIRED↔REQUIRED number inherits
the extractor's error until MET-24 produces a measured baseline. Exploratory
research is fine; user-facing claims are not.

**Known limit that no threshold fixes:** the strongest surviving edge in the
graph, TensorFlow/PyTorch (P = 0.97, lift 43.5, 6.62 within AI Engineer), is a
pair of *substitutes*. Postings say "TensorFlow or PyTorch". The maths is right
and the reading "learn them together" is wrong. Any prescriptive layer needs a
substitute gate, and it cannot be built from NPMI.

## Alternatives rejected

- **Reuse `node_skill_cooc`** — wrong grain, requirement-blind, support floor of 3.
- **Keep the tool in `apps/web`** — couples research cadence to product stability.
- **A separate repo** — loses the shared database schema and one-command setup.
- **ClickHouse / a graph database** — 12,288 positions. Postgres is not the limit.
