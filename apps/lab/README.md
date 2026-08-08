# metahunt lab

An isolated research app for exploring MetaHunt's vacancy corpus. Not part of the
product: nothing in `apps/web` or `apps/etl` imports it, and it has no runtime
database dependency.

## Running it

```bash
pnpm --filter @metahunt/lab lab          # dev server on :4200
pnpm --filter @metahunt/lab lab:build    # production bundle
pnpm --filter @metahunt/lab lab:check    # lint
```

The scripts are deliberately **not** named `dev` / `build` / `lint` / `test`, so
the repo-wide `pnpm dev`, `pnpm lint` and `pnpm build:all` skip this package
entirely. That is the whole isolation mechanism — no CI or turbo exclusions to
keep in sync.

## Where the data comes from

The app reads one committed artifact, `src/data/graph.json`. It is regenerated
only when a human asks:

```bash
pnpm --filter @metahunt/lab lab:data
```

That runs `pipeline/` against the **lab database** — a full local restore of a
prod dump, safe to mutate. Point it there with `LAB_DATABASE_URL`, in the
environment or in `apps/lab/.env` (gitignored — see `.env.example`):

```bash
LAB_DATABASE_URL=postgres://user:pass@localhost:5432/metahunt_lab
```

`pipeline/psql.sh` refuses any URL whose database is not `metahunt_lab`, so
production is unreachable from here even by mistake.

The name is not `DATABASE_URL` on purpose. Every other command in this repo
resolves its database from whichever `.env` is in the working directory, so a
lab `.env` using that name silently retargets them all — which is exactly how a
taxonomy migration once ran against this restore while reporting success
(MET-133). The lab owns its own handle and touches nobody else's.

```
02-pairs.sql        position-grain skill and pair tables (both aggregation rules)
03-confounders.sql  role and source conditioning
04-export.sql       emits the artifact
01-audit.sql        corpus audit — run by hand, not part of the build
02b/03b             sensitivity and GRILL checks — run by hand
```

Committing the artifact rather than querying at runtime means the UI can only
ever show numbers that were reviewed, and the app runs with no infrastructure.

## The curated layer

`src/data/pair-relations.json` is the one file here that is **written by hand and
never regenerated**. It records what a strong edge actually means:

| relation | meaning |
|---|---|
| `SUBSTITUTE` | one is enough — the posting meant "or" |
| `COMPLEMENT` | both are genuinely needed |
| `IMPLIES` | `pair[0]` implies `pair[1]` — directional |
| `CONTESTED` | depends on the vacancy; no single answer is honest |

Co-occurrence cannot tell these apart. A substitute pair and a complement pair
produce identical counts — the distinguishing word ("or" vs "and") is discarded
at extraction — so no NPMI threshold recovers it. Measured on the top 150 edges:
neither symmetry nor `node_tech_meta` category separates them. I2C/SPI are
complements at symmetry 1.00; WireGuard/OpenVPN are substitutes at 0.93.

Labels are keyed by **canonical skill name**, because node indices shift on every
rebuild. That makes them vulnerable to a taxonomy rename instead, so:

```bash
pnpm --filter @metahunt/lab lab:relations   # coverage + drift; exits 1 on drift
```

Run it after any taxonomy migration. An orphaned label is worse than a missing
one — the graph silently goes back to reading substitutes as complements.

## What the numbers mean

Every figure is an **observed association** in this corpus — two job boards over
roughly 14 weeks — not the labour market, not causation, and never a claim that a
vacancy is currently open. The methodology panel in the app states the contract,
the denominators and the limits; read it before quoting anything.

Two limits worth repeating here:

- the required / optional split is an LLM output with no golden set behind it
  (MET-24, MET-76, MET-77), so every number inherits that error;
- a strong link is not advice. The strongest surviving edge in the graph is
  TensorFlow / PyTorch, which are substitutes.

## Reading the metrics

| Metric | Question it answers |
|---|---|
| `support` / `pairs` | how often did we see this at all |
| `P(B\|A)` | of the positions asking for A, what share also ask for B |
| `lift` | how many times more often than chance would predict |
| `NPMI` | the same idea on a −1…+1 scale, for ranking |

Rank by NPMI, explain with lift, and always check `pairs` before believing
either. Raw co-occurrence alone is never evidence of a relationship: SQL + Python
is the second-largest pair in the corpus at lift 1.28.
