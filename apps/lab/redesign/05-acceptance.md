# Phase 5 — acceptance and report

Run from `/home/maxxik/solo/mh-lab-anyof`. No code changes in this phase. Every command
below must be run fresh, and its **real output** pasted in the report.

## 5.1 Commands and expected results

| # | Command | Must show |
|---|---|---|
| 1 | `git log --oneline main..HEAD` | exactly 5 commits: plan + phases 1–4 |
| 2 | `git status --short` | nothing (`.env` is ignored, so it does not appear) |
| 3 | `git diff --stat main..HEAD` | only files listed in rule 2, plus `apps/lab/REDESIGN_PLAN.md` and `apps/lab/redesign/*` |
| 4 | `pnpm --filter @metahunt/lab lab:build` | exit 0 |
| 5 | `pnpm --filter @metahunt/lab lab:check` | exit 0 |
| 6 | `pnpm --filter @metahunt/lab lab:relations` | exit 0, the table from phase 1.3, `no drift` |
| 7 | `node apps/lab/redesign/files/anchors-check.mjs apps/lab/src/data/graph.json` | 9 × `ok`, exit 0 |
| 8 | `node apps/lab/redesign/files/dossier-check.mjs apps/lab/src/data/graph.json` | 7 × `ok`, exit 0 |
| 9 | `node -e 'const g=require("./apps/lab/src/data/graph.json");console.log(g.nodes.length,g.edges.length,g.roles.length,g.provenance.cohortPositions,g.provenance.corpusStart,g.provenance.corpusEnd)'` | `265 3001 9 3563 2026-08-18 2026-09-25` |
| 10 | `git diff main..HEAD -- apps/lab/src/data/pair-relations.json apps/lab/pipeline/03-confounders.sql apps/lab/src/views/Roles.tsx` | empty |
| 11 | `git diff --name-only main..HEAD \| grep -v '^apps/lab/'` | empty |

Any row that does not match → the work is **not done**. Go back to the phase that owns
it; if the fix is not written in that phase file, stop and report (rule 8).

## 5.2 Report format

Write the report in this order, nothing else:

1. **Result** — one line: all 11 checks pass, or which ones fail.
2. **Commits** — the output of check 1.
3. **Check outputs** — checks 4–9 pasted verbatim (trim `lab:build` to its last 5 lines).
4. **For the owner to eyeball** — the four UI checks from phase 3.4, and how to start the
   app: `cd /home/maxxik/solo/mh-lab-anyof && pnpm --filter @metahunt/lab lab` → http://localhost:4200
5. **Deviations** — every place you did anything not literally written in the phase
   files, with the reason. If none, write "none".
6. **Not done** — anything skipped, with the reason. If none, write "none".

Do not push, do not open a PR, do not remove the worktree. The owner reviews and decides.
