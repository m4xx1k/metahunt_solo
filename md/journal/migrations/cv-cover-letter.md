# cv-cover-letter — tailored CV + cover letter, fact-locked (no hallucination)

**Branch:** `feat/cv-cover-letter` (worktree `/home/maxxik/solo/metahunt-wt-cvcl`) · **Status:** v1 in progress
**Started:** 2026-07-10 · **Closed:** —
**Sits atop:** reverse-ATS (ADR-0006), CV-backed subscriptions (ADR-0008), Telegram auth, BAML extraction (ADR-0004)
**Proposed ADR:** 0011 — the anti-hallucination contract (fact ledger + subset validation)

> Built in an isolated git worktree (off clean `origin/main`) so the concurrent
> `feat/additional-skills` session's working tree is untouched. Rebase onto the
> updated `main` once that PR lands.

## 1. Problem & why it's the wedge

metahunt already reads a CV (`ExtractCandidate`), resolves its skills to the taxonomy, and
ranks every vacancy against it (reverse-ATS, `SkillDiff` = have/missing/bonus). The user
already knows *"I match this job 82%."* The next click they want is *"then make me the CV and
cover letter for it."* That is the wedge: we own the two inputs a tailoring tool normally has
to ask for — a **parsed resume** and a **structured vacancy** — so we can go from match →
apply-ready artifacts with one button, inside the funnel the user is already in.

The whole category (Rezi, Teal, kickresume, "ChatGPT my CV") has one fatal defect the founder
named as the #1 hard requirement: **нічого не повинно плисти** — nothing may drift. Those tools
free-generate bullets and cheerfully invent employers, numbers, and tech the candidate never
touched. A CV with one fabricated claim is worse than no tool at all: it fails the interview and
burns trust. Our differentiator is not "AI writes your CV" — it is **"AI rewrites only what you
already proved, and shows you the diff."** The anti-hallucination architecture (§5) *is* the product.

## 2. Reference — the founder's `~/solo/cv` groundwork

This feature productizes a workflow the founder already runs by hand.

- **`e/data/resume.yaml`** — the data contract. Schema: `name`, `title`, `contacts{location,
  email,phone,linkedin,github,telegram}`, `summary` (folded string), `skills[]{group, items}`
  (items = `" · "`-joined string), `experience[]{role, org, dates, context, bullets[], max?}`,
  `projects[]{name, meta, context, link, bullets[]}`, `education[]{degree, school, dates}`.
  Header comment, verbatim: *"No invented facts/metrics — numbers verified against the prod dump
  / portfolio."* That rule is the spec.
- **`e/cv-onepage.typ`** — Typst reads `yaml("/resume.yaml")` and renders. The YAML stays a full
  superset; the template trims via `slice(0, min(cap, len))` where `cap = entry.max ?? EXP_BULLETS`.
  Three styles (`onepage`/`vantage`/`modern`) all read the *same* YAML.
- **`l3/{backend-v1,fullstack-v1}/resume.yaml`** — two role variants of the *same person*. Diffing
  them shows exactly what a tailored variant is allowed to be: **summary rephrased**, **skill
  groups reordered/relabeled** (Frontend floats up for full-stack), **bullets selected & reordered**
  from a shared pool, per-entry `max:` caps how many show. Employers, numbers (`~59K`, `2,800+`,
  `~40%`), and tech are **byte-for-byte identical** across variants.
- **`l3/research/`** — the "bullet pool" (`bullets.md`, variants per achievement) + "raw
  experience" (ground-truth inventory with honesty flags, e.g. *"EPAM … FABRICATED → DROPPED"*).
  Our structured resume (§3) *is* that pool, made queryable and grounded to source text.

## 3. Data model — full resume schema with provenance

Today `ExtractedCandidate` is flat: `{role, seniority, skills{required,optional}, experienceYears,
englishLevel}` — no work history, no bullets (confirmed: `extract-candidate.baml`). We add a
**parallel** structured resume shaped like the founder's `resume.yaml`, where every atomic claim
is a **fact atom** carrying provenance back to `candidates.source_text` (already retained).

```jsonc
// ExtractedResume — persisted on the NEW nullable jsonb column candidates.structured
{
  "name": "…", "title": "…", "contacts": { … },
  "summary":  { "id": "sum", "text": "…", "sourceSpan": "…", "entities": { … } },
  "skills":   [{ "group": "Backend", "items": ["TypeScript","NestJS", …] }],   // items ⊆ ledger
  "experience": [{
    "id": "exp1", "role": "…", "org": "…", "dates": "…", "context": "…", "max": 5,
    "bullets": [{
      "id": "exp1.b1",
      "text":       "Built the pipeline that unifies 80+ supplier catalogs …",
      "sourceSpan": "<verbatim substring the bullet was distilled from>",
      "entities": {                    // the fact-set — the unit of the subset check
        "tech":    ["Elasticsearch","SQS"], "orgs": ["Beana AI"],
        "metrics": ["59K","2M+","1.5K/min"], "dates": ["Sep 2025"], "titles": []
      }
    }]
  }],
  "projects":  [{ "id":"pr1", "name":"…", "meta":"…", "link":"…", "bullets":[ …same shape… ] }],
  "education": [{ "degree":"…", "school":"…", "dates":"…" }]
}
```

