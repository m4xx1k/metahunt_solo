# semantic-dedup — structural gates + confidence tiers

**Branch:** `feat/semantic-dedup`
**Status:** in-progress
**Started:** 2026-05-21

## Outcome

*(fill at close)*

## Subtasks

- [x] T0 — seniority hard gate + company negative gate in the resolve pre-filter SQL
- [x] T1 — skill/title Jaccard corroboration + gold/confirmed tier in `dedup_reason`
- [x] T2 — `confidence` filter → tier filter (gold/confirmed/all) across contract, controller, `listGroups`, web UI
- [x] T3 — reset + resolve on the full 3628-vacancy corpus
- [x] T4 — verify the dashboard gold view renders (etl :3333 + web :4000)

## Decisions

- No migration / no re-embed: tiers are new keys inside the existing `dedup_reason` jsonb; embedding text is untouched, so vectors stay valid.
- Gold tier = pairwise & centroid sim ≥ 0.95 AND (companyMatch OR skillJaccard ≥ 0.5 OR titleJaccard ≥ 0.5). Confirmed = passed all gates + ≥ 0.92. Below 0.92 → new group.
- Known limitation: two postings with the same role where the LLM resolved company to the holding (e.g. SKELAR) rather than the product can still merge. Such groups end up `confirmed`, never `gold`, so the gold demo view stays clean.

## Results (2026-05-21 resolve)

- Biggest group 21 → 6; every top group is role-coherent — the cross-role snowball is eliminated.
- 3522 groups, 97 cross-source, **50 gold cross-source groups** for the demo.
- Tier split: 57 gold / 49 confirmed edges.
- Residual: one n=6 group merges PawChamp + Dressly Frontend roles (both company=SKELAR) — correctly demoted to `confirmed`.

## Follow-ups

- Djinni `external_id` duplication — see `todo/external-id-duplication-fix.md`. ~190 phantom duplicate vacancy rows from a loader format change; not a dedup bug, but it inflates counts and pollutes cross-source groups.
- No unit tests for `dedup.service.ts` yet.

## Links

- PR: —
