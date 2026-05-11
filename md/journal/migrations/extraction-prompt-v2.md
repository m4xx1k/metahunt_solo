# extraction-prompt-v2 — BAML prompt v2 + token-usage tracking + cost dashboard

**Branch:** `feat/extraction-prompt-v2` · **Status:** done · **Started:** 2026-05-11 · **Closed:** 2026-05-11

## Outcome

Shipped BAML prompt v2 (canonical-taxonomy injection + anti-fluff per-field rules + few-shot examples + UA-market header) plus the infra to keep future iterations measurable: `_v` / `_usage` sidecar on every `rss_records.extracted_data`, `extraction_cost` SQL view, model-aware pricing (gpt-5.4-mini at $0.75 / $4.50 / $0.075 per Mtok), and a `/dashboard/extraction` page that surfaces spend, token totals, breakdowns by version + model, and the recent-50 table.

Quality measurement (the BEFORE/AFTER coverage protocol from the original TODO) was deliberately deferred — what's in place is the *infra* to measure cheaply next time, not the v1→v2 delta number.

## Subtasks

- [x] T1 — Infrastructure: `Collector` wiring, `PROMPT_VERSION = 2`, widen `VacancyExtractor` return to `{ data, meta: { promptVersion, usage, error? } }` — *done when:* extractor returns usage on success and on failure (data = null) without throwing.
- [x] T2 — Activity persists `_v` / `_usage` / `_error` sidecar in `rss_records.extracted_data` — *done when:* unit tests cover both success and failure write paths.
- [x] T3 — BAML prompt v2 with `knownRoles` / `knownDomains` injection, UA header, few-shot, anti-fluff per-field rules — *done when:* both `baml-cli test` fixtures pass.
- [x] T4 — `extraction_cost` SQL view (CASE-based per-model pricing) — *done when:* view returns rows with parsed columns + cost_usd for gpt-5.4-mini.
- [x] T5 — `gpt-5.4-mini` pricing landed; `_usage.model` populated from `OPENAI_MODEL` env at call time — *done when:* end-to-end re-extraction of one record shows correct cost in the view.
- [x] T6 — `/dashboard/extraction` page (KPI strip + by-version + by-model + recent-50) — *done when:* page renders correct numbers against the live ETL backend.
- [ ] ~~T7 — Empirical v1→v2 coverage delta (TRUNCATE vacancies + DELETE NEW nodes + seed + re-extract 78 records + fill-vacancies)~~ — **deferred** per operator decision.

## Decisions

- **Failure-usage inline, not in a separate table.** On failure, the activity writes `{ _v, _usage, _error }` before re-throwing. A successful Temporal retry overwrites the failure-row, so per-attempt cost may be lost. Acceptable because most failures spend zero tokens (rate-limit / network) and parse-failure-after-completion is rare. Promote to a dedicated `extraction_attempts` table if cost-on-failure analytics become load-bearing.
- **No SKILL canonical injection.** ROLE + DOMAIN canonical lists are injected into the prompt; SKILL is not (250+ entries grows the prompt past usefulness). Anti-fluff per-field rules carry the load on SKILL.
- **Model name from env, not from BAML.** `LlmCall.clientName` reports the BAML client name (`"OpenAIClient"`), not the actual OpenAI model. We read `process.env.OPENAI_MODEL` at call time and store it in `_usage.model` so the cost view can branch on it.
- **`PROMPT_VERSION` is a manual integer constant.** Not hashed from prompt body — whitespace edits shouldn't bump version. Bump intentionally per meaningful prompt change.

## Links

- ADRs: none — failure-storage decision is small enough to live here.
- Releases: → [`releases.md#2026-05-11`](../releases.md#2026-05-11)
- Runbook: [`md/runbook/extraction-cost.md`](../../runbook/extraction-cost.md)
- Plan: `/home/user/.claude/plans/typed-dazzling-quail.md` (local)
- Supersedes: `todo/baml-extraction-prompt-tuning.md` (removed on close)
