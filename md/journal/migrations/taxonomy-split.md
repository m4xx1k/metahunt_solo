# taxonomy-split — split glued aliases out of a node and reproject

**Branch:** `feat/taxonomy-split`
**Status:** in-progress — Session 1 + UI done, waiting on owner review (glue list, click-review), then prod rollout
**Started:** 2026-10-12 · **Closed:** —

## Outcome

*(so far)* Admin can see which raw spellings make up a SKILL node, move some of them to a new or
existing node, preview the effect (dry-run), apply it and re-run a scoped reprojection. Proven on a
local restore of the 2026-10-12 prod dump. Nothing is applied on prod yet. Draft PR #233.

## Why

The seed glued sub-technologies into their parent (`ASP.NET Core` → `.NET`, `GitHub` → `Git`,
`T-SQL` → `SQL`, …). The only existing edit was a destructive `mergeInto`; there was no way to
see what a node is made of and no way to rebuild links after an alias moves.

## How it works

Three layers: facts (`rss_records.extracted_data`, `candidates.extracted`, never touched) →
aliases (`node_aliases`) → projection (`vacancy_nodes`, `candidate_nodes`). A split is
*move aliases + reproject the source node*; every record that mentions a moved alias is already
linked to the source, so reprojecting the source's links is complete. Reverse split = the same
call in the other direction.

- `GET /admin/taxonomy/nodes/:id/mentions` — raw spellings (plain + `anyOf`) per alias with
  distinct vacancy counts, incl. zero-mention aliases.
- `POST /admin/taxonomy/nodes/:id/split` `{ aliases, target: {name}|{nodeId}, dryRun }` — one
  transaction; dry-run is the same code rolled back. New targets are `VERIFIED`.
- `POST /admin/taxonomy/nodes/:id/reproject` — idempotent retry.
- `TaxonomyReprojectService` (`apps/etl/src/admin/taxonomy/`) reuses the loader's
  `resolveSkillLinks` (`VacancyLoaderService.relinkSkills`) and `RankingService.resolveSkills`
  (`CandidateLoaderService.relinkSkills`). Vacancies are relinked in batches of 100 under
  `FOR UPDATE`; CVs only for skills spelled as a moved alias, hand-confirmed links kept.
- UI: "mentions" section in `DetailPanel` (`MentionSplit.tsx`) — checkboxes → target → preview →
  confirm → reproject.

## Subtasks

- [x] T0 — fresh prod backup + local restore + snapshots — *done when:* counts match prod
- [x] T1 — glue audit of every SKILL node — *done when:* proposal list exists (private report)
- [x] T2 — mentions / split / reproject + int specs — done `019d3e9`, `b91d0f0`
- [x] T3 — proof on the dump — dry-run 483 = apply 483 (`.NET` → `ASP.NET Core`), rerun 0,
      reverse split restores 0 diff, 13 `anyOf` vacancies hand-checked
- [x] T4 — UI in `DetailPanel` — done `1455164`, clicked headless
- [x] T5 — seed: stop gluing sub-technologies — `98397df`, `1a41e0a` (droppable if the list changes)
- [x] T6 — review pass — `b91d0f0`, re-proved after it
- [ ] T7 — owner: approve the glue list and click-review locally — *done when:* list signed off,
      seed commits adjusted to match
- [ ] T8 — prod rollout (backup → merge → pause schedules → split in UI → reproject → resume) —
      *done when:* `.NET` filter count and a .NET CV on `/match` look right
- [ ] T9 — Session 3: rebuild the lab on clean data, fill `track_nodes`, stacks article

## Decisions

- Scope = split + reproject only. No CLI, no new tables, no migrations, no `merged_into_id`.
- Parent-filter cost (decision 3): P(.NET or C# | ASP.NET Core) = 94.6% → the split costs the
  `.NET` filter nothing. P(SQL | T-SQL) = 16% → the `SQL` filter loses ~100 postings; accept or
  wait for the implication graph (MET-27).
- Pre-existing drift: 3.8% of vacancies have stale links from earlier alias edits that were never
  reprojected. A node's first split also fixes its share; the preview shows those rows.
- Dry-run holds one transaction: ~9 s on `.NET`, ~22 s on `SQL`, locking the rewritten link rows.
  Run prod splits with schedules paused.

## Known gaps

- A fresh `db:seed` fails at tracks (`Backend Engineer` ROLE missing) — same on `origin/main`.
- Seed aliases are lowercased, not normalized: dotted spellings in the seed never match.
- Later: rewrite `mergeInto` on the same primitive (move all aliases → reproject → tombstone).

## Links

- PR: #233 (draft)
- Plan, glue audit, numbers, rollout: `.private/analysis/` (local only)
