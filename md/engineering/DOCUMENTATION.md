# DOCUMENTATION — task workflow

How to start, run, and close engineering work. For doc-system philosophy (Snapshot + Journal, layout, anti-patterns, archive convention), see `md/README.md`.

## TL;DR — start-of-task checklist

1. Read this file.
2. Skim `md/README.md` if unfamiliar — Snapshot + Journal philosophy.
3. Read `md/roadmap.md` — current stage, what's now / next.
4. Skim `md/architecture/overview.md` — current system shape.
5. Find prior work:
   - `grep -r "<branch-slug>" md/` if continuing a known initiative.
   - `ls md/journal/migrations/` for active trackers.
   - `ls md/journal/decisions/` for relevant ADRs.
6. Pick or create your branch: `<type>/<slug>` (`feat/rss-pipeline`, `fix/temporal-build`, `docs/refactor-runbook`, …). The slug becomes your task ID.

## Branch name = task ID

Every non-trivial task gets a branch `<type>/<slug>`. The `<slug>` is the canonical task ID across docs.

Use it in:
- tracker filename — `md/journal/migrations/<slug>.md`
- tracker top heading and a `**Branch:**` line (so `grep -r <slug> md/` finds it)
- cross-references in releases / ADRs

**Why:** the branch name is the one short string already in git, the PR, and your terminal. Reusing it = zero new naming, `grep -r <slug>` always lands on the tracker.

**How to apply:** branch `feat/rss-pipeline` → tracker `md/journal/migrations/rss-pipeline.md`. Drop the `<type>/` prefix in filenames; keep the full `feat/rss-pipeline` in the `**Branch:**` line.

## One tracker per initiative

Multi-step initiative = ONE markdown file with subtasks (T0, T1, …) as **headings inside it**. Never one `.md` per subtask.

Single-step task (one PR, ≤1 day) → no tracker; just a `releases.md` line at PR time.

Tracker shape: copy `md/engineering/_TRACKER-TEMPLATE.md`.

## Snapshot first, journal second, ADR when there's a real choice

- Code-shape change → update `md/architecture/overview.md` in the same PR.
- User-visible change worth onboarding context → paragraph in `md/journal/releases.md`.
- Real choice between alternatives → new ADR in `md/journal/decisions/`.

If you can't articulate two options, you don't need an ADR.

## Workflow

### Starting

1. Branch: `<type>/<slug>`.
2. `grep -r <slug> md/` — pick up where someone left off, if applicable.
3. Multi-step + no tracker → create `md/journal/migrations/<slug>.md` from the template.
4. Single-step → skip the tracker; write the release entry at PR time.

### During

- Tracker subtasks: one line + a *done when* check.
- Mark progress inline (`✅` or `done — <commit>`).
- Capture decisions you'd forget in 3 months. ADR-sized → spin an ADR. Smaller → leave in the tracker.

### Closing — in this order

1. **Tracker** — mark subtasks done, write a ≤5-line **Outcome** at the top, set status to `done`. If the initiative is fully closed, move it to `journal/migrations/_done/<slug>.md` (see archive convention in `md/README.md`).
2. **`md/architecture/overview.md`** — only if the system shape changed.
3. **`md/journal/releases.md`** — one paragraph under today's date, linking tracker / ADRs / PR.
4. **`md/roadmap.md`** — if a stage closed, move it to **Done** with a one-line outcome.
5. **ADRs** — never edit accepted ones. Decision changed → new ADR that supersedes.

## Reference material

For general engineering rules, read just the relevant file:

| Topic | File |
|---|---|
| Style, naming, TS rules | `md/engineering/STYLE.md` |
| Design (SOLID, anti-patterns) | `md/engineering/DESIGN.md` |
| Errors, logging | `md/engineering/ERRORS-AND-LOGGING.md` |
| Security | `md/engineering/SECURITY.md` |
| Testing | `md/engineering/TESTING.md` |
| Code review | `md/engineering/REVIEW.md` |

If a rule conflicts with metahunt code on disk, **code wins** until the rule is promoted into a metahunt-specific doc (an ADR in `md/journal/decisions/` or a snapshot rule in `md/architecture/`).
