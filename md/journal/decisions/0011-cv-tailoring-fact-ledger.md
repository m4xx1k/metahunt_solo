# ADR-0011 — CV tailoring as a fact-locked transform (fact ledger + subset guard)

**Status:** proposed
**Date:** 2026-07-10
**Context (in time):** reverse-ATS (ADR-0006) + CV-backed subscriptions (ADR-0008) are live; this adds "tailor my CV to this job" on top. Extends, does not replace, `ExtractCandidate`.

## Context

We want to turn a match ("you fit this role 82%") into an apply-ready tailored CV + cover letter, inside the funnel we already own (parsed resume + structured vacancy). The whole tailoring category (Rezi/Teal/"ChatGPT my CV") shares one fatal defect the founder named as the #1 requirement: they free-generate bullets and invent employers, numbers, and tech the candidate never had. One fabricated claim fails the interview and burns trust — worse than no tool. So the architectural question is not "how do we generate a CV" but **"how do we guarantee the output states no fact the source CV doesn't."**

## Options

### Option A — free LLM generation with a "please stay truthful" prompt
- ✅ trivial to build; fluent output.
- ❌ unfalsifiable — no mechanism *proves* the output didn't drift. This is exactly the competitor failure mode. Rejected outright.

### Option B — constrained transform + deterministic subset guard (chosen)
- Extraction lifts the CV into a **fact ledger**: every bullet is a fact atom with a verbatim `sourceSpan` and a normalized `entities` set (tech/orgs/metrics/dates/titles). Tailoring may only SELECT / REORDER / REPHRASE atoms. A Tier-1 deterministic guard asserts each output bullet's entity-set ⊆ its source atom's entity-set; a gated Tier-2 LLM catches semantic inflation. Drift → fall back to the verbatim source bullet, surfaced in a before⇒after diff the user approves.
- ✅ falsifiable and mostly LLM-free; the guard is the product's proof.
- ❌ more moving parts; extraction must populate `entities` well or legit rephrases get flagged (mitigated by global-ledger fallback + user override).

### Option C — template-only (no LLM ever, pure SELECT/REORDER of verbatim bullets)
- ✅ zero hallucination by construction, zero spend.
- ❌ no rephrase → weaker tailoring. Adopted as the **v1 default**; B's rephrase is the opt-in upgrade.

## Decision

**Option B, shipped C-first.** The invariants are: (1) **provenance** — every output bullet carries `sourceBulletId`; (2) **subset** — output `entities` ⊆ source `entities`, no new tech/number/employer/date/title ever; (3) **approval** — nothing renders/sends until the user OKs the diff. The vacancy is a SELECT/emphasis signal **only**, never a fact source — this is what kills JD keyword-stuffing.

v1 ships the deterministic spine (SELECT/REORDER of verbatim bullets + the Tier-1 guard + the diff UI), which cannot hallucinate. The LLM `TailorResume` (rephrase) and Tier-2 `VerifyTailoredBullet` are built and wired but **gated OFF** behind an explicit opt-in (respects the "no surprise LLM spend" rule), on the cheap `deepseek-v4-flash` client. Structured extraction persists to a **new nullable** `candidates.structured` jsonb; tailored variants to a **new** `cv_variants` table — both additive and reversible (`DROP COLUMN` / `DROP TABLE`), forward-only.

## Consequences

- **Enables** a differentiator competitors structurally can't match: "AI rewrites only what you proved, and shows you the diff." The guard is unit-testable and provable with zero LLM.
- **Ranking/extraction untouched** — `ExtractCandidate`, `candidate_nodes`, `node_stats`, and the existing upload path are byte-identical; the structured resume is a parallel, gated addition.
- **Prices we pay:** extraction-recall quality gates rephrase false-positives (fallback + override mitigate); `ExtractResume` is unvalidated on messy PDFs in v1 (demo seeds curated YAML); idempotency must be versioned before wiring structure into upload (v2).
- **Sets up** v2 (LLM tailoring auto-populating the diff, structure-on-upload) and v3 (grounded cover letters, Typst PDF, paid gating, auto-tailored digest).
- **Rollback:** drop `cv_variants` + the `structured` column, revert the CV controller/service additions and the `/cv-tailor` route; nothing else moves.
