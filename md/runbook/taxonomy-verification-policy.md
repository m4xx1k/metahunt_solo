# Taxonomy verification policy

What makes a taxonomy node (SKILL / ROLE / DOMAIN) `VERIFIED` vs left `NEW` vs
`HIDDEN`. This is the human curation contract — verification is now a deliberate
decision, not an automatic side-effect of how often a node appears.

## Why this exists (what changed 2026-06-17)

The old `autoVerifySkills` pass promoted any SKILL seen in ≥5 vacancies across ≥2
companies to `VERIFIED` on a 24h Temporal schedule. **Removed.** The threshold was
opaque and one-directional: it promoted whatever happened to be *frequent*
(including junk umbrella-aliases and miscanonicalised fragments) and never demoted
anything. Frequency is not quality — a typo or a marketing buzzword can be common.

Verification now flows only through the operator write-path
(`PATCH /admin/taxonomy/nodes/:id/verify|hide`, `…/merge-into/:targetId`,
`…/rename`), driven by the `taxonomy-review` skill. Mention count survives only as
a **triage signal**: `vacanciesBlocked` ranks the NEW queue so the highest-impact
nodes get reviewed first — it no longer promotes anything on its own.

## What VERIFIED grants (the stakes)

A `VERIFIED` node is load-bearing, so the bar is real:

- **Public visibility** — the `/vacancies` feed surfaces only `status='VERIFIED'`
  role/domain/skills, and hides vacancies that have no verified role
  (see [overview.md](../architecture/overview.md) `VacanciesModule`).
- **Extraction feedback** — the BAML extractor is seeded with VERIFIED ROLE +
  DOMAIN canonical names as prompt hints, so a bad VERIFIED node propagates into
  future extractions.

`NEW` = ingested, awaiting review (invisible to users). `HIDDEN` = reviewed-and-rejected (never resurfaces).

## Decision rules

Apply per node; when two rules collide, **HIDE > keep-NEW > VERIFY** (the cautious
direction — a wrongly-VERIFIED node leaks to users and into prompts).

### VERIFY — only when *all* hold

1. It names a **real, canonical** thing in its axis:
   - **SKILL**: a concrete technology — language, framework/library, tool,
     platform, cloud service, datastore, protocol, or a named engineering
     practice (e.g. `Python`, `React`, `Kubernetes`, `PostgreSQL`, `gRPC`, `CI/CD`).
   - **ROLE**: a real job function in scope (dev-core + QA/DevOps/Data/security).
   - **DOMAIN**: a genuine industry/product area (`fintech`, `gamedev`, `healthtech`).
2. It is the **canonical spelling**, not a duplicate/alias of an existing node
   (if it duplicates one → `merge-into` the canonical instead of verifying).
3. It is **specific enough to be useful** as a filter facet — not a catch-all.

### Keep NEW — when it's plausibly real but not yet clean

- Ambiguous casing/spelling that may need a `rename` first.
- A likely duplicate whose canonical target you haven't confirmed yet.
- Low-signal but not junk — leave it in the queue rather than verify-or-hide blindly.

### HIDE — when it's not a real taxonomy entry

- Junk: typos, truncated fragments, encoding garbage.
- Out of axis: a company/product name extracted as a skill; a non-tech role.
- **Umbrella aliases**: vague buckets that swallow distinct skills
  (e.g. a single node aliasing many unrelated tools) — hide and let the specific
  nodes stand on their own.
- Out of scope: PM/design/sales/marketing roles (the ingest tech-filter already
  drops most — see [tech-filter](../todo/ats-sources/tech-filter-implementation.md)).

## How to run a pass

Use the `taxonomy-review` skill — it shortlists junk/dupes/misnamed canonicals
among NEW/VERIFIED nodes, recommends HIDE/MERGE/RENAME/VERIFY with reasons, and
applies them only after you confirm. Trigger after a curation gap, after an ingest
spike, or before a prod taxonomy deploy.
