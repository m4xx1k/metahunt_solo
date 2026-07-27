# Taxonomy role v2 — 83 VERIFIED roles → 28 disciplines

Active. Linear: MET-80 (safe merges, this commit), MET-81 (runbook), MET-70/71/72/73/79 (the plan itself), MET-77 (re-extraction), MET-24 (golden set, blocked on all of it).

## Why

The golden dataset cannot measure extraction quality while the taxonomy the extraction prompt is handed contradicts itself. The dependency runs **dataset ← prompt ← VERIFIED taxonomy ← admission rules**, so the taxonomy goes first.

Measured on prod 2026-07-27 (13340 vacancies):

| defect | nodes | vacancies |
| -- | -- | -- |
| Dumpster / not-a-discipline | 11 | 2193 |
| Non-separable near-duplicates (cos ≥ 0.80 on non-generic skill profiles) | 20 | ~6500 |
| Non-tech roles `isTech` was meant to drop | 28 | 73 |

`Software Engineer` (646) has Python 36% **and** C++ 31% as its top skills and needs 123 non-generic skills to cover half its profile — Full Stack needs 25. `Team Lead` (140) carries `seniority = LEAD` on 140 of 140 rows, so the role field adds nothing and destroys the discipline.

## Admission rule for a VERIFIED role

1. Names a **discipline** — not a level, a language, or a product.
2. Has ≥15 vacancies.
3. Separable from every sibling at **≥85%** holdout accuracy (nearest-centroid over its own non-generic extracted skills, 80/20 split).
4. Is not the parent of another VERIFIED role.

Rule 3 is a measurement, not a preference, and it carries **five documented exceptions by owner decision**: `AI Engineer`, `Machine Learning Engineer`, `Data Scientist`, `Data Engineer`, `Data Analyst` stay separate despite measuring 76.3% four-way. The exception list is explicit rather than the threshold being lowered — dropping the bar to 76% would silently re-admit every duplicate the rule exists to catch.

That decision is defensible on evidence the skills could not provide: a text classifier over `vacancies.description` separates **Data Engineer at 95%** and **Data Analyst at 89%**, and `Data Scientist` confuses with ML Engineer only 2/30 despite a 0.89 skill-vector cosine. Only the AI↔ML boundary is genuinely blurred (26.3% of ML postings read as AI). `FPGA Engineer` also stays separate — merging it was the one operation that would have stranded a browse track.

## What this commit changes

`mergeInto` repointed `vacancy_nodes`, `vacancies.role_node_id` / `domain_node_id`, `candidate_nodes` and `node_aliases`, then deleted the source node — and silently dropped four other references:

| reference | how it failed |
| -- | -- |
| `track_nodes` (ON DELETE CASCADE) | the browse preset vanished; `track_counts` COALESCEs a child track's own `role_ids` with its parent's, so a track left with zero presets served the parent's whole set. Measured worst case: `hw-fpga` 20 → ~1141 vacancies, no error, no log |
| `node_tech_meta` (ON DELETE CASCADE) | source's `stack`/`is_core`/`generic` lost. Only 322 skills carry a non-null stack, and the `on_stack` ranking gate degrades silently rather than failing |
| the source's `slug` | died with the node, 404ing an indexed `/role/<slug>`. 23 prod hubs sit at or above `ROLE_HUB_MIN_VACANCIES`. Worse, `NodeSlugResolver` drops unknown slugs silently, so a saved `?roles=<old-slug>` widened to the whole feed instead of failing visibly |
| target status | only a NEW *source* was guarded. A swapped source/target moved links onto a feed-invisible node with no complaint |

New `node_slug_aliases (slug, type, node_id)` keeps a retired slug resolvable so `/role/[slug]` can 308. `node_aliases` cannot serve this: it stores normalized *names* with punctuation stripped, while a slug is the hyphenated URL form.

## The driver

`pnpm taxonomy:migrate --plan apps/etl/src/admin/taxonomy/plans/role-v2.plan.json`

**Dry-run is the default.** `--apply` mutates; `--phase N` runs one phase.

Three design points that are not obvious:

- **Resolves by exact `canonical_name`, never via `node_aliases`.** After a rename or merge the old name survives as an alias pointing at the successor, so an alias lookup answers every idempotency check wrongly — `SDET` would resolve to `Automation QA Engineer` and the script would merge a node into itself.
- **Later phases resolve against a projected overlay.** Four renames mint the merge targets phase 2 needs, so without projection a whole-plan dry-run refuses every dependent merge and can only ever validate one phase at a time.
- **Subscription repair and the matview refresh run in the same process.** `subscriptions.params` is JSONB holding raw node uuids with no FK; once `mergeInto` deletes a source, nothing in the database can map its uuid to the target. The repair refuses to empty a live filter and reports those rows for a human instead.

## Dry-run against prod, 2026-07-27

```
SUMMARY  apply 54  skip 0  refuse 0  warn 17
         indexed /role hubs affected (count>=3): 23
         vacancies moving or leaving: 506
```

The 17 warnings are the intentional non-tech hides. Exit 1 on warnings, 2 on refusals, and a refusal applies nothing.

## Who is actually affected

Six active Telegram subscriptions reference a node the plan touches. They are **real users from the Reddit launch cohort** (created 10–26 July, 35 / 10 / 7 / 4 / 2 / 0 digests sent), not test accounts — `user_id` is null only because they subscribed through the bot without linking a web account.

| subscriptions | what happens |
| -- | -- |
| 3 gamedev | lose `Game Artist (2D/3D)` and `Game Designer` (hidden as non-tech, no successor exists). Keep `Game Developer` → `Game Engineer`, uuid unchanged. **Real narrowing, and the deliberate consequence of dropping non-tech** |
| 2 QA | `SDET` remaps to `Automation QA Engineer`, which they already hold; `QA Engineer` dissolves with no successor node, but they already hold Manual QA *and* Automation QA. **No coverage lost** |
| 1 security | 4 arms remap to `Security Engineer`, which they already hold. **No coverage lost** |

So the only genuine loss is gamedev art/design roles, for three users, by design.

## Still manual after `--apply`

- `dedup-cli embed --force` — `buildEmbeddingText` puts `Role:` and `Skills:` inside the hashed text, so renames invalidate `embedding_source_hash`. The non-force fetch predicate never selects an already-embedded row, so the hash would stay wrong forever. The hash filter still gates the OpenAI call, so only genuinely changed rows cost money. Note changed embeddings shift ANN neighbours and can move `unique_vacancy_id` groups — re-running `dedup-cli resolve` is a decision, not a default.
- `pnpm skills:classify` — `setStatus(VERIFIED)` does not create a `node_tech_meta` row, and prod's invariant is currently 1216/1216.
- **308s for the retired slugs**, generated from the run's JSONL audit log into `next.config.ts` (there is a documented 308 precedent there).

## Ordering, when the plan is applied

Renames first (they mint targets, and are status- and slug-neutral), then merges, then per-vacancy dumpster reassignment, then hides **gated on `count(*) = 0`**. Hiding a dumpster node before its vacancies move would drop 2193 vacancies (16.5% of the corpus) out of the feed, the facets and the sitemap for the whole window — reassign-then-hide makes that exposure zero.

Pause `rss-ingest-hourly`, `tg-digest-daytime` and `dedup-sweep` first: ingest mints `NEW` nodes mid-flight, `refreshNodeStats` fires at the end of each run and would bake half-migrated state into the IDF weights, and a `:30` digest would go out against a half-migrated taxonomy. Window 22:05–05:55 Europe/Kyiv.

## Not yet done

- Phases 3 and 4 of the plan (dumpster reassignment, then their hides) are not in `role-v2.plan.json` — the driver has no per-vacancy reassignment op yet, and `mergeInto` is the only writer of `vacancies.role_node_id` outside the loader.
- 11 child tracks are keyed on ROLE presets. With `track_nodes` now repointed by `mergeInto` and `FPGA Engineer` out of the merge list, nothing strands under *this* plan — the driver's post-checks assert it. Re-keying them onto SKILL presets is future-proofing for the next collapse, not a blocker.
- Rollback is the verified `pg_dump` taken before any of this. Restore is all-or-nothing across the node-dependent tables: a partial restore of `nodes` alone leaves `vacancies.role_node_id` pointing at the merge targets, produces no FK error, and **passes the conservation checks while being wrong**.
