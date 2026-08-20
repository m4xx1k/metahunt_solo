# Extraction evaluation handoff — 2026-08-20

## Read this first

This is a handoff for the extraction-quality work that is currently **local
only**. It distinguishes three things deliberately:

1. **P0** — an earlier, already deployed extraction-cache/exact-content-dedup
   change. It is not part of the pending evaluation experiment.
2. **MET-24** — an offline golden-evaluation harness and a historical release.
   It has no production write path.
3. **P1** — the current, not-yet-deployed review of the vacancy extraction
   prompt/taxonomy contract. This is the work that may be abandoned, restarted,
   or continued.

Do not turn a local evaluation reset into a production rollback. P1 has not
modified production data; P0 has.

## Starting point and intended outcome

The work started after two related observations:

- The production prompt could emit leadership labels such as `Team Lead`,
  `Architect`, or `CTO` as a `role`, even though a browseable role should be a
  technical discipline/job function.
- Taxonomy curation had recently changed canonical role names. Changing a
  prompt or mutating the taxonomy without a labelled real-vacancy benchmark
  would be guesswork.

The owner-approved end goal is:

> Measure whether one small prompt/taxonomy change improves complete vacancy
> extraction on real postings, then make any taxonomy or production migration
> only after a human review and an explicit go-ahead.

This is **not** a project to create a prompt registry, mass re-extract vacancies,
or change production taxonomy automatically.

The normative role/seniority policy is
[`md/todo/dedup/p1-role-contract-review.md`](../../todo/dedup/p1-role-contract-review.md).
Its key rule is: `Team Lead` is a seniority/leadership signal, never a role. A
technical Android Team Lead is `role: "Android Engineer"`, `seniority: LEAD`;
if no technical discipline is established, the role is `null`.

## State at handoff

Repository: `/home/maxxik/solo/metahunt_solo`

- Branch: `main`
- Immediately before recording this handoff, the code/evaluation HEAD was
  `e6b236d`; this handoff itself is an additional local documentation commit.
  Verify the live count rather than trusting a stale number:

  ```bash
  git rev-list --count origin/main..HEAD
  ```

  Nothing in this evaluation sequence has been pushed or deployed by this work.
- There are intentionally uncommitted edits to
  `apps/etl/golden/role-contract-v1/{decisions,dataset}.json`: the owner is
  actively reviewing vacancies at the local review UI. At the check on
  2026-08-20, **15/50** rows were approved. Do not reset, stash, or stage those
  files without asking the owner.
- A local review process may be running on `127.0.0.1:5055`. It is loopback
  only and serves decoded vacancy texts. Stop it with `Ctrl-C` in its terminal;
  never bind it to a LAN interface.

## What existed before this P1 sequence

### P0 — deployed cache/dedup foundation

`origin/main` contains the P0 work; `ee3ae94` is the common ancestor of the
local P1 sequence and was the deployed P0 checkpoint. Its purpose was
deterministic exact-content handling plus extraction artifact identity/caching.

The associated additive DB migration is
[`libs/database/migrations/0052_exact_content_and_extraction_artifacts.sql`](../../../libs/database/migrations/0052_exact_content_and_extraction_artifacts.sql):

- `extraction_artifacts` stores extraction work keyed by `spec_hash` and
  `input_hash`.
- `exact_content_conflicts` records exact-content collisions that require
  deterministic handling.

Read-only production check on 2026-08-20:

| Production fact | Observed value |
| --- | ---: |
| `extraction_artifacts` table | present; 825 rows |
| `exact_content_conflicts` table | present; 0 rows |
| verified role nodes | 41 |

Those are real production tables/data. They must **not** be deleted just because
the P1 evaluation is abandoned.

### MET-24 — existing full-field evaluation foundation

The existing remote branch was found at
`origin/feat/MET-24-golden-set-rebased` (`5c37b02`) and integrated locally by
`1e5e155`. It contributes:

- 15-field extraction contract and scorer;
- obfuscated corpus storage (`corpus.enc.json`), manifest, snapshot, run
  provenance types, validation and release/archive tooling;
- a localhost-only review UI;
- a historical 25-row reviewed release under
  `apps/etl/golden/releases/v1-policy-2026-08-08/`;
- commands documented in
  [`md/runbook/golden-evaluation.md`](../../runbook/golden-evaluation.md).

The historical labels use an older role policy/taxonomy. They are evidence, not
automatic truth for P1 — notably historical output may contain `CTO (Chief
Technology Officer)` or `Team Lead` as roles.

Its historical production run scores 69.1% across all scoreable fields and
56.3% on its core fields. It has no provenance sidecar, so it is a diagnostic
baseline, not a comparable new model experiment.

## What was done in P1, locally

### Contract and candidate prompt

