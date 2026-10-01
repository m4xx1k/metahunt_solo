# ADR-0018 — Alerts notify postings, send everything, and bumps are on by default

**Status:** accepted
**Date:** 2026-09-28
**Context (in time):** post-launch; dedup rebuild (ADR-0016) live since 2026-09-26
**Supersedes:** the digest parts of the `tg-notifications` tracker (per-run cap, position-grain anti-join)

## Context

The Telegram digest replays each subscription's feed query hourly (09:30–21:30 Kyiv) over
`positions.first_observed_at`, drops positions that contain an already-sent posting, and sends at
most 6 cards per run. Three things are wrong with it:

- **It hides bumps.** A recruiter re-dating a live listing moves `published_at`, not our load time.
  Measured 2026-09-28 (30 d): Djinni 69 new postings/day vs 62 re-dated, DOU 51 vs 34. Recruiters
  edit and re-date; they rarely re-create (~4% of new postings). The feed already ranks by bump time,
  so the digest disagrees with the feed.
- **"Already sent" depends on dedup.** #210 moved the axis to bump time and was reverted by #211 the
  same night: unmerged copies re-entered as different positions, and its 1-day resend lookback against
  a 14-day candidate window re-sent every bumped listing daily. ADR-0016 also splits an edited posting
  out of its group, which the position-grain anti-join treats as new.
- **The caps lose vacancies.** 6 per run × 13 runs = 78/day is not a Telegram limit (≈1 msg/s per
  chat, ≈30 msg/s global). An all-jobs subscription produces ~200 events/day, so the tail silently
  ages out of the 14-day window.

## Options

### A — Keep position grain, add a job key (company + normalized title) and a daily cap
- ✅ small diff
- ❌ Djinni gives no structured company (and no salary): 88% of title-key repeats in the ledger had a
  null company, so the key merges different anonymous jobs
- ❌ a cap drops what the subscriber asked for

### B — Posting grain with versioned events; dedup only collapses copies; no caps
- ✅ the ledger key `(chat, posting)` is stable forever — regrouping can never cause a repeat
- ✅ a bump is a new version of the same posting, compared by version, not by a time window
- ❌ needs a new ledger table and a backfill; cross-site copies need an explicit collapse rule

## Decision

**Option B.** Match through the Position (filters and CV scoring stay as they are); notify and record
the Posting.

**Terms.** Posting = `(source, external_id)` = a `vacancies` row. Event version `event_at` =
`published_at` (bump axis, default) or `loaded_at` (subscription opted out of bumps).

**Rules, in order, for candidate posting `p` in chat `c`:**

1. **Seen** — ledger `(c, p)` exists and `ledger.event_at ≥ event_at(p)` → skip.
2. **Absorb** — ledger exists, the version is newer, but `c` was notified about `p` < 24 h ago →
   update `event_at`, kind `absorbed`, do not send (DOU re-dates on every text edit).
3. **Collapse** — another posting of `p`'s position is in `c`'s ledger and either `p` is a first
   appearance, or that sibling was notified < 24 h ago → kind `collapsed`, do not send, unless the
   subscription shows copies.
4. **Send** — kind `new` or `bumped`; a bumped card carries `↑ піднято`.

Candidates: postings whose position matches, whose `event_at > max(subscription activation, now − 14 d)`,
and which have passed enrich and the dedup sweep.

**Invariants.**

- **I1 Identity.** The ledger key is `(chat_id, posting_id)` and stores the notified `event_at`. No
  position id is ever a ledger key.
- **I2 One version, once.** A chat receives a given `(posting, event_at)` at most once — across Temporal
  retries and across all of the chat's subscriptions.
- **I3 Everything that matches arrives.** No per-run or per-day cap. Every candidate is sent or recorded
  as `collapsed` / `absorbed`; nothing is dropped silently.
- **I4 Compare versions, not windows.** "Already notified" is `ledger.event_at ≥ event_at(p)`, never
  "sent within the last N days". This makes the #210 failure impossible by construction.
- **I5 Ready first.** A posting is a candidate only after enrich and `deduplicated_at IS NOT NULL`, so
  rule 3 sees its final group.
- **I6 Floor.** Nothing whose event predates the subscription's activation.
- **I7 One sound per run.** The first message of a delivery run notifies; the rest are silent.

**Subscriber controls** (per subscription, in `/me`; every digest ends with a settings link):
bumps on/off (default **on**), cross-site copies collapse/show (default collapse), cadence as they
arrive / twice a day / daily (default as they arrive). A subscription carries a delivery interval,
so a future plan can shorten it without slowing anyone else below today's hourly cadence.

## Consequences

- The digest can be correct while dedup is wrong. A missed merge shows as a visible duplicate; a false
  merge collapses one job, which "show copies" undoes. Rules 2–3 are the only places dedup is read.
- Sending everything needs delivery engineering: page through all matches, send in time-boxed chunks
  (the delivery activity has a 2-minute timeout, and 150 cards take ~3 min), and run chats in parallel
  under a global send limiter.
- The ledger doubles as the decision record: `collapsed` / `absorbed` rows answer "why didn't I get X".
- New sources (ATS) need no alerting change — only a watch on the `collapsed` share.
- Freshness for a faster cadence is bounded by ingest (hourly RSS today), not by the digest tick.
- Rollout plan, measurements, and the refined rules (ledger key, windows, floor) that supersede
  the details above: [`migrations/alerts.md`](../migrations/alerts.md).