- **Storage.** New **nullable** `jsonb` column `candidates.structured` (reversible: `DROP COLUMN`,
  no table rewrite). Leaves the load-bearing NOT NULL `extracted`/`source_text` untouched.
- **The fact ledger (derived, not stored).** Union every atom's `entities` into a global
  allow-list: `allowedTech/Orgs/Metrics/Dates/Titles`. Nothing downstream may reference an entity
  outside this set.
- **Tailored variants** get their own rows (new `cv_variants` table): `{id, candidate_id,
  vacancy_id (nullable text), kind: 'tailored'|'cover_letter', payload jsonb, approved_at,
  created_at}`. Reversible: `DROP TABLE`. A tailored payload is a **mapping** (§5.3), never free prose.

## 4. Pipeline — extract → structure → tailor → verify → approve

```
upload (PDF/txt) ─ extractText (unpdf) → source_text                        [EXISTS]
  └─ ExtractCandidate(text)  → flat ExtractedCandidate (ranking)            [EXISTS, untouched]
  └─ ExtractResume(text)     → ExtractedResume + ledger  → candidates.structured   [NEW, gated §7]
       └─ tailor(resume, vacancy)  → tailored mapping (SELECT/REORDER[/REPHRASE])  [NEW §5.3]
            └─ subset guard (Tier-1 deterministic; Tier-2 LLM, gated)  → drift flags [NEW §5.4]
                 └─ before⇒after diff UI  → user approves per bullet     [NEW §5.5]
                      └─ render tailored resume (HTML preview v1; Typst PDF later)
                      └─ cover letter (grounded)  → §6 (later phase)
```

- **Extract → structure** reuses the taxonomy-grounded BAML pattern (`b.ExtractResume(text, roles,
  {collector})` on `DeepSeekClient`, thinking disabled). Kept **separate** from the live upload
  path — the existing `contentHash` idempotency would otherwise skip re-extraction (blocker noted
  by exploration). v1 seeds `structured` from the founder's real `resume.yaml` (§8), so the demo
  needs **zero** extraction spend.
- **Tailor** input = `ExtractedResume` + a `VacancyDto` (or pasted JD → resolved skills). Output =
  a constrained mapping (§5.3), ranked by the existing reverse-ATS overlap/IDF signal
  (`RankingService.resolveSkills` + `node_stats.weight`).

## 5. THE ANTI-HALLUCINATION ARCHITECTURE (centerpiece)

### 5.1 Principle
**Tailoring is a constrained transform over a fact-locked source, never generation.** The model
may choose which real bullets to show, in what order, and reword them — nothing else. Three
enforced invariants:
1. **Provenance** — every output bullet carries `sourceBulletId`. No bullet without a parent.
2. **Subset** — an output bullet's entity-set ⊆ its source bullet's entity-set. No new tech,
   number, employer, date, or title. Ever.
3. **Approval** — nothing renders/sends until the user OKs the before⇒after diff.

### 5.2 The fact ledger
Extraction binds each bullet to a verbatim `sourceSpan` + a normalized `entities` set. BAML
`@description` enforces grounding: *"`text` must be fully supported by `sourceSpan`; put every
tech/number/employer into `entities`; never add a fact the CV doesn't state."* The ledger is the
closed universe every later stage is checked against.

### 5.3 Constrained tailoring — SELECT / REORDER / REPHRASE
`tailor(resume, vacancy)` emits a **mapping**, not text:
- **SELECT** — pick which bullets to include + per-entry `max`. Relevance = overlap of a bullet's
  `entities.tech` with the vacancy's required/optional skills, IDF-weighted. Drop the rest (shown
  collapsed, restorable).
- **REORDER** — order retained bullets and skill groups by that relevance.
- **REPHRASE** — rewrite *wording only*, hard-constrained: output `entities` ⊆ source `entities`.
  Output shape `{sourceBulletId, text}`. **v1 default does NOT rephrase** (verbatim reuse = zero
  hallucination risk by construction); LLM rephrase is opt-in (§7).

**The vacancy is a SELECT/emphasis signal, never a fact source.** REPHRASE may not pull a tech
from the JD, from another bullet, or from thin air. This kills the dominant competitor failure
mode: keyword-stuffing the JD's stack into a CV that never had it.

### 5.4 Subset validation — two-tier guard
- **Tier 1 — deterministic, no LLM** (`subset-guard.ts`, pure, unit-tested). Recompute the output
  bullet's entity-set (tech via a lexicon seeded from the candidate's own ledger; metrics via
  regex; orgs/dates/titles via ledger match). Assert `output ⊆ source`. Flags:
  - tech token not in source bullet (and not in `allowedTech`) → **DRIFT: added tech**.
  - number not a verbatim token of the source → **DRIFT: invented metric** (`2,800`↛`3,000`;
    `~40%`↛`~50%`; `80+` may not lose the `+`).
  - org/date/title outside the ledger → **DRIFT**.
