# nodecooc — position-grain skill evidence

**Branch:** `feat/nodecooc`
**Status:** done
**Started:** 2026-08-08

## Outcome

`node_skill_cooc` now counts one canonical position once, uses only VERIFIED
REQUIRED skills, and exposes the evidence behind every association. The old
directional rows became one canonical pair with both conditional probabilities.
The migration was applied to a disposable lab restore: all 4,139 eligible pairs
match a freshly rebuilt representative-only lab pipeline exactly.

## Subtasks

- [x] T0 — fix the metric contract — _done when:_ one unordered pair contains its counts, conditional probabilities, lift, and NPMI.
- [x] T1 — migrate and refresh safely — _done when:_ the replacement view has pair and lookup indexes and refreshes without blocking readers.
- [x] T2 — re-tune consumers — _done when:_ CV suggestions and substitute gating query unordered pairs with evidence floors justified from the lab restore.
- [x] T3 — prove parity — _done when:_ a restored corpus produces the same pair counts as the lab's representative-only pipeline.

## Decisions

- A canonical position is represented by `unique_vacancies.canonical_vacancy_id`, matching the lab's committed v0 artifact. We do not union member extractions: disagreement is an extraction-quality signal, not a market fact.
- The view has one `a_id < b_id` row per pair. Both conditional probabilities are present, so no consumer needs duplicated directional rows.
- The base pair floor remains 10 positions. The substitute gate is more consequential than a confirmable CV chip, so it additionally requires 25 pair positions.
- On the 2026-08-08 lab restore, the base contract yields 4,139 pairs; `NPMI >= 0.1` leaves 2,650 CV links, and `NPMI >= 0.3` plus 25 pair positions leaves 608 substitute-gate links.
- The old persisted `metalab_edge` was stale against its SQL. Re-running `02-pairs.sql` first failed because it dropped a table before its dependent view; the pipeline now drops that view first and reproduces the 4,139-pair contract.

## Links

- ADR: [0014 — skill graph and the lab](../decisions/0014-skill-graph-and-the-lab.md)
- Linear: MET-131
