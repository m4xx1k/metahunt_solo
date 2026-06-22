# IT-vacancy filter redesign

Status: research, 2026-06-12. Applies to current RSS pipeline; ATS sources (see [integration-research.md](../../../todo/ats-sources/integration-research.md)) make it more urgent — ATS boards carry the whole company (sales/legal/HR), not a pre-filtered IT feed.

## 0. Why media buyers leak — two confirmed bugs in `vacancy-filter.ts`

**Bug 1 — all Cyrillic patterns are dead code.** JS `\b` is ASCII-only (`\w = [A-Za-z0-9_]`); around Cyrillic letters it never matches. Verified live:

```
/\bбухгалтер\b/i .test("Бухгалтер (Київ)")        → false
/\bдизайнер\b/i  .test("Графічний дизайнер")      → false
/\bрозробник\b/i .test("Розробник Python")        → false   // whitelist also affected
```

Every Cyrillic entry (бухгалтер, дизайнер, електрик, бригада…, розробник, архітектор) has never fired. Fix: Unicode boundaries `(?<![\p{L}\p{N}])term(?![\p{L}\p{N}])` with `/u` (verified working).

**Bug 2 — generic seniority words in the whitelist outrank missed function words.** First-match-wins: blacklist has `media\s?buyer` but the title is "Media **Buying** Team Lead" → blacklist misses → whitelist `team lead` fires → passes. Same shape: "Affiliate Lead" only survives because `affiliate` happens to be blacklisted; any marketing function the blacklist spells slightly differently (user acquisition, media buying, influencer, ASO, retention, CRM…) + any generic whitelist word (lead, head — wait, that's blacklisted, team lead, cto, stack…) = leak.

**Plus: zero observability** — the stage-logging code is commented out (`vacancy-filter.ts:72-110`), so leak/false-block rates are invisible.

## 1. Frame: it's two different gates, not one

| Gate | Question | Cost of error | Right tool |
|---|---|---|---|
| **Ingest (pre-LLM)** | "worth spending extraction tokens?" | false-pass = cents; false-block = lost vacancy **forever** | cheap & *recall-biased* (regex / structured fields) |
| **Serve (post-extraction)** | "show this to users?" | false-pass = junk in digest (user's complaint) | *precision-biased*, full-text-informed (LLM already read it) |

Today one regex tries to be both → it's simultaneously too strict (UNKNOWN→block kills unusual-but-legit titles forever, e.g. "LLM Researcher") and too leaky (bug 2 junk goes straight to users). Untangle them.

## 2. Proposed design (layered, each layer cheap)

### Layer 1 — ingest regex (keep, fix, re-bias)

- Fix Unicode boundaries (bug 1); normalize title (lowercase, collapse separators) before matching.
- Blacklist: match **stems**, not exact job titles: `media\s?buy`, `user\s?acquisition`, `influencer`, `aso\b`, `retention`, `crm`, `link\s?build`… — function words beat seniority words by construction (blacklist runs first).
- Keep UNKNOWN→block **for RSS** (djinni/dou are IT-heavy, standard titles; the strict default is fine there) but log it (Layer 4) so false-blocks become visible.

### Layer 2 — ATS structured prefilter (free, deterministic — new)

ATS jobs arrive with `department`/`team` ("Engineering", "Marketing", "People"). Before any regex:
- dept ∈ {engineering, data, it, r&d, security, platform, devops, infrastructure} → **pass** (skip title regex entirely — saves "Growth Engineer"-type titles the regex would eat);
- dept ∈ {sales, marketing, people, hr, talent, finance, legal, support, success, operations, admin} → **block**;
- missing/other → fall through to Layer 1 regex.

This will carry most of the ATS filtering load; title regex becomes the fallback, not the front line.

### Layer 3 — serve gate via extraction (the leak-killer — new)

Add one field to the BAML schema: `isIt: bool` ("is this an IT/tech-sector role: engineering, QA, DevOps, data, security, tech design/PM…? Media buying, copywriting, recruiting, sales, accounting → false"). Marginal cost ≈ 0 — same LLM call, it already read the full description.

- Loader stores it on `vacancies.is_it` (boolean, nullable for old rows).
- Feed/digest/market queries add `is_it IS DISTINCT FROM false` → a leaked media buyer **never reaches a user**, regardless of regex.
- Old rows: null = shown (status quo); optional one-line backfill `is_it=false` where roleNode maps to obviously-non-IT nodes.

Alternative considered — gate by taxonomy (`role_node_id` must map to a VERIFIED IT role): rejected as primary because new legit roles sit in candidate_nodes for a while and would flicker out of the feed; taxonomy state shouldn't gate visibility. The bool is independent and stable. (Taxonomy can still be a *signal* for auditing isIt disagreements.)

### Layer 4 — observability (resurrect the dead code, minimally)

Per-ingest counters in the finalize note: `blocked_blacklist / blocked_unknown / passed_whitelist / passed_dept / llm_rejected (isIt=false)`. Plus keep blocked titles queryable (they're in the raw S3 payload already — a weekly sample query is enough, no new table). This is how regex lists get maintained from data instead of vibes.

## 3. Considered and rejected (for now)

| Option | Verdict |
|---|---|
| LLM-classify every title pre-extraction (haiku batch) | unnecessary — isIt rides the existing call for free; a second model call adds latency/cost for the same answer |
| Embedding classifier (centroid/logreg over title embeddings, pgvector already in stack) | good v2 if regex maintenance becomes annoying; multilingual & ~$0.00002/title; but it needs labeled data + threshold tuning — overkill while Layers 1-3 are unproven |
| Drop ingest filter entirely, LLM everything | ATS GLOBAL tier would ~2× extraction volume on guaranteed junk (sales/HR at big cos); regex+dept gate is one screen of code |
| ML/keyword scoring with weights | complexity without a failure mode to justify it |

## 4. Scope decision (RESOLVED 2026-06-12): dev-core + QA/DevOps/Data, no PM/design

Rationale: cv-match is IDF-weighted skill-node overlap (`ranking.service.ts` rankByRefs, `node_stats.weight = ln(N/(df+5))`). It works when skills are discriminative (dev: Rust≠React≠Kafka; acceptable for QA/DevOps/Data: Playwright, K8s, Airflow). For PM/design the entire skill axis is high-df (Jira, Scrum, Figma) → IDF correctly zeroes it → no ranking signal left. Their discriminative axes (domain, B2B/B2C, product stage, craft specialization) aren't modeled in taxonomy or extractable from CVs — supporting them = a second matching axis + a second junk-node class in taxonomy curation. Structural, not deferred-for-effort.

Consequence: blacklist keeps killing PM/designer/BA titles; `isIt` semantics = dev + QA + DevOps/SRE + data + security + tech-adjacent (engineering management). Revisit only if the product deliberately expands beyond skill-overlap matching.

## 5. Effort

Layer 1 fix + Layer 4 counters: ~half a day incl. tests against a sample of historical titles.
Layer 3 (BAML field + column + feed predicate): ~half a day.
Layer 2: lands with ATS P1 adapters naturally.