- **Tier 2 — BAML `VerifyTailoredBullet`** on the cheap client, only on Tier-1 survivors. Catches
  semantic inflation Tier 1 can't (*"helped"*→*"led"*, *"contributed to"*→*"owned"*). Gated to
  the opt-in LLM path.
- **On DRIFT** → the rephrase is rejected and the pipeline **falls back to the verbatim source
  bullet**; the flag is surfaced, never silently dropped.

### 5.5 Before⇒after approval UI
Per-bullet diff: `source → tailored`, with `sourceBulletId`, the entity ledger as chips, and any
drift flags. Approve / edit / revert each bullet; manual edits re-run Tier 1 live (an edit that
adds an off-ledger tech lights red). Nothing renders until approved. This is the founder's
`l3/history/` snapshot discipline turned into a product surface.

## 6. Cover-letter generation (later phase)
Assembled from evidence, not free-hand. Input = the *approved* tailored bullets' fact-set +
vacancy. May only assert facts mapping to an approved atom or the vacancy text; a
`VerifyCoverLetter` pass rejects any sentence stating a resume fact not in the ledger. v1 ships a
deterministic grounded skeleton (intro + N evidence bullets + close) so the surface exists with
zero spend; the LLM draft is a later phase.

## 7. LLM spend policy (respects the "no surprise spend" rule)
- Default path = **deterministic** SELECT/REORDER of verbatim bullets: free, instant, cannot
  hallucinate. This is what the page shows out of the box.
- LLM `ExtractResume` / `TailorResume` (rephrase) / `VerifyTailoredBullet` are **built + wired but
  gated** behind an explicit opt-in toggle ("uses your DeepSeek key"), OFF by default, on the cheap
  `deepseek-v4-flash` client. Not auto-run; tested against fixtures/mocks, not live calls.

## 8. Phased plan
- **v1 (this branch) — the spine, deterministic, zero forced spend.** New nullable
  `candidates.structured` + `cv_variants` table; `ExtractedResume`/tailor/diff contract types;
  Tier-1 subset guard + unit tests; deterministic tailor service + `/cv/:id/tailor` + live
  `/cv/tailor/verify` + `/cv/tailor/guard-demo`; seed founder `resume.yaml` → structured sample;
  `/cv-tailor` before⇒after page + small home-feed entry button; HTML one-page preview. LLM
  functions wired but gated.
- **v2 — constrained LLM tailoring.** `TailorResume` auto-populating the diff; Tier-2 verify;
  wire `ExtractResume` into (a versioned) upload path so real user CVs get `structured`.
- **v3 — grounded cover letters + monetization.** `DraftCoverLetter` + `VerifyCoverLetter`;
  free/paid gating; auto-tailored CV attached to the subscription digest. Typst PDF render.

## 9. Risks & open questions
- **PDF render deferred** — Typst-in-prod (binary + fonts, sync vs worker) is a v3 decision; v1
  renders a styled HTML one-pager instead.
- **`ExtractResume` unvalidated on live CVs** — v1 seeds from curated YAML; the BAML extraction
  path is wired but not exercised against messy PDFs yet (offsets/provenance accuracy is the hard
  part; may need reasoning back on or a stronger model).
- **Idempotency** — re-uploading a CV reuses old `extracted` and skips the LLM; a versioned/​
  namespaced hash or `extracted` schema-version guard is needed before v2 wires structure into upload.
- **Entity-recall false positives** — under-populated source `entities` can flag a legit rephrase;
  mitigation: global-ledger fallback for tech, strict for numbers, user override on the diff.
- **Number/date normalization** — canonical token form for `"Sep 2025 – Present"`, `"80+"`,
  `"~40%"`, ranges, so the strict check isn't brittle.
- **Output language** — CVs are UA/RU/EN; founder ships English. Auto-detect vs force-English?

## 10. Build log
- 2026-07-10 — exploration (ETL pipeline, DB, web, `~/solo/cv`) complete; concept locked; worktree
  + reversible-migration plan set. Implementation started.

## Links
- Founder groundwork: `~/solo/cv/{e/data/resume.yaml, e/cv-onepage.typ, l3/{backend-v1,fullstack-v1}/resume.yaml, l3/research/, l3/history/}`.
- Existing pipeline: `apps/etl/src/03-discovery/cv/` (controller/loader/extractor/text-extract/contract),
  `apps/etl/baml_src/{extract-candidate,clients}.baml`, `apps/etl/src/03-discovery/ranking/`.
- Schema: `libs/database/src/schema/{candidates,cv-variants}.ts`. Web: `apps/web/app/cv-tailor/`,
  `apps/web/lib/api/cv-tailor.ts`.
- Related: reverse-ATS (`md/journal/migrations/reverse-ats.md`), CV subscriptions, ADR-0004/0006/0008.
