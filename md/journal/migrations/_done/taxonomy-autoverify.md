# taxonomy-autoverify — threshold-driven skill verification

**Branch:** `feat/taxonomy-autoverify`
**Status:** SUPERSEDED — removed 2026-06-17 (branch `refactor/skill-verify`)
**Started:** 2026-06-10 · **Closed:** 2026-06-17

## Outcome

Shipped, then **reverted**. The ≥5-vacancy / ≥2-company threshold promoted
whatever was *frequent* (junk umbrella-aliases, miscanonicalised fragments) and
never demoted — frequency isn't quality. Auto-promotion (`autoVerifySkills`, the
scheduler, workflow, activity, and the `taxonomy-autoverify` Temporal schedule)
was removed; verification is now a deliberate operator decision. The mention
count survives only as a triage signal that ranks the NEW review queue.

See the replacement contract: [taxonomy-verification-policy.md](../../../runbook/taxonomy-verification-policy.md).

The rest of this tracker is kept for history.

## Context

Audit (2026-06-10, local DB snapshot): extraction is healthy (avg 6–12 skills/vacancy, 1.3% raw-zero), but the feed/facets/digests show only VERIFIED skills and only 260/6153 skill nodes were VERIFIED — all biased toward the fullstack/backend stack. Result: Hardware Engineer had 21% of vacancies with zero visible skills (41% with ≤1), ERP 22%, Network 13%, SysAdmin/Software Engineer ~20% ≤1. 37% of all vacancy→skill links pointed at invisible NEW nodes. 137 vacancies were fully hidden behind NEW duplicate roles.

Model flip: verification is threshold-driven (usage promotes), the operator only demotes junk (HIDden is final — the auto-pass never touches it). Cheaper to un-verify the rare junk than to hand-verify a 6k backlog that regrows daily.

## Subtasks

- [x] T0 — separator-insensitive alias normalization (`normalizeAliasName`, migration 0019) — *done when:* "REST Assured"/"rest-assured"/"RestAssured" resolve to one node; migration dry-run keeps (type,name) unique — `b440a6a`
- [x] T1 — VERIFIED skill vocabulary in extraction prompt (PROMPT_VERSION 3) — *done when:* `ExtractVacancy` receives `knownSkills`; baml tests updated — `ec03f60`
- [x] T2 — auto-verify Temporal schedule (daily, ≥5 vacancies & ≥2 companies, NULL company = own company) — *done when:* schedule installs on bootstrap, activity promotes idempotently — `24bc1d0`
- [x] T2.5 — `taxonomy-review` skill (curation stays human-in-the-loop tooling, NOT prod code — rejected an in-pipeline LLM judge) + Railway day-2 ops runbook section — *done when:* skill shortlists junk/dupes and applies verdicts via admin API after confirmation
- [ ] T3 — prod rollout (see plan below) — *done when:* prod feed shows skills for Hardware/QA vacancies; `pct zero visible` per role drops to raw-extraction levels
- [ ] T4 — role dedup in prod: merge ~95 NEW role dupes into VERIFIED umbrellas via admin merge — *done when:* 0 vacancies hidden behind NEW roles
- [ ] T5 — re-extraction batches: Python Developer (72) + .NET Developer (120) after merging those roles into Backend Developer; Software Engineer (516) after prompt tightening; 89 raw-zero-skill vacancies — *done when:* batches re-extracted under PROMPT_VERSION 3

## Prod rollout plan (T3)

Order matters: normalization must land before the first auto-verify fire, otherwise the pass promotes spelling-variant duplicates.

1. **Pre-merge junk sweep — run the `taxonomy-review` skill** (`.claude/skills/taxonomy-review/SKILL.md`) against prod: it shortlists junk/dupes among threshold-crossing candidates and HIDEs confirmed junk before the first auto-verify fire. HIDDEN is sticky: the auto-pass skips it forever. Same skill is the recurring cleanup tool after each promote.
2. **Merge PR → Railway deploy.** Pre-deploy step runs migration 0019 (alias re-normalization, data-only). App bootstrap installs the `taxonomy-autoverify` Temporal schedule.
3. **First promotion.** Either wait ≤24h for the schedule, or trigger `taxonomyAutoverifyWorkflow` manually from the Temporal UI for immediate effect. Activity log lists every promoted name — skim it.
4. **Verify.** Spot-check feed cards for Hardware/QA/Network vacancies (skills now visible); facet sidebar shows TestRail/I2C/KiCad-class skills; re-run the per-role zero-visible-skill query and compare against the audit numbers above.
5. **Rollback lever.** Junk that slipped through → HIDE the node (one click, permanent). No code rollback needed; the schedule is SKIP-overlap and idempotent.

## Decisions

- **Thresholds ≥5 vacancies AND ≥2 companies, NULL company counts as its own company.** Strict `count(DISTINCT company_id) >= 2` would drop 47 of 1073 qualifying skills because 33% of vacancies have `company_id NULL`. `coalesce(company_id::text, vacancy_id::text)` loses only 2. The company guard exists to stop one employer's jargon from self-verifying.
- **No embedding similarity for node dedup.** Same false-merge risk class as vacancy dedup (Java≈JavaScript); 90% of dupes are spelling variants caught deterministically by separator-insensitive alias keys + the prompt vocabulary closing the loop.
- **Roles are NOT auto-verified.** A NEW role gates whole-vacancy visibility; auto-promoting role dupes would create duplicate facets. Roles stay manual (merge into umbrellas, T4).
- **Singleton tail (~2.8k NEW skills with 1 vacancy) stays NEW.** Mixed quality; below threshold by design.

## Links

- Releases: *(on close)*
- PR: *(fill after opening)*
