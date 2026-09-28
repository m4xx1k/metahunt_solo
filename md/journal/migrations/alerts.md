# alerts — posting-grain Telegram alerts, no caps, bumps by default

**Branch:** `docs/alerts-system` (design); one branch per phase below
**Status:** planned
**Started:** 2026-09-28 · **Closed:** —

Decision and invariants: [ADR-0018](../decisions/0018-alerts-posting-grain.md). This file is the
rollout plan and the evidence behind it. Supersedes the digest parts of
[`tg-notifications.md`](tg-notifications.md).

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

## Current system (what the phases replace)

- Schedule `tg-digest-daytime`: hourly 09:30–21:30 Kyiv, `notifySubscribersWorkflow`, chats in sequence.
- `SubscriptionMatcherService.matchNew`: feed query with `first_observed_at > floor` and `excludeIds`
  (postings already sent to the chat → their whole position is excluded); 50 candidates.
- `DigestService.deliver`: ≤ 6 cards per run, one card per message, first message audible.
- Ledger: `sent_notifications(subscription_id, vacancy_id)` + `digest_deliveries` envelope for retries.
- Ingest: RSS hourly at :00, 06–22 Kyiv; dedup sweep every 5 min.

## Phases

Each phase ships on its own and leaves the digest correct.

- [ ] **P0 — Send everything.** Remove `MAX_VACANCY_MESSAGES_PER_DIGEST` and the 50-candidate page
      cap (page through all matches). Deliver in time-boxed chunks: the activity returns "more" and
      the workflow loops, or heartbeat + a longer timeout. Run chats in parallel (~10) behind a global
      limiter (≤ 25 msg/s) on top of the per-chat 1.2 s interval and the 429 `retry_after` handling.
      Append a settings link to the last message of every digest. Axis stays `first_observed_at`.
      *Done when:* an int test delivers 200 matches in full, and a retry mid-run sends no duplicate.
- [ ] **P1 — Ledger v2.** New table `chat_notifications(chat_id, posting_id, event_at, notified_at,
      subscription_id, kind)`, PK `(chat_id, posting_id)`, kind ∈ `new|bumped|collapsed|absorbed`.
      Rules 1–3 from ADR-0018. Backfill from `sent_notifications` with `event_at` = the posting's
      current `published_at` (conservative: nothing already sent comes back). Axis switches to
      posting `loaded_at` for everyone — behaviour matches today. Log per chat how many bumped
      postings *would* be sent. *Done when:* int tests cover each invariant — two bumps in a row,
      re-emit with an unchanged date, DOU copy of a sent Djinni posting, dedup split and merge after a
      send, two subscriptions in one chat, a Temporal retry.
- [ ] **P2 — Bumps on by default.** Axis `published_at` for every subscription with bumps on (default).
      `↑ піднято` on the card. Bumps toggle in `/me`. Check the P1 would-send numbers first.
- [ ] **P3 — Remaining controls.** Show cross-site copies; cadence twice a day / daily; both in `/me`.
- [ ] **P4 — Faster cadence.** Tick every 10 min, per-subscription delivery interval (60 min aligned to
      :30 keeps today's behaviour), faster ingest, optionally trigger delivery after the dedup sweep.
- [ ] **P5 — New sources.** No alerting change; watch the `collapsed` share per source.

## Decisions

- **No caps (owner, 2026-09-28).** Everything that matches is sent; loudness is handled by one sound
  per run and by subscriber controls, not by dropping cards.
- **Bumps on by default (owner).** Same as Djinni and as our own feed ordering.
- **Posting grain (owner).** Positions stay the feed's unit; alerts identify postings. Dedup only
  collapses copies.
- **No company-based identity or features for now.** Djinni gives no structured company or salary.

## Open

- Cadence tick granularity and the ingest interval for P4 — decide with P4.
- Whether a collapsed copy later edits the original Telegram message to add the other site's link —
  nice to have, not planned.
