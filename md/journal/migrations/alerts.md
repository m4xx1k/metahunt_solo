# alerts — Telegram alerts v2

**Branch:** `docs/alerts-system` (this plan) · code: `feat/alerts-v2`
**Status:** planned — ready to start S1
**Started:** 2026-09-28 · **Closed:** —

The one plan for the alerts rework. The *why* is [ADR-0018](../decisions/0018-alerts-posting-grain.md);
where the two disagree on a detail, **this file wins**. Supersedes the digest parts of
[`tg-notifications.md`](tg-notifications.md).

Contents: 1 problem · 2 scope · 3 decisions · 4 how it works · 5 invariants · 6 schema ·
7 identity and dedup · 8 legacy subscriptions · 9 text and UI · 10 code · 11 steps ·
12 testing · 13 rollout and rollback · 14 who does what · 15 after release 1 · 16 risks ·
open · evidence.

---

## 1. Problem

| # | defect | effect today |
|---|---|---|
| 1 | **Hides bumps.** The digest looks at `first_observed_at`; a recruiter's bump moves only `published_at`. | ~96 re-dates/day on Djinni + DOU never reach Telegram; the feed shows them. |
| 2 | **Cap of 6 cards per run** (6 × 13 runs = 78/day). Not a Telegram limit. | An "all jobs" alert makes ~200 events/day; the tail ages out silently. |
| 3 | **"Already sent" is keyed on the position.** | When dedup regroups a posting or misses a copy, the job arrives again (#210/#211). |

## 2. Scope

**Release 1 — in**

- New alerts engine (`04-notify/alerts/`), replacing the digest's match + deliver path.
- No caps: everything that matches is sent.
- Bumps on by default, `↑ піднято` on the card, per-subscription toggle in `/me`.
- Ledger per chat and posting, with versions.
- Cutover without a backlog flood (floor + lazy init).
- Legacy: CV subscriptions retired with a message; ownerless subscriptions kept and nudged once to
  log in.
- Feature flag + canary + rollback path.

**Release 1 — out** (§15): show cross-site copies, cadence, compact mode, settings link on the last
card, faster ticks, parallel delivery.

**Not touched:** the feed, matching filters, dedup, ingest, `/preview`, the post-activation sample,
`debugSend`, the subscribe flow on the web.

## 3. Decisions

| decision | value | by |
|---|---|---|
| unit we notify | the **posting** (one `vacancies` row); matching stays per position | ADR-0018 |
| ledger key | `(chat_id, vacancy_id)` — §7 | owner, 2026-10-01 |
| caps | none | owner, 2026-09-28 |
| bumps | on by default; toggle `alerts_bumps` per subscription, in release 1 | owner, 2026-10-01 |
| bump marker | a line `↑ піднято` on top of the card | owner, 2026-09-30 |
| settings live on | the subscription (columns on `subscriptions`, edited in `/me`) | owner, 2026-09-30 |
| subscription kinds | filter subscriptions only; **CV subscriptions are retired** | owner, 2026-10-01 |
| ownerless (pre-login) subscriptions | **kept**, plus a one-time "log in to manage" message | owner, 2026-10-01 |
| rollout | flag + canary: owner chat → 3–5 real chats → everyone | owner, 2026-09-30 |
| delivery | chats in sequence, no global limiter (15–30 cards per chat run today) | plan |
| windows | candidates 24h; absorb 24h; collapse 72h | plan |

## 4. How it works

### Terms

- **Posting** — one `vacancies` row, identity `vacancy_id`. A bump updates it in place.
- **Position** — the posting's dedup group (`unique_vacancy_id`). Used for matching and R3/R3b only.
- **Version** `ver(p) = least(coalesce(published_at, loaded_at), now())` — the source's publish date,
  clamped. A bump raises it.
- **Seen** `seen(p) = greatest(published_at, loaded_at)` — last activity; used only by the window.
- **Floor** `alerts_floor_at` — the moment from which a subscription promises delivery.
- **Chat run** — one pass of the engine over one chat.

### Every hour (09:30–21:30 Kyiv, schedule `tg-digest-daytime`)

For each chat with an active filter subscription, in sequence:

1. **Lazy init** (first v2 run of this chat only, §6) → this run sends only the legacy messages, no cards.
2. **Candidates** — for each active filter subscription of the chat:

   ```
   position matches the subscription's filter
   ∧ posting.deduplicated_at IS NOT NULL
   ∧ seen(p) > max(sub.alerts_floor_at, now − 24h)
   ```

   Page through all matches (no page cap). Merge across the chat's subscriptions by posting.
3. **Decide** each candidate in `seen ASC` order with the rules below; write the ledger as we go, so
   later candidates see earlier decisions.
4. **Send** the ones that resolve to `new` / `bumped`.
5. **Log** one line: `chat run: candidates / sent / bumped / absorbed / collapsed / skipped`.

### Rules — `decide()`

`row` = this chat's ledger row for the posting. Sibling = another posting of the same position.

| # | condition | result | send |
|---|---|---|---|
| R1 | `row` exists and `row.version_at ≥ ver(p)` | skip | no |
| R2 | `row` exists, newer version, `row.notified_at > now − 24h` | store version, kind `absorbed` | no |
| R3 | a sibling **on another source** was notified, and (no `row`, or the sibling was notified < 72h ago) | kind `collapsed` | no |
| R3b | a sibling **on the same source** was notified (a re-created listing, dedup rule `repost`), no `row` | treat as a bump of that sibling: R2 if it was notified < 24h ago, else `bumped` | if bumped |
| R4 | otherwise | `new` if no `row`, else `bumped` | yes |

**Bumps toggle.** A `bumped` result (R3b or R4) is sent only if at least one of the chat's
subscriptions that matches the posting has `alerts_bumps = true`. Otherwise it is a skip with no
ledger write.

`decide()` is a pure function: (candidate, the chat's ledger rows for the posting and its siblings,
matching subscriptions, now) → result. No I/O.

### Send path

1. **Claim** — upsert the ledger row with the new version (`… ON CONFLICT … WHERE version_at < ver(p)`)
   `RETURNING`. Nothing returned → another run owns it → skip.
2. **Send** — card body = the position's facts (as today); title link, source name, and
   `/go/:vacancyId?s=<subscriptionId>` = the posting's own. `bumped` adds `↑ піднято` on top.
3. **Telegram API error response** (definitely not delivered) → undo the claim (restore the previous
   row or delete it). **Timeout / network error** (unknown) → keep the claim.
4. **Dual-write** `(subscription_id, vacancy_id)` into `sent_notifications` — rollout only, for rollback.
5. **Sound** — the first message of a chat run notifies; the rest are silent.
6. A chat that blocked the bot → existing `isChatUnreachable` / `recordUnreachableDelivery` path.

## 5. Invariants

What the tests prove (§12) and the canary watches.

| # | invariant | holds by |
|---|---|---|
| I1 | **Identity.** The ledger key is `(chat_id, vacancy_id)`; a position id is never a key. | schema |
| I2 | **One version, once.** A chat gets a given `(posting, version)` at most once — across retries, manual triggers, overlapping runs and all its subscriptions. | claim upsert + PK |
| I3 | **Everything that matches arrives.** No caps. Each candidate is sent, or recorded `absorbed` / `collapsed`, or skipped by R1 / the bumps toggle. | no limit in code |
| I4 | **Versions, not windows.** "Already notified" is `version_at ≥ ver(p)` only. Time windows exist only in the candidate query and in R2/R3/R3b, where they can only suppress, never resend. | `decide()` |
| I5 | **Ready first.** Only postings with `deduplicated_at IS NOT NULL` are candidates, so R3/R3b see the final group. | candidate query |
| I6 | **Floor.** Nothing whose activity predates the subscription's floor. | candidate query |
| I7 | **One sound per chat run.** | send path |
| I8 | **At most once.** When delivery is uncertain, the claim stays: a lost card beats a repeat. | send path |
| I9 | **Dedup can be wrong, alerts stay correct.** A missed merge shows as a visible duplicate; a false merge collapses a copy; neither causes a repeat. | I1 + I4 |
| I10 | **No backlog flood.** A chat's first v2 run sends no cards. | lazy init |

## 6. Schema (additive, one migration)

```sql
ALTER TABLE subscriptions ADD alerts_floor_at timestamptz;          -- existing rows: NULL
ALTER TABLE subscriptions ALTER alerts_floor_at SET DEFAULT now();  -- new rows: creation time
ALTER TABLE subscriptions ADD alerts_bumps boolean NOT NULL DEFAULT true;

CREATE TABLE chat_notifications (
  chat_id         text        NOT NULL,
  vacancy_id      uuid        NOT NULL REFERENCES vacancies (id),  -- no cascade, like sent_notifications
  version_at      timestamptz NOT NULL,
  notified_at     timestamptz,          -- null for collapsed rows that were never sent
  kind            text        NOT NULL, -- new | bumped | absorbed | collapsed
  subscription_id uuid,                 -- first subscription that produced it; attribution only
  position_id     uuid,                 -- snapshot at decision time; debugging only
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (chat_id, vacancy_id)
);
```

`subscriptions.deactivated_reason` gains the value `retired` (CV subscriptions, §8).

**Floor.** New subscription → `now()` (default). Re-activation (`is_active` false → true) → `now()`.
Existing rows → `NULL` until lazy init.

**Lazy init** — the first time v2 handles a chat that has an active subscription with
`alerts_floor_at IS NULL`, in one transaction:

1. Set `alerts_floor_at = now()` on the chat's subscriptions where it is null.
2. Copy the chat's `sent_notifications` into `chat_notifications`
   (`version_at = ver(p)`, `notified_at = sent_at`, `kind = new`, `ON CONFLICT DO NOTHING`).
3. Deactivate the chat's CV subscriptions (`deactivated_reason = 'retired'`), queue the CV message.
4. If the chat has an ownerless subscription, queue the login message.

Then send the queued legacy messages (at most two) and stop: **no vacancy cards in this run**. The
cards v1's cap never sent stay unsent — intended.

## 7. Identity and dedup

### Ledger key: `vacancy_id` vs `(source_id, external_id)`

A posting is found by the unique `(source_id, external_id)` and **updated in place**; `id`,
`source_id`, `external_id`, `loaded_at` are immutable on update
(`02-enrich/loader/repositories/vacancy.repository.ts`). The only code that deletes a vacancy is the
one-off `ExternalIdCleanupService`; it rewrote non-twin rows in place, keeping `id`.

| case | `vacancy_id` | `(source_id, external_id)` |
|---|---|---|
| bump / edit / re-extract | stable | stable |
| id format rewritten in place | stable, free | needs `ON UPDATE CASCADE` |
| source changes format, rows re-ingested as new | arrives once more | same |
| twin row deleted by a cleanup | FK blocks it — remap by hand | same |
| `vacancies` rebuilt with new ids | breaks | survives — never done; would break `sent_notifications`, `/go`, analytics too |
| fit with the schema | same as `sent_notifications`, `/go/:id`, `dedup_overrides`; one uuid join | composite FK everywhere |

→ **`vacancy_id`.**

### Dedup — four layers, only the last one groups

| # | layer | key | does | alerts use |
|---|---|---|---|---|
| 1 | bronze RSS record | `rss_records (source_id, hash)`; hash = title + text + publish date | skips an unchanged re-fetch; a re-dated or edited item is a new record | — |
| 2 | posting | `vacancies (source_id, external_id)` | a new record for a known id **updates the row in place** (newer wins); resets `deduplicated_at` | key + version |
| 3 | content fingerprint | sha of normalized title + text | skips LLM re-extraction when text is unchanged; input to rule `exact` | — |
| 4 | position grouping (ADR-0016) | `vacancies.unique_vacancy_id` | rules `exact` (same text), `repost` (same board + company + title, text ≥ 0.9), `cross_source` (other board); vetoes (company, seniority, role, requisition no., operator override); 5-min sweep | matching, R3, R3b |

A bump travels: new RSS record (1) → row updated, `deduplicated_at` reset (2) → regrouped within
≤ 5 min (4) → candidate on the next tick (I5). An edit may split a posting out of its position
(ADR-0016); its ledger row is per posting, so it never repeats.

## 8. Legacy subscriptions (prod, read-only, 2026-10-01)

| kind | active | chats | origin | v2 does |
|---|---|---|---|---|
| filter, with account | 19 | 12 | today's normal path | delivers |
| filter, **no account** | 17 | 15 | created 2026-07-10 → 07-29, before subscribing required login; confirmed via the bot's `/start` deep link. None logged in since. | delivers; one-time login message at lazy init |
| CV, with account | 2 | 2 | ADR-0008; no longer created from the web | retired at lazy init + message |
| CV, no account | 1 | 1 | same, pre-login | retired at lazy init + message |

Creating an ownerless subscription is already impossible (`POST /subscriptions` is behind
`JwtAuthGuard`). A Telegram login on the site adopts a chat's ownerless subscriptions
(`AuthService.claimTelegramSubscriptions`), after which they show in `/me`.

## 9. Text and UI

### New copy (all in `telegram-copy.ts`; final wording approved by the owner in S2)

| key | draft | where |
|---|---|---|
| `digest.bumped` | `↑ піднято` | first line of a bumped card |
| `legacy.cvRetired` | `CV-підписку вимкнено. Фільтр — на сайті: <url>` | lazy init, chats with a CV subscription |
| `legacy.loginToManage` | `Керуй сповіщеннями на сайті: <url>` | lazy init, chats with an ownerless subscription |

### Every place that touches alerts

| place | what | release 1 change |
|---|---|---|
| `04-notify/telegram/telegram-copy.ts` | all bot replies, command menu, digest header | the three keys above |
| `04-notify/telegram/digest.renderer.ts` | the card (title, salary · company · domain, `Деталі:` lines, `знайдено на <source>`) | bump line; link + source from the posting |
| `04-notify/telegram/telegram-commands.handler.ts` | `/start`, `/list`, `/preview`, `/stop`, `/help`, login confirm, activation sample | none |
| `04-notify/telegram/digest.service.ts` `debugSend` | admin format probe | none |
| `account/me.contract.ts`, `me.service.ts`, web `lib/api/me.ts` | `UpdateSubscriptionDto`, `MeSubscription` | `alertsBumps` |
| web `(account)/me/_components/SubscriptionEditor.tsx` | subscription editor in `/me` (English UI) | "bumps" toggle |
| web `SubscriptionCard.tsx`, `SubscriptionList.tsx` | list in `/me` | none (CV badge removed in S7) |
| web `SubscribeCta.tsx`, `(feed)/_components/subscribe/SubscribeCard.tsx` | subscribe button / card | none |
| web `radar/page.tsx`, `radar/[track]/page.tsx` | "радар перевіряє щогодини", "9:30–21:30" | none — still true |
| web `match/_components/MatchStepper.tsx`, `welcome/_components/*/data.tsx` | marketing mentions | none |
| web `privacy/page.tsx` | "vacancy IDs already sent…" | none; reread in S7 |

Renderer strings (`Деталі:`, `Локація:`, `знайдено на`, work-format lines) are hard-coded outside
`telegram-copy.ts`; moving them is an optional tidy-up, not part of this work.

### Other code that reads the old ledger

| reader | moves in |
|---|---|
| `account/me.service.ts` account deletion — must also delete the chat's `chat_notifications` | **S2** |
| `admin/product-analytics/product-analytics.service.ts` — delivery KPIs | S7 |
| `02-enrich/dedup/dedup.service.ts` `sentVacancyIds()` | S7 |

## 10. Code layout

```
apps/etl/src/04-notify/alerts/
  decide.ts                       pure R1–R4 + R3b + bumps toggle
  decide.spec.ts                  table tests (§12)
  alert-candidates.repository.ts  filter → FeedService with a posting-level window → member postings
  alert-ledger.repository.ts      lazy init, claim, undo, sibling lookup
  alerts.service.ts               deliverChat(chatId)
  activities/ workflows/          deliverAlertsActivity, deliverAlertsWorkflow
```

- Matching reuses `FeedService` filters (a new posting-level window param); no second filter
  implementation, no `CandidateMatchService`.
- `deliverAlertsWorkflow` lists chats with an active filter subscription and calls the activity per
  chat in sequence. Activity `startToCloseTimeout 10m`; workflow `workflowExecutionTimeout 50m`.
- Same schedule `tg-digest-daytime` (overlap SKIP) starts one run; chats are split by the flag.
- Flag: `ALERTS_ENGINE=v1|v2`, `ALERTS_V2_CHAT_IDS=<ids>` (canary list, read while the engine is `v1`).
- `POST /digest/run` goes through the same workflow.
- Non-prod guard: outside prod, `TelegramService` refuses chats not in `ALERTS_DEV_CHAT_ALLOWLIST`.

## 11. Steps

One PR per step, green CI, prod stays correct after each. Before every push: `pnpm build:all` +
`git status -- apps libs`. Merge = deploy; the migration runs on deploy.

| step | what | done when | est. |
|---|---|---|---|
| **S1 — schema** | migration + drizzle schema for §6 | deploy green; columns and table exist; nothing changes | 1 h |
| **S2 — engine, unwired** | `decide()` + table tests; candidates + ledger repositories; `alerts.service`; renderer bump line + posting link; lazy init incl. legacy messages; account-deletion cleanup; bumps toggle end to end (DTO → `/me` → `decide()`); non-prod guard; owner approves copy | unit + integration tests in §12 pass | ~1.5 d |
| **S3 — wiring** | workflow + activity + flag split; dual-write; manual trigger through the workflow; deploy with `ALERTS_ENGINE=v1` | deploy green, prod digest unchanged | ~0.5 d |
| **S3.5 — local e2e** | §12 local test with owner + tester-1 | every row of the local table as expected | ~1 d (mostly waiting) |
| **S4 — canary: owner** | `ALERTS_V2_CHAT_IDS=<owner chat>` | 2–3 days: no repeats, bumps sensible, counters sane | 2–3 d |
| **S5 — canary: 3–5 chats** | add the chats the owner picks | 2–3 days: checks clean, nobody blocked the bot | 2–3 d |
| **S6 — everyone** | `ALERTS_ENGINE=v2` | a week of clean checks | 7 d |
| **S7 — delete v1** (S6 + 7 days) | remove `DigestService.deliver`, `matchNew`, `SentNotificationsService`, `notifySubscribersWorkflow`, `POST /subscriptions/cv`, CV subscription matching, the dual-write, the flag, the `/me` CV badge; move product analytics + `dedup.sentVacancyIds` to `chat_notifications`; reread the privacy page | build green, prod unchanged | 0.5 d |
| **S8 — drop tables** (a later release) | drop `sent_notifications`, `digest_deliveries` | — | 0.5 h |

## 12. Testing

### Unit — `decide.spec.ts` (the bulk)

First appearance · bump · two bumps in a row · re-emit with the same date · date backwards · date
null · date in the future · DOU edit < 24h after a send · cross-site copy of a sent posting · sibling
bump after 1 day and after 5 days · same-board re-post (R3b) < 24h and > 24h · bumps off · two
subscriptions, one with bumps off · two subscriptions in one chat · a posting split out of its
position after a send · a posting merged into a notified position after a send.

### Integration — Postgres

- Claim race: two `deliverChat` on one chat in parallel → each card once.
- Lazy init: floor set, ledger copied, CV subscriptions retired, legacy messages queued, zero cards.
- Telegram error → claim undone; timeout → claim kept.
- Account deletion removes the chat's ledger rows.
- 200 matches for one chat → all 200 sent, in order, one audible.

### Local end-to-end (S3.5)

**Safe locally:** the local `.env` runs the dev bot `@mh_solo_bot`, prod runs `@metahuntapp_bot`
(see `compose.override.yaml`); local Temporal has no Cloud key; the non-prod allowlist means
restored real subscribers never get a message.

Setup:

1. Fresh prod copy: `scripts/db-backup.sh` (prod) → `scripts/db-restore.sh` (local). Not
   `backups/prod-20260925.sql.gz` — it predates the dedup rebuild.
2. `.env`: `ALERTS_ENGINE=v2`, `ALERTS_DEV_CHAT_ALLOWLIST=<owner chat>,<tester-1 chat>`.
3. `pnpm docker:dev`.
4. Resume the local schedules `rss-ingest-hourly`, `dedup-sweep`, `tg-digest-daytime`
   (`scripts/temporal-schedules.ts resume`, **local** Temporal). Ingest spends a little on DeepSeek +
   OpenAI embeddings.
5. Log in on `localhost:4000` with both accounts through `@mh_solo_bot`.

Subscriptions:

| chat | subscription | proves |
|---|---|---|
| owner | broad filter (e.g. all Node.js) | volume, no cap, one sound per run |
| owner | narrow filter overlapping it | two subs in one chat → each posting once |
| owner | a third, bumps off | the toggle |
| tester-1 | same broad filter as owner | the ledger is per chat |
| tester-1 | `UPDATE subscriptions SET user_id = NULL` on one of its subs (local DB) | ownerless path + login message |
| tester-1 | a CV subscription inserted locally | retirement + message |

Two ways to get events:

- **Passive (the main check).** Leave it running for a day: real new postings, real bumps, real DOU
  edits, real cross-site copies. Compare Telegram with the ledger.
- **Forced (rare cases, minutes).** Change a row in the **local** DB so it looks as if a source did
  something, then trigger a run:

| case | local change | expected |
|---|---|---|
| bump | `UPDATE vacancies SET published_at = now() WHERE id = <posting sent to owner>` | one card with `↑ піднято` |
| DOU-style edit | same, on a posting sent < 24h ago | nothing; kind `absorbed` |
| bumps off | same, on a posting matched only by the bumps-off sub | nothing |
| cross-site copy | a position with postings on two sources, one sent: bump the other | nothing; kind `collapsed` |
| re-post | same-source sibling of a posting sent > 24h ago | one card with `↑ піднято` |
| double trigger | trigger twice in a row | the second run sends nothing |
| crash | stop etl mid-run, start again | no card twice |
| deletion | delete tester-1 in `/me` | its ledger rows are gone |

Trigger: `curl -X POST -H "Authorization: Bearer $(cat .dev-admin.jwt)" localhost:3333/digest/run`
(`pnpm dev:jwt` first). The first run per chat is lazy init: **legacy messages only, zero cards.**

Compare after each run: `SELECT kind, count(*) FROM chat_notifications WHERE chat_id = … GROUP BY 1`
vs Telegram vs the chat-run log line.

### Prod checks (S4–S6, read-only, daily)

The PK makes a literal duplicate row impossible; these catch the real failure modes:

```sql
-- the same job reached a chat twice as `new` (dedup missed a copy, or a re-post slipped past R3b)
SELECT chat_id, position_id, count(*)
FROM chat_notifications
WHERE kind = 'new' AND notified_at > now() - interval '7 days'
GROUP BY 1, 2 HAVING count(*) > 1;

-- volume and mix per day
SELECT date_trunc('day', notified_at) AS d, kind, count(*)
FROM chat_notifications
WHERE notified_at > now() - interval '7 days'
GROUP BY 1, 2 ORDER BY 1, 2;
```

Plus: the chat-run log lines in Railway, and no new `deactivated_reason = 'blocked'`.

## 13. Rollout and rollback

| step | env (Railway, etl) |
|---|---|
| S3 | `ALERTS_ENGINE=v1` |
| S4 | `+ ALERTS_V2_CHAT_IDS=<owner chat>` |
| S5 | `ALERTS_V2_CHAT_IDS=<owner chat>,<3–5 chats>` |
| S6 | `ALERTS_ENGINE=v2` |

| failure | action | why nothing repeats |
|---|---|---|
| v2 sends wrong things | `ALERTS_ENGINE=v1` / shorten the canary list | v2 dual-wrote `sent_notifications` |
| new code crashes | Railway rollback to the previous deploy | migration is additive; the scheduler restores the v1 workflow on boot; a stuck v2 run dies at 50 min |
| back to v2 after a rollback | first `UPDATE subscriptions SET alerts_floor_at = NULL WHERE chat_id IN (…)` | lazy init re-runs: fresh floor, ledger topped up from v1's sends (legacy messages go out again — acceptable) |

## 14. Who does what

**Owner**

- Approve the three copy drafts in §9 (in the S2 PR).
- Review and merge each PR (merge = deploy; S1 runs the migration on prod).
- Say go for every prod env change in §13 (one message each).
- S3.5: be logged in locally with your account and tester-1, watch both chats for a day, report anything odd.
- S5: pick 3–5 chats for the canary — people who will tell you if something is off.
- S4–S6: read the cards as a user — are bumps useful or noise? DOU edits too loud?

**Claude**

- Write S1–S3, S7, S8 with tests; `pnpm build:all` before each push.
- Run the local setup and the forced cases; post the comparison.
- Run the read-only prod checks daily during S4–S6 and post the numbers.
- Propose the env change for each step; never apply a prod change without the owner's go.

## 15. After release 1

Each option = a column on `subscriptions` + a field in `UpdateSubscriptionDto` + a control in
`SubscriptionEditor.tsx` + a small engine change. The ledger already holds what they need.

| option | how it works | cost |
|---|---|---|
| show cross-site copies | `alerts_copies bool default false`; on → R3 skipped, copies arrive as their own cards | ~2 h |
| settings link on the last card | `⚙ налаштування` → `/me?sub=<id>`; ownerless chats go through the Telegram login, which adopts their subscriptions | ~1 h |
| cadence: as they arrive / twice a day / daily | `alerts_cadence` + `last_delivered_at`; the hourly run skips subscriptions not due; window = `max(24h, cadence + 12h)` | ~1 d (+ what a 100-card daily run looks like) |
| compact mode | one message listing N titles + a feed link, instead of N cards | 0.5–1 d |
| edit the sent card when a copy appears | store `message_id` in the ledger; on R3 edit the card to add "також на DOU" | ~0.5 d |
| faster ticks (paid later) | 10-min tick + per-subscription interval; bounded by hourly ingest | ~1 d |
| parallel chats + global limiter | when one hourly run gets close to the 50-min budget | ~0.5 d |

## 16. Known risks (accepted unless marked)

- **DOU re-dates on text edits.** Edits < 24h apart are absorbed; an edit every few days gives a
  `↑ піднято` card each time. Watch in S4–S5; if noisy, raise R2's window for DOU.
- **A change without a re-date is invisible** (~1/day) — not sent.
- **A bump first seen > 24h after its publish date is missed** (our outage, source lag). Never a repeat.
- **A re-created listing that dedup does not group** arrives as `new` (a subset of ~4% of new postings).
- **A source changes its id format and rows are re-ingested as new** → that day's postings arrive once more.
- **The FK blocks deleting a notified vacancy.** Same as `sent_notifications` today; a cleanup must remap first.
- **The ledger outlives `/stop` and unsubscribe** (re-subscribing never repeats); deleted with the account.
- **Chats run in sequence.** At ~30 chats × ≤ 40 s it fits the hour; revisit with growth (§15).
- **Check in S2:** a bump keeps `vacancy_id`, updates `published_at` and resets `deduplicated_at`
  (the loader code says so — confirm with a test on real rows).

## Open

- Final wording of the three copy keys — owner, in S2.
- Which 3–5 chats join the canary — owner, before S5.
- What a daily-cadence run looks like with 100+ cards — with the cadence option, after release 1.

## Evidence (prod, read-only, 2026-09-28)

Market behaviour, last 30 days, per day:

| source | new postings | re-dated, same text | re-dated, edited | silent edit |
|---|---|---|---|---|
| Djinni | 69 | 33 | 29 | 1 |
| DOU | 51 | 2 | 32 | 1 |

- Gap between consecutive publish dates of a re-dated posting: Djinni p10 7 d / p50 15 d / p90 48 d;
  DOU p50 35 d, with 42 re-dates < 1 d in 30 d (text edits) → the 24 h absorb rule.
- Re-created listings (new `external_id`, same board + company + title within 45 d): 128 in 30 d
  (~4% of new postings).
- New postings in 14 d: 1215 first in their position, 138 extra same-board copies, 195 cross-board
  copies → ~22% of postings are another copy of a job.
- Ledger repeats: 983 sends went to a chat that already had another posting of the (now) same
  position, only 3 of them after the 2026-09-26 dedup rebuild. Company + title repeats: 816, of which
  88% had a null company — not a usable identity key.
- Per-chat volume (30 d): median 6 messages/day, p90 26, max 78 (= the 6 × 13 cap); audible runs
  p90 10/day.

Subscriber-level numbers stay in `.private/analysis/2026-09-28-alerts-measurements.md`.

