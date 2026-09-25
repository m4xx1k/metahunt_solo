# Phase 1 — pipeline and artifact

All commands run from `/home/maxxik/solo/mh-lab-anyof` (the worktree from rule 7).

## 1.1 Copy the three ready files

```bash
cp apps/lab/redesign/files/02-pairs.sql        apps/lab/pipeline/02-pairs.sql
cp apps/lab/redesign/files/04-export.sql       apps/lab/pipeline/04-export.sql
cp apps/lab/redesign/files/relations-check.mjs apps/lab/pipeline/relations-check.mjs
```

Do not edit them after copying. What they change, so you can recognise it in the artifact:

- `02-pairs.sql`
  - new table `metalab_cohort`: positions extracted under the anyOf contract (detected
    by the shape of the stored LLM answer, **not** by a date);
  - a guard that aborts the build if a grouped position falls outside that cohort;
  - `metalab_position_skill` gains `requirement_group`;
  - `metalab_pair` gains `substitute_positions`;
  - `metalab_edge` gains `substitute_positions`, `complement_positions`,
    `substitute_rate`, `complement_lift`, `complement_npmi`.
- `04-export.sql`
  - every node gains `kind` (`TECH` / `CONCEPT` / `SOFT` / `null`);
  - every edge gains `substitutePairs`, `substituteRate`, `complementNpmi` (can be
    `null`) and `observed` (`SUBSTITUTE` / `MIXED` / `COMPLEMENT`);
  - `contract` gains `cohort`, `substituteMin` (0.5), `complementMax` (0.2);
    `minRolePositions` drops 300 → 150;
  - `provenance` gains `cohortPositions`, and the snapshot label becomes 2026-09-25;
  - new top-level `vocabulary`: every VERIFIED skill name.
- `relations-check.mjs`
  - drift is now checked against `vocabulary`, so a rare skill is no longer reported as
    a renamed one;
  - prints a "hand label × observed" table.

## 1.2 Rebuild the artifact

```bash
pnpm --filter @metahunt/lab lab:data
```

It takes a few minutes. The last lines must be exactly:

```
  265 nodes · 3001 edges · 9 roles
```

followed by `▸ done → .../apps/lab/src/data/graph.json`. Different numbers → **stop**
(rule 8).

## 1.3 Verify

```bash
node apps/lab/redesign/files/anchors-check.mjs apps/lab/src/data/graph.json
pnpm --filter @metahunt/lab lab:relations
node -e 'const g=require("./apps/lab/src/data/graph.json");const t={};for(const e of g.edges)t[e.observed]=(t[e.observed]||0)+1;console.log(g.provenance.cohortPositions,g.provenance.nPositions,JSON.stringify(t),g.vocabulary.length>1000)'
```

Expected:

- anchors: 9 lines, every one starting with `ok`, exit code 0;
- `lab:relations`: exit code 0, ends with `no drift — every labelled skill still exists in the taxonomy.`,
  and the table reads exactly:

  ```
                  SUBSTITUTE       MIXED  COMPLEMENT     no edge
    COMPLEMENT             0           3          32          42
    IMPLIES                1           1           9          22
    SUBSTITUTE            10           1           0          21
    CONTESTED              0           2           0           5
  ```
- the `node -e` line prints: `3563 3540 {"COMPLEMENT":2883,"SUBSTITUTE":70,"MIXED":48} true`
  (key order may differ).

## 1.4 Commit

```bash
git add apps/lab/pipeline/02-pairs.sql apps/lab/pipeline/04-export.sql \
        apps/lab/pipeline/relations-check.mjs apps/lab/src/data/graph.json
git commit -m "feat(lab): split skill pairs into substitutes and complements from anyOf groups"
```

(plus the `Co-Authored-By` trailer from rule 7.)

Do not run `lab:build` in this phase; phase 2 is where TypeScript starts reading the new fields.
