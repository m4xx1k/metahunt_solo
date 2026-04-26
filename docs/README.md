# metahunt — Engineering docs

Engineering documentation for the project. Product docs (requirements, customer-facing roadmap, pain points) live **separately** at `/home/user/plan-a/md-shit/docs/` — we don't duplicate them here.

## Philosophy: Snapshot + Journal

Docs are split into two categories by lifecycle:

- **Snapshot** — what should always be true about the system **right now**. Updated on every refactor. If `architecture/overview.md` drifts from the code, that's a doc bug, not a code bug.
- **Journal** — append-only history. What happened, what we decided, what broke. Old entries are not edited — we write new ones that supersede them.

This split is the main rule. When writing a new doc, ask: *"is this describing the current state, or recording an event in time?"* The first goes into `architecture/` or `runbook/`, the second into `journal/`.

## Layout

| Path | Type | What goes here |
|---|---|---|
| `architecture/` | snapshot | How the system is built right now: modules, data flows, boundaries. Updated alongside the code. |
| `runbook/` | snapshot | Operational "how to do X": dev setup, deploy, debugging, env vars. (Created when the first how-to is needed.) |
| `journal/decisions/` | journal | ADRs — numbered architectural decisions (not edited after `accepted`). |
| `journal/releases.md` | journal | Chronological log of features / changes. One paragraph per item. |
| `journal/postmortems/` | journal | What broke, why, what we did. (Created on first incident.) |
| `roadmap.md` | hybrid | What's now / what's next. Current stage + planned ones. Updated when priorities shift. |

## Package-level docs

All engineering docs live here. **Packages do not get their own `docs/` folders.** Each package's `README.md` is its front door — what the package is, how to run it, what it exposes — and links back here for architecture and decisions.

ADRs and architecture mostly span more than one package, so a single source of truth keeps cross-references simple and the index small. If a package ever accumulates enough internal-only context that it dominates this folder (e.g. >3 ADRs that only concern it, or an architecture topic deeper than the rest of the system combined), we revisit and promote a `<package>/docs/` mirroring this exact structure. Until then, everything lives here.

## How to use it

- **Shipped a feature** → add an entry to `journal/releases.md` under today's date. If the feature touched architecture, update `architecture/overview.md`.
- **Made an architectural decision** → new file in `journal/decisions/` from `_template.md`. Don't edit accepted ADRs — write a new one that supersedes the old.
- **Closed a stage** → in `roadmap.md` move it to `done` and add a short outcome.
- **Spotted an operational routine you keep doing by hand** → write it as a how-to in `runbook/`.

## Hygiene rules

- **Snapshot must not contain dates or the word "recently".** If you want to write *"we recently migrated…"*, that's a journal entry, not a snapshot.
- **Journal files must not contain "currently we use X".** That belongs in a snapshot.
- **ADRs are not edited after `accepted`.** Exception: typos or broken links.
- **One file = one topic.** If `overview.md` grows past ~500 lines, split it into `overview.md` + `data-model.md` + `modules.md`.
