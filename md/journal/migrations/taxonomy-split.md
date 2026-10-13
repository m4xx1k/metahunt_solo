# taxonomy-split — move glued aliases to their own node

**Branch:** `feat/taxonomy-split`
**Status:** in-progress — Session 1 + UI done, waiting on owner review (glue list, click-review), then prod rollout
**Started:** 2026-10-12 · **Closed:** —

## Outcome

*(so far)* Admin can see which raw spellings make up a SKILL node and move some of its aliases
to a new or existing node in one transaction, with a rolled-back preview first. Proven on a
local restore of the 2026-10-12 prod dump. Nothing is applied on prod yet. Draft PR #233.

## Why

The seed glued sub-technologies into their parent (`ASP.NET Core` → `.NET`, `GitHub` → `Git`,
`T-SQL` → `SQL`, …). The only existing edit was a destructive `mergeInto`; there was no way to
see what a node is made of and no way to rebuild links after an alias moves.

## How it works

Three layers: facts (`rss_records.extracted_data`, `candidates.extracted`, never touched) →
aliases (`node_aliases`) → projection (`vacancy_nodes`, `candidate_nodes`). The one edit is
*move aliases*: repoint the chosen aliases and re-resolve every record linked to the source, in one
transaction. Every record that mentions a moved alias is already linked to the source, so that is
complete. The inverse move restores every link.

- `GET /admin/taxonomy/nodes/:id/mentions` — raw spellings (plain + `anyOf`) per alias with
  distinct vacancy counts, incl. zero-mention aliases, plus `nameAlias`.
- `POST /admin/taxonomy/nodes/:id/move-aliases` `{ aliases, target: {name}|{nodeId}, dryRun }` —
  one transaction; dry-run is the same transaction rolled back. A typed name always creates a new
  `VERIFIED` node (an existing name is refused, pick it instead).
- `TaxonomyAliasMoveService` (`apps/etl/src/admin/taxonomy/`) reuses the loader's
  `resolveSkillLinks` (`VacancyLoaderService.relinkSkills`) and `RankingService.resolveSkills`
  (`CandidateLoaderService.relinkSkills`). CVs re-resolve only skills spelled as a moved alias,
  so hand-confirmed links stay.
- UI: the "aliases" section of `DetailPanel` for SKILL nodes (`MoveAliases.tsx`) — tick aliases →
  pick an existing skill or "create new" → preview → confirm.

## Subtasks

- [x] T0 — fresh prod backup + local restore + snapshots — *done when:* counts match prod
- [x] T1 — glue audit of every SKILL node — *done when:* proposal list exists (private report)
- [x] T2 — mentions / split / reproject + int specs — done `019d3e9`, `b91d0f0`
- [x] T3 — proof on the dump — dry-run 483 = apply 483 (`.NET` → `ASP.NET Core`), rerun 0,
      reverse split restores 0 diff, 13 `anyOf` vacancies hand-checked
- [x] T4 — UI in `DetailPanel` — done `1455164`, clicked headless
- [x] T5 — seed: stop gluing sub-technologies — `98397df`, `1a41e0a` (droppable if the list changes)
- [x] T6 — review pass — `b91d0f0`, re-proved after it
- [x] T6b — atomic *move aliases* + simplified UI — `fc3d1fa`; etl 687 / int 198
      green; local dump: `.NET` → new `ASP.NET Core` dry-run 439 vacancies in 15 s, apply + reverse
      move = 0 diff against `_snap_vn_preglue` / `_snap_cn_preglue`
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
- 2026-10-13 (owner): one atomic primitive, *move aliases*. Move + reproject run in one
  transaction; dry-run is that transaction rolled back. The separate reproject endpoint/button,
  batching and the half-applied state go away (the retry also skipped CVs). UI: one row per alias
  (top spelling, other spellings muted), the node's own name not selectable alone, explicit
  "create new" vs existing target, preview = source/target counts + drift fixed as a separate line.
  Accepted cost: up to ~22 s of locks per apply, run with schedules paused.
- Next (proposed, measured, not decided): store normalized mentions per record and derive links
  from `mentions ⋈ node_aliases` in SQL; keep `vacancy_nodes` as the table it is and rewrite only
  affected vacancies with one set-based statement. Measured on the local dump (2026-10-13): full
  derive of all 248k links 0.5–0.7 s; the `.NET` → `ASP.NET Core` edit relinks 439 vacancies in
  0.7 s (now 15 s); a pure view instead of the table makes reads 10–100× slower (0.3–0.8 s), so no.
  Details: `.private/analysis/2026-10-13-taxonomy-next.md`.

## Known gaps

- A fresh `db:seed` fails at tracks (`Backend Engineer` ROLE missing) — same on `origin/main`.
- Seed aliases are lowercased, not normalized: dotted spellings in the seed never match.
- Later: rewrite `mergeInto` on the same primitive (move all aliases → hide the node).
- Moving every alias of a node hides the emptied node in the same move (else CVs keep matching it
  by name). Moving into a HIDDEN node is refused — verify it first.
- A move does not block loads of *new* vacancies, which read aliases without a lock: run moves
  with Temporal schedules paused. Step B (one SQL relink, <1 s) is the real fix.
- CV hand-confirms are not marked: a confirmed source link on a CV that only spells a moved alias
  is dropped by the move. Rare; revisit with CV links in step B.
- Target search lists VERIFIED nodes only: to move into a NEW node (e.g. `Jakarta EE`), verify it
  first.

## Links

- PR: #233 (draft)
- Plan, glue audit, numbers, rollout: `.private/analysis/` (local only)
