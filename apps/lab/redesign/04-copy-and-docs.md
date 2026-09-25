# Phase 4 — copy and docs

Three files: `src/App.tsx` (the `Methodology` function only), `src/views/Faq.tsx`,
`apps/lab/README.md`. Every "replace" quotes text that exists verbatim; if not, stop
(rule 8). Replace text only — keep the surrounding JSX elements and classes.

## 4.1 `src/App.tsx`

**(a)** Change `import { buildAdjacency, fmt } from "./lib/graph";` to
`import { buildAdjacency, fmt, pct } from "./lib/graph";`

**(b)** In `Methodology`, after `<Row k="Layer" v={contract.requirementLayer} />` add:

```tsx
        <Row k="Cohort" v={`${contract.cohort} · ${fmt(provenance.cohortPositions)} positions`} />
        <Row
          k="Or / and"
          v={`“or” in ≥ ${pct(contract.substituteMin)} of shared positions = alternatives · ≤ ${pct(
            contract.complementMax,
          )} = asked together · between = mixed`}
        />
```

**(c)** Replace the first paragraph's text (inside the first `<p>` of the bordered block):

```
          Observed association in this corpus — two job boards over 14 weeks — not the labour market,
          not causation, and no claim that any vacancy is still open. The required/optional split is
          an LLM output with no golden set behind it (MET-24, MET-76, MET-77), so every number here
          inherits that error. Prompt and taxonomy versions are not recorded per row, so a version
          artifact cannot be ruled out.
```

with

```
          Observed association in this corpus — two job boards, positions published{" "}
          {provenance.corpusStart} → {provenance.corpusEnd} and extracted under the “A or B”
          contract — not the labour market, not causation, and no claim that any vacancy is still
          open. Older positions are left out: their extraction flattened every “or” into “and”. The
          required/optional split and the “or” groups are LLM output checked only against a small
          golden set, so every number here inherits that error.
```

**(d)** Replace the second paragraph's text:

```
          A strong link is not advice: the strongest surviving edge in this graph is
          TensorFlow/PyTorch, which are substitutes. The maths is right; &quot;learn them
          together&quot; would be wrong.
```

with

```
          A strong link is still not advice. The graph now separates “or” from “and”, but a pair
          that vacancies ask for together describes vacancies, not a learning plan.
```

Nothing else in `App.tsx` changes.

## 4.2 `src/views/Faq.tsx`

**(a)** Replace

```
          It is a conditional share: among positions that explicitly require one skill, the share that
          also explicitly require the other. It is an observation, not causation or a learning plan.
```

with

```
          It is a conditional share: among positions that explicitly require one skill, the share that
          also require the other at the same time. A vacancy that says “A or B” does not count here —
          that pair is an alternative, not a companion. It is an observation, not causation or a
          learning plan.
```

**(b)** Replace

```
          The relation labels are manually reviewed. SUBSTITUTE means the vacancy meant “or”; the
          numbers alone cannot distinguish that from a pair where both skills are genuinely needed.
```

with

```
          Extraction keeps “A or B” from a vacancy as one requirement. When most positions that
          mention both skills offer them as alternatives, the pair is shown as a choice. A few pairs
          also carry a hand-reviewed label; those are marked “reviewed”.
```

**(c)** Replace

```
          This is a fixed snapshot of two job boards over roughly fourteen weeks, not a live market.
          The REQUIRED/optional extraction has not yet been measured against a golden set, so these
          figures remain research evidence rather than user-specific advice.
```

with

```
          This is a fixed snapshot of two job boards over about five weeks — only positions extracted
          after “or” started being recorded. The requirement groups and the REQUIRED/optional split
          are LLM output with a small golden set behind them, so these figures remain research
          evidence rather than user-specific advice.
```

## 4.3 `apps/lab/README.md`

**(a)** In the pipeline block, replace

```
02-pairs.sql        position-grain skill and pair tables (both aggregation rules)
```

with

```
02-pairs.sql        anyOf cohort, position-grain skill and pair tables (both aggregation rules)
```

**(b)** In "The curated layer", replace the paragraph

```
Co-occurrence cannot tell these apart. A substitute pair and a complement pair
produce identical counts — the distinguishing word ("or" vs "and") is discarded
at extraction — so no NPMI threshold recovers it. Measured on the top 150 edges:
neither symmetry nor `node_tech_meta` category separates them. I2C/SPI are
complements at symmetry 1.00; WireGuard/OpenVPN are substitutes at 0.93.
```

with

```
Co-occurrence alone cannot tell these apart, but extraction now can: a posting's
"A or B" is stored as one requirement whose skills share a `requirement_group`.
Every edge carries `substituteRate` — the share of its positions that offered the
pair as alternatives — and an `observed` verdict (`SUBSTITUTE` ≥ 0.5, `COMPLEMENT`
≤ 0.2, `MIXED` between). Those cutoffs were set against this file: on the anyOf
cohort no hand-labelled SUBSTITUTE lands at `COMPLEMENT` and no COMPLEMENT at
`SUBSTITUTE`. The hand labels stay for `IMPLIES`, which "or" groups cannot
express, and as the calibration set.

Only positions extracted under the anyOf contract enter the graph
(`metalab_cohort`). Older extractions flattened every "or" into "and", so mixing
them in would read alternatives as companions. The marker is the shape of the
stored answer, not a date.
```

**(c)** Replace

```
Run it after any taxonomy migration. An orphaned label is worse than a missing
one — the graph silently goes back to reading substitutes as complements.
```

with

```
Run it after any taxonomy migration, and after `lab:data`: it also prints the hand
label × observed table, which is how a threshold change gets checked.
```

**(d)** In "What the numbers mean", replace

```
Every figure is an **observed association** in this corpus — two job boards over
roughly 14 weeks — not the labour market, not causation, and never a claim that a
vacancy is currently open. The methodology panel in the app states the contract,
the denominators and the limits; read it before quoting anything.
```

with

```
Every figure is an **observed association** in this corpus — two job boards, only
positions extracted under the anyOf contract (about five weeks) — not the labour
market, not causation, and never a claim that a vacancy is currently open. The
methodology panel in the app states the contract, the denominators and the limits;
read it before quoting anything.
```

**(e)** Replace

```
- the required / optional split is an LLM output with no golden set behind it
  (MET-24, MET-76, MET-77), so every number inherits that error;
- a strong link is not advice. The strongest surviving edge in the graph is
  TensorFlow / PyTorch, which are substitutes.
```

with

```
- the required / optional split and the "or" groups are LLM output with only a
  small golden set behind them, so every number inherits that error;
- a strong link is not advice, even once "or" and "and" are separated.
```

**(f)** At the end of the "Reading the metrics" table, add three rows:

```
| `substituteRate` | of the positions with both, what share offered them as "A or B" |
| `complementNpmi` | NPMI over the "A and B" positions only — what the map ranks by |
| `observed` | `SUBSTITUTE` / `MIXED` / `COMPLEMENT`, cut from `substituteRate` |
```

## 4.4 Verify

```bash
pnpm --filter @metahunt/lab lab:build
pnpm --filter @metahunt/lab lab:check
grep -rn "14 weeks\|fourteen weeks\|cannot distinguish\|Co-occurrence cannot tell" apps/lab/src apps/lab/README.md
```

Build and check exit 0. The `grep` must print **nothing**.

## 4.5 Commit

```bash
git add apps/lab/src/App.tsx apps/lab/src/views/Faq.tsx apps/lab/README.md
git commit -m "docs(lab): methodology, FAQ and README describe the anyOf cohort and or/and split"
```
