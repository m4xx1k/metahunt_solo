# CLAUDE.md — agent orientation

This file is auto-loaded into every session. It's the routing layer; the actual content lives in the dirs below.

## Skip rule

**If the user names a specific file in chat, read that file and skip everything below.** Don't run the routing or read orientation docs when the target is already known.

## Directory map

- `md/` — all written documentation:
  - `md/architecture/`, `md/journal/`, `md/runbook/`, `md/roadmap.md`, `md/README.md` — metahunt-specific source of truth (snapshot + journal).
  - `md/engineering/` — general engineering reference (style, design, errors, security, testing, review).
- `product/` — product / business / UX context (user flow, pain, economics, market).
- `apps/`, `libs/` — code.

## Read budget

**Max 3 files per task before checking direction with the user.** If you've read 3 and still don't know what to do, stop and ask. Exception: the user explicitly names additional files or says "read more".

**Read sections, not whole files** when the file has headings:
1. First read the file's outline: `grep -n '^#' <path>`.
2. Read only the section(s) you need with `Read offset=N limit=M`.
3. Only read the full file when it's <100 lines or you genuinely need the whole thing.

**Index before files.** When entering a dir, read its `README.md` or `roadmap.md` first to find the specific file you need — don't fan out across the whole tree.

## Routing — start here based on the task

| Task | First file |
|---|---|
| Engineering work (new feature, fix, refactor) | `md/engineering/DOCUMENTATION.md` (workflow + branch convention) |
| "What's the system shape?" | `md/architecture/overview.md` |
| "Why did we decide X?" | `md/journal/decisions/` (find the relevant ADR) |
| Active multi-step initiative | `md/journal/migrations/<branch-slug>.md` |
| Operational how-to (deploy, debug, env) | `md/runbook/` |
| Code style / pattern question | `md/engineering/STYLE.md` or `md/engineering/DESIGN.md` |
| Errors / logging / security / testing / review | `md/engineering/<TOPIC>.md` |
| Product / UX / pricing / market | `product/README.md` |
| Stage status / what's next | `md/roadmap.md` |
| Recent changes / "what shipped lately" | `md/journal/releases.md` |

## Size caps (soft, for new docs)

| Doc type | Cap | Split point |
|---|---|---|
| Architecture snapshot | 500 lines | Overview + data-model + modules |
| ADR | 150 lines | Past this you're conflating decisions — write a sibling |
| Migration tracker | 600 lines | The initiative needs a sibling tracker |
| Runbook entry | 300 lines | Split by sub-topic |
| `md/engineering/*` style guide | 200 lines | Spawn a new topic file |
| `product/*` | 300 lines | One concept per file |

## Hygiene

- Don't duplicate facts. Code reality lives in `md/architecture/`. Link to it from `md/engineering/*` or `product/*` — don't restate.
- Don't read all of `md/engineering/` to "get oriented." Pick the one file you need.
- Don't write a 1000-line file when 3×300 would do.
- Snapshot files (`md/architecture/`) contain "is" statements; journal files (`md/journal/`) contain "happened" statements. Don't mix.
- Cross-doc references should point at sections (`file.md#anchor`), not whole files. Every `## Section` is a GitHub-style anchor.
- Closed multi-step trackers move to `md/journal/migrations/_done/`. Active dir stays light.
- For the full workflow (start-of-task, closing-a-task, branch-as-task-id), see `md/engineering/DOCUMENTATION.md`. For doc-system philosophy + cheat sheet + anti-patterns, see `md/README.md`.

## Audit

Before any commit that touches docs, run:

```bash
find md product -name '*.md' -exec wc -l {} \; | sort -rn | head
```

If a file exceeds its cap above, split before committing.
