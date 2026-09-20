# taxonomy-kind — scoring cut is live and over-broad (start here)

**Date:** 2026-09-07 (evening). **Branch context:** everything below is on `main`
(`f3e27d4`, PR #208 squash) and **deployed to prod** (Railway `3814b0eb`, SUCCESS).
**Author of the cut:** this session — see the honesty note at the bottom.

---

## TL;DR — the one thing to decide first

The `adbc137` scoring cut ("CONCEPT/SOFT nodes never feed Fit") assumed
`kind='CONCEPT'` means *architectural style / named practice a CV never spells
out* (Microservices, DDD, CQRS). **Prod reality: `kind='CONCEPT'` holds 326
VERIFIED nodes covering ~18% of all required-skill rows on live vacancies**, and
the set is not what the cut assumed — it swept in `REST-API` (1681 vacancies),
`WebSockets`, `gRPC`, `SOAP`, all of QA (`Manual Testing` 579, `API Testing` 495,
`Test Automation`, `Test Design`, `Test Documentation`, `Automation QA`), all of
ML (`LLM` 534, `Machine Learning`, `Computer Vision`, `RAG`, `AI Agents`,
`Prompt Engineering`), all of embedded (`UART` 323, `I2C`, `SPI`, `CAN`,
`Embedded Systems`, `Embedded Linux`, `RTOS`, `Electronics`, `Soldering` 112),
all of networking (`TCP/IP`, `DNS`, `DHCP`, `VLAN`, `Ethernet`, `Networking`),
plus `OOP`, `Multithreading`, `ETL`, `Data Warehousing`.

**These are on CVs.** Removing them from the Fit denominator makes matching
*worse* for QA / ML / embedded / networking / data candidates — the opposite of
the cut's intent. A QA candidate's Fit is now computed against almost nothing.

### Recommended action

**Revert the scoring-cut half of `adbc137`, keep the rest.** Specifically undo:

- `apps/etl/src/03-discovery/score/score.sql.ts` — the `JOIN nodes nd ON ... AND ${scorableKind("nd")}` in the `agg` CTE
- `apps/etl/src/03-discovery/ranking/recommendation.service.ts` — `AND ${scorableKind("n")}` on the `vreq` join
- `apps/etl/src/03-discovery/feed/feed.service.ts` — the `kindGate` in `fetchSkills` and the `scorableKind` on `fetchSkillRows`
- keep `scorableKind` in `eligible.ts` (unused after revert — or delete it)
- keep the two `score.int.spec.ts` guard tests but **invert them** (a required CONCEPT node now *does* count) or delete them
- keep D1 (rail colour), keep Phase C extractor (`728f095`), keep the D5 facet spec

"Concepts don't score" is only viable once `kind='CONCEPT'` genuinely means
*only* architectural style / pattern. Options:
1. Clean the 326: relabel the ~250 that are real skills back to `TECH`/`NULL`,
   leave ~50–80 true patterns as `CONCEPT`. Days of curation.
2. Add a narrower kind (`PATTERN` / `STYLE`) and cut on *that*, leaving `CONCEPT`
   as a display bucket only.
3. Drop the "concepts don't score" idea entirely; solve the real problem
   (CV never says "Microservices") on the profile/inference side —
   `md/journal/migrations/profile-data-model.md`.

Until one of those, concepts should score like any skill.

---

## Answers to the two questions that triggered this

**Q: why aren't concept chips blue in the filter rail?**
The rail path (`getSkillFacets` → `NodeFacet.kind` → `chipClass`) is wired
correctly and this session didn't touch it. A chip is blue only when the node
has `kind='CONCEPT'` — and 326 do, so on prod many *should* be blue now
(`CI/CD`, `RAG`, …). If a specific one isn't: check its `kind` value; if NULL it
needs classifying on the map. Not a regression from #208. (Two call sites don't
pass `kind` at all — `StepExcludes.tsx:94`, `radar/[track]/page.tsx:293` — see
finding 6.)

**Q: I filtered by CI/CD and don't see it on the vacancy cards.**
That is the `adbc137` cut working as written — `fetchSkills` strips CONCEPT/SOFT
from every card's `skills.required/.optional`. `CI/CD` is `kind='CONCEPT'` on
prod, so it's gone from cards. Reverting per above brings it back. If you keep
any form of the cut, the card fix is variant (b): render concepts as a
non-scoring "context" chip (blue, never red/✗, never in the diff), don't remove
them.

---

## Code review findings (full taxonomy-kind surface, #207 + #208)

Severity re-rated against the prod data above.

### 1. 🔴 The scoring cut is live and over-broad — see TL;DR
18,310 of ~103,597 required `position_nodes` rows are `kind='CONCEPT'` and are
now excluded from Fit prod-wide. The review originally scoped this as "~50
protocol nodes"; the real number is 326 nodes / 18% of required signal.

