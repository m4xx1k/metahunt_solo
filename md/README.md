# metahunt — Engineering docs

Engineering documentation. Product / business / UX docs live in the sibling `product/` directory — we don't duplicate them here.

## Philosophy: Snapshot + Journal

- **Snapshot** — what's true about the system **right now**. Updated alongside code. If `architecture/overview.md` drifts from the code, that's a doc bug.
- **Journal** — append-only history. ADRs, releases, migration trackers, postmortems. Old entries are not edited — write new ones that supersede.

When writing, ask: *"is this the current state, or an event in time?"* Snapshot → `architecture/` or `runbook/`. Journal → `journal/`.

## Layout

| Path | Type | What goes here |
|---|---|---|
| `architecture/` | snapshot | System shape now: modules, data flows, boundaries |
| `runbook/` | snapshot | Operational how-tos: deploy, debug, env vars |
| `journal/decisions/` | journal | ADRs — numbered, append-only after `accepted` |
| `journal/migrations/` | journal | Multi-step initiative trackers (one file per initiative) |
| `journal/migrations/_done/` | journal | Closed trackers (archived; see Archive convention below) |
| `journal/releases.md` | journal | Chronological log; one paragraph per item |
| `journal/postmortems/` | journal | What broke and why (created on first incident) |
| `roadmap.md` | hybrid | Stages — now / next / done |
| `engineering/` | reference | General engineering rules (style, design, errors, security, testing, review) |

## Where things live — cheat sheet

| You want to write… | File |
|---|---|
| Current system shape | `md/architecture/overview.md` |
| A non-trivial decision | `md/journal/decisions/NNNN-<slug>.md` |
| Multi-step initiative tracker | `md/journal/migrations/<branch-slug>.md` |
| Chronological "what shipped" | `md/journal/releases.md` |
| Operational how-to | `md/runbook/<topic>.md` |
| Stage status shift | `md/roadmap.md` |
| Workflow / convention change | `md/engineering/DOCUMENTATION.md` |
| New tracker | copy from `md/engineering/_TRACKER-TEMPLATE.md` |

## Package-level docs

Centralized here. **Packages do not get their own `md/` folders.** Each package's `README.md` is its front door — what it is, how to run it, what it exposes — and links back here for architecture and decisions.

If a package ever accumulates enough internal-only context that it dominates this folder (e.g. >3 ADRs only about it, or an architecture topic deeper than the rest of the system combined), promote a `<package>/md/` mirroring this structure. Until then, everything lives here.

## Hygiene

- **Snapshot files contain "is" statements.** No dates, no "recently". If you want to write "we recently migrated…", that's a journal entry.
- **Journal files contain "happened" statements.** No "currently we use X" — that's a snapshot.
- **ADRs are not edited after `accepted`.** Exception: typos or broken links. Decision changed → write a superseding ADR.
- **One file = one topic.** Split when caps in `/CLAUDE.md` are reached.
- **Header anchors.** Every `## Section` becomes a GitHub-style anchor (`#section-slug`). Cross-doc references should point at *sections* (e.g. `runbook/railway-deploy.md#deploy-contract`) instead of whole files — readers grep less, agents read less.

## Archive convention

When a multi-step initiative closes:

1. Set tracker status to `done`, write a ≤5-line `Outcome` at the top.
2. Move the file to `journal/migrations/_done/<slug>.md`.
3. Update any cross-references (releases, roadmap) to the new path.

Active trackers in `migrations/` stay light; closed ones stay searchable as history but don't crowd the working set.

## Anti-patterns

- One `.md` per subtask. → One tracker per initiative.
- Editing accepted ADRs. → Write a superseding ADR.
- "Currently we use X" in journal entries. → That's a snapshot.
- Dates or "recently" in snapshot files. → Move to journal.
- Duplicating product / customer-facing requirements here. → Engineering only.
- Per-package `md/` folders. → Centralized.
- Writing a tracker for a one-PR fix. → Just a `releases.md` line.
- Inventing a new task ID instead of reusing the branch slug.