Commits `bc3131e`, `5a2d403`, `78684a2`, and related tests established a
candidate-only prompt change in
[`apps/etl/baml_src/extract-vacancy.baml`](../../../apps/etl/baml_src/extract-vacancy.baml).
It is not deployed. The policy makes discipline primary and handles Lead,
Architect, CTO/VP/Head conservatively.

Prompt identity is content-derived, not a manual version number: source, BAML
runtime, provider/model and the verified-taxonomy hash form the identity. The
helper is
[`apps/etl/src/02-enrich/extraction/extraction-identity.ts`](../../../apps/etl/src/02-enrich/extraction/extraction-identity.ts).

### A failed approach that was correctly removed

Commit `2641b9c` created paraphrased/de-identified “production-derived” cases.
That is not valid prompt-evaluation input because it changes the source text.
It was explicitly reverted by `110403c`. Do not resurrect that dataset.

The temporary plaintext/raw intake file used during that failed pass was also
removed. The current corpus is sourced from actual production postings and
stored only in MET-24's obfuscated representation; plaintext review packets
are ignored by Git.

### Real 50-row P1 working set

Commit `0608293` created
[`apps/etl/golden/role-contract-v1/`](../../../apps/etl/golden/role-contract-v1/):

- 50 real production vacancy texts, selected by a read-only query through
  `scripts/prod-db-url.sh` and stored as `corpus.enc.json`;
- a manifest and production-output baseline (`runs/prod.json`);
- a snapshot of prompt source plus verified roles/domains/skills;
- seven explicit boundary cases in addition to stratified selection: CTO, Head
  of Engineering, Lead/Solution Architect, Android Team Lead, Senior Android,
  Middle iOS, and non-technical Recruitment Team Lead;
- `GOLDEN_DIR` support plus `golden sample --include-id` so a policy experiment
  cannot overwrite the historical MET-24 working directory/release.

The P1 snapshot was compared read-only with the current production verified
taxonomy on 2026-08-20. Roles, domains and skills match exactly (including
`Android Engineer`; `Team Lead` still also exists as a legacy verified node).
The review UI displays the *old production extraction as a proposal*, not a
taxonomy selector; its presence is not an endorsement of `Team Lead` as a
correct output.

### Full-field human review queue

Commits `5d6afe8` and `d8a6318` added:

- `pnpm golden prepare-review`, which creates a 50 × 15 full-field review queue
  from production output without inventing fake A/B labels;
- `pnpm golden review`, which opens `http://localhost:5055` and decodes source
  text only on loopback;
- explicit red `prod extractor failed` visibility for failed old baseline rows.

The review covers all fields, not just role/seniority:

`isTech`, `role`, `seniority`, `skills`, `experienceYears`, `salary`,
`englishLevel`, `employmentType`, `workFormat`, `locations`, `domain`,
`engagementType`, `companyName`, `hasTestAssignment`, and `hasReservation`.

To change a proposal, use `edit`; use `why` to record a concise source-based
rationale. `null` is a real scoreable answer; use `not scorable` only for a
specific schema/policy/taxonomy/source ambiguity reason.

### Seven provider failures were manually labelled

All seven failures in `runs/prod.json` had the same cause: historical provider
`429 insufficient_quota`, not a parsing or policy error. Commit `e6b236d`
records seven source-reviewed decisions (55 field rationales and one honest
`taxonomy-gap` for the explicit `Utilities` domain). `pnpm golden validate`
passed afterwards.

The score of these seven rows against historical `runs/prod.json` is 0%, as it
must be: every old extraction failed. Do not interpret that score as a prompt
regression.

## What changed where

| Surface | Changed? | Notes |
| --- | --- | --- |
| Local Git working tree | Yes | MET-24 integration, P1 corpus/review code, prompt candidate, docs and current human review decisions. |
| Local database | No known write by P1 | P1 sampling queried production read-only; no local migration, taxonomy update, re-extraction, embedding or dedup sweep was run. |
| Production database | No P1 write | P1 performed read-only taxonomy/posting/table checks only. P0's pre-existing migration 0052 is present. |
| Production prompt/model | No | Candidate BAML file is local-only. |
| Production deployment | No P1 deploy | No P1 code was pushed/deployed. |
| Paid model calls | No P1 calls | Historic failures were observed; no new evaluation model run was authorized. |

## How to continue safely

1. Finish the human review of the 50 real rows. Prefer source facts over making
   the current production proposal look good.
2. Commit the resulting `decisions.json` and `dataset.json` only after the owner
   reviews the diff. Then run:

   ```bash
   GOLDEN_DIR=apps/etl/golden/role-contract-v1 pnpm golden validate
   ```

3. Build a provenance-bound full-field candidate runner against this exact
   corpus/snapshot. It must default to dry-run and require an explicit call and
   USD ceiling for a live model run.