### 2. 🟠 Concepts vanish from every vacancy card, not just scored ones
`fetchSkills` `kindGate` — filter-by-concept then shows matching cards with no
matching chip. Fixed by the revert; otherwise needs the "context chip" variant.

### 3. 🟠 A JD whose only required skills are CONCEPT disappears from `/match`
The `JOIN nodes nd` yields zero `agg` rows → the Position is unrankable, not
ranked-low. `score.int.spec.ts` asserts this today. Fixed by the revert.

### 4. 🟡 CONCEPT isolation has a `kind=NULL` hole
`scorableKind` treats NULL as scorable; the node resolver inserts LLM-emitted
strings as `status='NEW', kind=NULL`, and `node_stats` includes NEW. A
hallucinated practice that dodges the "verbatim knownSkills only" prompt rule
enters the Fit denominator. Pre-existing (NEW nodes always scored), not a #208
regression, but the gate isn't airtight. Moot if the cut is reverted.

### 5. 🟠 (#207, not #208) Admin single-node merge rewrites the whole `subscriptions` table
`taxonomy.service.ts` `mergeInto` → `repointMergedNodes` scans all subscriptions
and prunes any arm id not currently VERIFIED, including ids unrelated to the
merge. Hide a node, then merge anything from the map UI → users' `subscriptions.
params` role/skill arms get narrowed, `excludedSkillIds` arms emptied. Full-table
scan + UPDATE inside the merge txn. **Prod snapshot 2026-09-07: 33 active subs,
30 role arms / 16 skill arms / 1 excl arm — no obvious corruption, but no
before/after to be sure.** Review the `repointMergedNodes` "no shortcut when
remap is empty" decision and add a UI surface for the `wouldSilence`/`narrowed`
summary it already returns.

### 6. 🟡 `chipClass(false)` without `kind` in `StepExcludes.tsx:94` + `radar/[track]/page.tsx:293`
Same CONCEPT node renders blue in the feed rail / taxonomy map but default-styled
here. Audit doc §4.2 already flagged it.

### 7. 🟡 CV extractor now sends the full ~1200-name skill catalog every call
`candidate.extractor.ts:42` — `ExtractCandidate` previously got only roles.
Intentional (extractor-concepts-analysis §4), but a real per-CV token/latency
cost; the 60s cache only amortizes bursts.

---

## Prod data snapshot (2026-09-07, read via `scripts/prod-db-url.sh`)

### SKILL nodes by kind × status
| kind | status | count |
|---|---|---|
| CONCEPT | VERIFIED | 326 |
| CONCEPT | NEW | 4 |
| TECH | VERIFIED | 884 |
| TECH | NEW | 7 |
| TECH | HIDDEN | 1 |
| SOFT | VERIFIED | 2 |
| NULL | NEW | 8768 |
| NULL | VERIFIED | 19 |
| NULL | HIDDEN | 200 |

### Required `position_nodes` rows by kind (blast radius)
| kind | required rows | share |
|---|---|---|
| TECH | 75,553 | 73.0% |
| CONCEPT | 18,310 | 17.7% |
| NULL | 9,728 | 9.4% |
| SOFT | 6 | ~0% |

### Top CONCEPT nodes by # of live vacancies requiring them
REST-API 1681 · CI/CD 1598 · Manual Testing 579 · LLM 534 · API Testing 495 ·
Microservices 408 · RAG 368 · UART 323 · I2C 305 · SPI 300 · WebSockets 281 ·
Network Security 276 · AI Agents 276 · ETL 275 · Machine Learning 254 ·
TCP/IP 244 · Networking 240 · Computer Vision 222 · DNS 220 · OOP 213 ·
Embedded Systems 197 · CAN 186 · gRPC 174 · Test Automation 162 ·
Prompt Engineering 159 · Multithreading 156 · Embedded Linux 154 · IAM 139 ·
DHCP 134 · Electronics 129 · Data Warehousing 127 · Test Documentation 125 ·
RTOS 118 · Soldering 112 · Test Design 102 · VLAN 98 · Analog Electronics 93 ·
SOAP 91 · Ethernet 90 · Automation QA 90

---

## Verification state of #208 (for reference)

Everything green at merge: etl lint/build/562 tests + int, web lint/tsc/184
tests, `db:check`, `analytics:catalog`, `baml:identity:check`, post-merge `main`
CI, Railway + Vercel deploy. The regression is not a test failure — it's that
the tests encoded the wrong assumption about what `kind='CONCEPT'` contains.

## Honesty note

This session proposed and shipped the scoring cut on the stated premise that
CONCEPT was a small, clean "named practice" set. It did not check the prod
contents of `kind='CONCEPT'` before merging — the local int tests seeded their
own clean CONCEPT nodes (`Microservices`, `DDD`) and passed, which masked the
mismatch. The prod query that would have caught it was run only after merge.
Revert first, redesign second.
