# Semi-global market — data-model gaps (compensation, timezones, process)

Status: research, 2026-06-12. Sibling of [integration-research.md](integration-research.md). Triggered by: hourly/part-time salaries already parse badly today; going semi-global adds annual salaries, timezone constraints, hiring-region eligibility.

## 0. Root cause of today's salary bug

`extract-vacancy.baml` forces everything into **monthly** (`Salary.min/max @description("monthly")`, rule "yearly → divide by 12") with an LLM-side guardrail `100..50000`:

- `$25/hour` → 25 < 100 → nulled (or worse, kept as $25/mo).
- `$150k` on a global board with no explicit "per year" → read as monthly → >50000 → nulled. Data destroyed at extraction time, unrecoverable without re-extraction.
- `currency` pgEnum is `USD|EUR|UAH` — global boards pay in GBP/PLN/CHF/CAD…

The fix principle: **extract verbatim (amount + currency + period), normalize in code, not in the prompt.** Deterministic loader logic beats LLM arithmetic, and the original survives for display.

## 1. Compensation v2 (P0 — fixes existing bug, prerequisite for global)

### Schema (`vacancies`)

```ts
salaryMin / salaryMax            // stays: amount in ORIGINAL period+currency (semantic change!)
salaryPeriod: pgEnum('salary_period', ['HOUR','DAY','MONTH','YEAR'])   // new, nullable
currency: text                   // widen from pgEnum(USD,EUR,UAH) → ISO-4217 text
salaryUsdMonthMin / salaryUsdMonthMax: integer   // new, computed by loader — ALL filters/market/ranking use these
hasEquity: boolean               // new, nullable
```

### Extraction changes (BAML)

- `Salary { min, max, currency, period }` — verbatim from text, **no division, no guardrail**. Rules: "yearly/annual/per annum/k-figures ≥ 60k in EN-language posting → YEAR"; "/hour, погодинна → HOUR"; "UA sources (djinni/dou), bare number → MONTH". `null` period when truly ambiguous.
- Equity: "equity / stock options / ESOP" → `hasEquity: true`.

### Normalization (loader, deterministic)

- Period → month: HOUR ×167, DAY ×21.7, YEAR ÷12.
- Currency → USD: static rate table in code/config (UAH, EUR, GBP, PLN…), updated manually now and then; precision is irrelevant for filter/sort purposes. Store nothing about the rate version until it matters (YAGNI).
- Plausibility guardrail moves here, **period-aware**: HOUR 3..300, DAY 30..2500, MONTH 100..60k, YEAR 5k..700k (USD-equivalent). Outside → null normalized cols, keep originals (visible on the vacancy, excluded from salary filters).
- Ambiguous-period heuristic in code: normalized-as-month result outside guardrail but plausible as YEAR → treat as YEAR (catches "$150,000" with null period).

### ATS bypass

Ashby `compensation` (with `?includeCompensation=true`) and Lever `salaryRange` carry currency + interval structured → loader maps directly, LLM never touches salary for those. Greenhouse/Recruitee → LLM path.

### Display

Digest/feed always renders the **original**: `$25–35/hour`, `€90–110k/year`, `$3–5k/міс`. Normalized columns are invisible plumbing.

## 2. Timezones & hiring eligibility (P1 — the remote-relevance problem)

Two distinct things postings conflate; model them separately:

1. **Legal/hiring eligibility** — "US only", "must be based in EU", "anywhere". Binary relevance: a US-only remote job is pure noise for a UA user.
2. **Working-hours overlap** — "CET ±3h", "4h overlap with PST", "async-first". Soft relevance: PST-overlap is *possible* from Kyiv but painful.

### Schema (`vacancies`)

```ts
hiringRegions: jsonb       // string[] from controlled vocab, null = unstated
tzNote: text               // raw overlap requirement verbatim ("4h overlap with PST"), null if none
uaEligible: boolean        // computed by loader; null = unknown (treated as eligible in filters, badge "не вказано")
```

Controlled vocab (keep ≤10): `WORLDWIDE, EUROPE, EMEA, UKRAINE, UK, US, AMERICAS, APAC, OTHER`. Sources: ATS location strings are strong signals ("Remote - EMEA", `secondaryLocations`, `country`) — adapter maps those without LLM; description text ("must be located in…") — LLM extracts.

`uaEligible` derivation: `WORLDWIDE|EUROPE|EMEA|UKRAINE ⊆ regions → true`; only `US|AMERICAS|APAC|UK → false`; null/`OTHER` → null. Subscriptions/feed get a "сумісно з Україною" filter; digest ranking can downrank `tzNote` mentioning Americas overlap without hard-excluding.

Why not numeric UTC-offset ranges: postings rarely state them precisely enough; a coarse vocab + raw note covers ~95% of real strings at a fraction of the modeling cost. Revisit only if filter quality demands it.

## 3. Interview process (P2 — cheap sibling of `hasTestAssignment`)

```ts
interviewStagesCount: integer   // nullable
```

LLM rule: count only an explicitly described process ("3 етапи: скрінінг, технічна, фінал" → 3; vague "кілька співбесід" → null). Sparse (~10-20% of postings state it) but zero-cost to carry and genuinely decision-relevant for candidates. Renders as "🪜 3 етапи" badge when present. Pairs with existing `hasTestAssignment`.

## 4. Considered, with verdicts

| Idea | Verdict | Why |
|---|---|---|
| `hoursPerWeek` for part-time | **P2, take** | nullable int; pairs with HOUR salary period; "20h/week" is common in part-time postings |
| Seniority ladder calibration (Staff/Principal/Distinguished) | **P1, prompt-only** | global titles skew senior vs UA "Lead"; add mapping rules to BAML, enum already has PRINCIPAL — no schema change |
| `relocationSupport` / visa sponsorship | defer | valuable for office-abroad audience, but that's a different product motion than remote/UA; revisit if office-global boards get enabled |
| Languages beyond English (DE/PL) | defer | `englishLevel` covers the core; non-EN requirements are niche until EU-office boards are in scope |
| Benefits (PTO, health, gear) | skip | unstructured noise, no filter value |
| Equity details (% / strike) | skip | `hasEquity` bool is enough; details almost never in postings |
| Live FX rates service | skip | static table is fine for filtering; precision theater otherwise |

## 5. Migration & rollout

- All new columns nullable → migration is trivial, no backfill required to ship.
- BAML prompt bump → tracked via existing `_v` sidecar in `extracted_data`; new fields flow into loader for new records only.
- **One-time re-extract of open vacancies** (~few k rows, cheap model) is worth it: it repairs the already-broken hourly/part-time salaries in current data. Old closed rows stay null — fine.
- `embeddingSourceHash` untouched (embedding text doesn't include salary/tz) → no re-embedding, dedup unaffected.
- Feed/market/subscription queries switch salary comparisons to `salary_usd_month_*`; add `ua_eligible` filter. Market analytics (`market.service.ts` salary counts) keeps working — normalized cols only improve it.
- Sequencing vs ATS initiative: **Compensation v2 lands best *before or with* ATS P1** — ATS structured comp wants `salaryPeriod` to map into, and backfilling later means re-touching every adapter. `hiringRegions`/`tzNote` can land with ATS P3 (REMOTE tier) where they become load-bearing.

## 6. Open questions

1. Original salary display: show converted hint too ("€90k/yr ≈ $8.1k/mo")? (UI-only, cheap)
2. `uaEligible = null` (unstated) — include in "сумісно з Україною" filter by default (recommended: yes, with badge) or exclude?
3. Re-extract scope: all open vacancies or only those with currently-null salary?