4. Compare the current production baseline and one prompt candidate at a time.
   Review field-level deltas, not just a single average.
5. Only after that, prepare a separate taxonomy dry-run and separate production
   rollout plan. Neither is authorized by this evaluation work.

## Stop, discard, or restart safely

### A. Stop the current review without discarding anything

1. In the terminal running `pnpm golden review`, press `Ctrl-C`.
2. Check what exists before doing anything else:

   ```bash
   git status --short
   git diff -- apps/etl/golden/role-contract-v1/decisions.json \
     apps/etl/golden/role-contract-v1/dataset.json
   ```

Stopping the server has no DB or Git effect. It only stops the local loopback
process.

### B. Discard only the owner’s uncommitted review clicks

This restores the last committed seven reviewed failure rows; it does **not**
delete the 50-row corpus or the review tooling:

```bash
git restore apps/etl/golden/role-contract-v1/decisions.json \
  apps/etl/golden/role-contract-v1/dataset.json
```

Run this only after the owner confirms those in-progress review edits should be
lost. Make a patch first if there is any doubt:

```bash
git diff --binary -- apps/etl/golden/role-contract-v1/decisions.json \
  apps/etl/golden/role-contract-v1/dataset.json > /tmp/p1-review-backup.patch
```

### C. Abandon all local P1/MET-24 work and return the local branch to remote main

This is destructive **to local-only commits and uncommitted review decisions**.
It does not affect GitHub or production until someone pushes/deploys. First make
a recoverable branch:

```bash
git switch main
git branch backup/p1-eval-before-reset
git add -A
git commit -m "wip: preserve P1 evaluation before reset"
git fetch origin
git reset --hard origin/main
```

The backup branch is the recovery point. The last command intentionally makes
local `main` identical to `origin/main`; it is not a command to run casually.
Ignored plaintext review batches may remain on disk. Remove only the explicit
P1 batch directory if it is no longer wanted:

```bash
git clean -fdX -- apps/etl/golden/role-contract-v1/batches
```

### D. Start a clean new evaluation while keeping only the reusable MET-24 harness

Do not reset production or rewrite the historical release. Start a new local
branch from remote main and merge the known MET-24 source branch:

```bash
git fetch origin
git switch -c eval/restart-from-real-corpus origin/main
git merge --no-ff origin/feat/MET-24-golden-set-rebased
```

Then choose a new isolated directory (do not reuse/overwrite a reviewed one)
and build a fresh corpus from production **read-only**:

```bash
GOLDEN_DIR=apps/etl/golden/restart-YYYY-MM-DD pnpm golden sample --size=50
GOLDEN_DIR=apps/etl/golden/restart-YYYY-MM-DD pnpm golden snapshot
GOLDEN_DIR=apps/etl/golden/restart-YYYY-MM-DD pnpm golden prepare-review
GOLDEN_DIR=apps/etl/golden/restart-YYYY-MM-DD pnpm golden review
```

`sample` and `snapshot` need `DATABASE_URL`; obtain it through the existing
read-only production-DB workflow. Do not paste a production URL into docs,
shell history, or committed files.

### E. If the local commits were already pushed/merged or accidentally deployed

Do **not** use `reset --hard` against a shared branch. Instead:

1. stop and identify the deployed commit/environment;
2. make a backup and read the deployment/migration runbook;
3. revert code with a reviewed `git revert` commit, newest first;
4. deploy that revert through the normal path;
5. leave additive DB tables and their data in place unless a separate, approved
   DB migration explicitly removes them.

For P1 specifically, there is currently nothing to roll back in production:
no P1 migration, prompt deployment, re-extraction, taxonomy mutation or paid
model run occurred. A production rollback of P0 is a different operational
decision: it must not drop `extraction_artifacts` or `exact_content_conflicts`
as a side effect of abandoning evaluation work.

## Useful commands

```bash
# Historical 25-row MET-24 diagnostic only
pnpm golden score --run prod

# Current P1 review server (actual decoded source text; localhost only)
GOLDEN_DIR=apps/etl/golden/role-contract-v1 pnpm golden review

# Validate approved current P1 decisions
GOLDEN_DIR=apps/etl/golden/role-contract-v1 pnpm golden validate

# Inspect only the P1 review diff before committing it
git diff -- apps/etl/golden/role-contract-v1/decisions.json \
  apps/etl/golden/role-contract-v1/dataset.json
```

## Non-negotiable guardrails

- Never use paraphrased/synthetic vacancy text as the actual prompt-eval corpus.
- Never expose the localhost review server outside `127.0.0.1`.
- Never run a live evaluation without an explicit model/call/USD cap approval.
- Never rewrite a reviewed release in place; archive/create a new working set.
- Never treat an old prod proposal as ground truth just because it appears in
  the review UI.
- Never combine a P1 evaluation rollback with a P0 production-schema rollback.
