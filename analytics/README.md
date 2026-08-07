# MetaHunt Data Lab

An isolated sandbox for labor-market research over the vacancy corpus. Full prod
data, zero ability to touch prod, no application stack to boot.

## What this is

| | |
|---|---|
| Worktree | `.claude/worktrees/data-lab` on branch `feat/data-lab` |
| Database | `metahunt_lab` on the shared `metahunt-db` container (`localhost:54323`) |
| Credentials | identical to dev — only the database *name* differs |
| Source | restore of a `pg_dump` of Railway prod (see `snapshot.md`) |
| Running services needed | **none** — no ETL, no Temporal, no web, no MinIO |

The lab database is a **copy**. Mutate it freely: create indexes, materialized
views, scratch tables, `EXPLAIN ANALYZE` whatever. That is the whole reason it
exists — the read-only-production discipline is satisfied structurally rather
than by an agent remembering to behave.

## Why a separate database instead of querying prod

Same connection, same creds, different database name. It gives us:

- **No production risk.** The lab `.env` has no route to prod at all — its
  `DATABASE_URL` is `localhost:54323`. Reaching prod requires the `railway` CLI,
  which lives outside this worktree.
- **Free mutation.** Association-strength work wants indexes and rollup tables.
  On prod those are forbidden; here they're one statement.
- **Reproducibility.** The corpus is frozen at a known dump. Two runs of the same
  query a week apart return the same numbers.
- **No isolation from the real schema.** It's a byte-for-byte restore, so
  anything that works here transfers to prod unchanged.

## Running queries

```bash
analytics/lab.sh -c "select count(*) from vacancies"
analytics/lab.sh -f analytics/experiments/001-skill-frequency/query.sql
analytics/lab.sh                       # interactive psql
```

`lab.sh` refuses to run if `DATABASE_URL` doesn't point at `metahunt_lab`, so a
stray `.env` edit can't silently redirect an experiment at dev or prod data.

TypeScript/drizzle also works — `pnpm install` has already run in this worktree,
and `node --env-file=.env` picks up the lab database. Prefer plain SQL first;
reach for TS only when the analysis genuinely needs it.

## Refreshing the snapshot

```bash
# from the MAIN worktree (needs `railway login` + `railway link`)
./scripts/db-backup.sh

# then reload the lab from the newest dump
CONTAINER=metahunt-db DB=metahunt_lab ./scripts/db-restore.sh
```

Record the new dump filename and date in `snapshot.md` when you do.

## Experiment layout

```
analytics/
  README.md
  snapshot.md              provenance of the current corpus
  AGENT-PROMPT.md          the research brief this lab was built for
  lab.sh
  experiments/
    001-<slug>/
      README.md            question, method, denominator, findings
      query.sql
```

Each experiment states its denominator, sample size, filters and time coverage —
a number without those is not a finding.

## Disarmed in this worktree

The lab `.env` is the dev `.env` with the outbound channels blanked, so an
accidental script run can't reach a real user or a real queue:

- `TELEGRAM_BOT_TOKEN` → placeholder (no messages can be sent)
- `TEMPORAL_ADDRESS`, `TEMPORAL_API_KEY` → empty (no workflows can be scheduled)
- `POSTHOG_API_KEY` → empty (no events ingested from lab runs)

LLM keys (`OPENROUTER_API_KEY`, `DEEPSEEK_API_KEY`, `OPENAI_API_KEY`) are kept —
they're read-only and cost money but mutate nothing. `POSTHOG_PERSONAL_API_KEY`
is kept for read-only analytics queries.
