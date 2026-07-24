# Session handoff — 2026-07-24 (START HERE for a new chat)

Previous handoff: [`2026-07-22-session-handoff.md`](./2026-07-22-session-handoff.md) (launch kit,
PRs #95–#108). Launch day 1: [`2026-07-23-reddit-launch-day1.md`](./2026-07-23-reddit-launch-day1.md).

## TL;DR — where we are

`main` tip **`b0227ec`**, CI green, nothing open. Product is live and converting; the
bottleneck is top-of-funnel traffic, not the product. Today's work was **operator tooling +
measurement honesty**, not features.

Two things shipped this session:

1. **PR #116** — the operator console was rebuilt under one guarded `/dashboard/*` subtree.
2. **PR #117** — a measured product-analytics review, plus four new insights on PostHog
   dashboard 841775.

Nothing in the product surface (feed, landings, digest, matching) was touched.

## 1. Operator console (PR #116, `acc8ef7`)

`app/(investigation)` **no longer exists**. Every protected screen is now `app/dashboard/*`:

Iteration 2 (PR #119, `9288be4`) reordered the home around users and made the period switch
authoritative — see the tracker's "Iteration 2" section. Short version: `/dashboard` is
**Users → product → pipeline strip**, every number on it is period-scoped flow (`ProductPeriodFlow`
from `product_events` inside the window), `lastActionAt` counts only `USER_ACTION_EVENTS` (never
our own `digest_sent`), and a new first-touch `channels` table answers "which channel converts"
from our own ledger. All-time subscription state now lives only on Analytics → Identity.

| route | screen |
|---|---|
| `/dashboard` | Overview — users roster first, then product, then a one-line pipeline strip |
| `/dashboard/analytics` | funnel / subscribers / identity / journeys (tabs) |
| `/dashboard/runs` (+ `?tab=failed`), `/dashboard/runs/[id]` | ingest history, failures, run detail |
| `/dashboard/costs` | prompts / models / recent (tabs) |
| `/dashboard/sources`, `/vacancies`, `/dedupe`, `/taxonomy`, `/records/[id]` | data screens |

Old paths (`/product-analytics`, `/sources`, `/taxonomy`, `/vacancies`, `/unique-vacancies`,
`/dashboard/extraction`, `/dashboard/ingests/:id`) are permanent redirects in `next.config.ts`.

**Conventions to follow when adding a console screen** (full detail:
[`migrations/_done/operator-console.md`](./migrations/_done/operator-console.md), rules in
[`FRONTEND.md`](../engineering/FRONTEND.md#ui-patterns)):

- One screen = one concern. `app/dashboard/layout.tsx` owns guard + sidebar + `<main>`; a page
  renders `PageHeader` + `PageBody` and nothing else.
- Compose from the kit, don't re-declare markup: `ui/layout/{PageHeader,PageBody,Panel}`,
  `ui/data/{StatCard,StatGrid,StatRows,MeterRow,DataTable}`, `ui/feedback/EmptyState`,
  `ui/navigation/{UrlTabs,UrlSegments,PanelLink,BackLink}`, `ui/overlay/InfoHint`,
  `ui/inputs/{FilterToggles,UrlSearch}`. Import direct paths (no barrel).
- Long screen → `UrlTabs` panels (`?tab=`, client switch, all panels server-rendered), **not**
  a longer scroll. Anything that changes what the server fetches → `UrlSegments` / `UrlSearch`
  (real `router.replace`).
- Sidebar nav is declared once in `app/dashboard/_components/nav.ts`.
- Console copy is **English**, one hint line per screen, mono uppercase captions.

**Gotchas learned here:**

- eslint `react-hooks/set-state-in-effect` is enforced — derive URL state, never mirror it into
  `useState` inside an effect. `UrlTabs` reads `useSearchParams` directly; `UrlSearch` keeps the
  input uncontrolled and keys it on the committed term.
- Radix `Tabs.List` (in the sticky header) and `Tabs.Content` (in the body) live in different
  subtrees under one `Tabs.Root` wrapping the whole screen — context, so depth is fine.
- The root feed route is an optional catch-all, so an unknown `/dashboard/zzz` is served by the
  *feed* page, not `app/dashboard/not-found.tsx`. The console 404 is what `notFound()` inside a
  console page hits (bad run/record id).
- Verified: `tsc --noEmit`, `eslint`, `next build`, `jest`, `next start` smoke over every
  redirect. **The authed screens were never rendered locally** (no ETL backend, no admin
  session) — first real visual check is prod/preview.

## 2. Product analytics (PR #117, doc: [`md/analysis/2026-07-24-product-analytics-review.md`](../analysis/2026-07-24-product-analytics-review.md))

Queried PostHog 194218 directly, 14-day window. **The funnel is real:**

`landing_view 20 → subscribe_clicked 6 → created 6 → telegram_linked 5 → value_shown 5 →
digest_link_clicked 5` = **25% end-to-end**. Reddit alone: 15 → 5 → 4 = **33%
landing→subscription**. Day 1's "4 visits" undercounted — the post trickled all week.

**Three real problems, in fix order:**

1. **`apply_clicked` is still mostly crawlers.** #111's UA filter helped but didn't close it:
   phantom persons (1 event, 0 pageviews) were 84% of new persons pre-deploy, **69% after**.
   1367 events / 1354 distinct persons over 14d. Every person-level PostHog metric is inflated.
   Fix: `$process_person_profile: false` on the unattributed `apply_clicked` path (one of the two
   emit paths already does this), then a `Sec-Fetch-Mode: navigate` gate + `noindex` on `/go/:id`.
2. **Digests go out 4–8× per chat per day** (peak 7.8; one tail digest `pages: 7,
   vacancies: 297`), and **both `unsubscribed` events landed on a digest hour**. n=2 → hypothesis,
   but the cheapest one to kill: frequency cap (1–2/day or a subscription setting) + items cap.
3. **`chat_unreachable` retries hourly forever** (same chats, every hour on 07-22). Deactivate
   after N consecutive; keep retrying `transient`.

**Instrumentation gaps:** `landing_view` carries no `utm_*`/`$pathname`; `apply_clicked` carries
only `vacancyId` (feed vs digest vs bot not separable in PostHog); `subscription_create_failed`
has still never fired.

**Don't repeat these mistakes:** `$virt_is_bot` / `$virt_traffic_type` classify *every*
`posthog-node` event as `Automation` (including `landing_view`, `telegram_linked`) — useless as a
filter. `$lib='web'` is also wrong (drops legitimate server events). Use the event-vs-person
ratio / single-event-no-pageview heuristic instead. Also: events started on different dates
(`apply_clicked` 07-10, most funnel events 07-22), so keep windows ≤ 30d or "all time" silently
mixes eras.

**Dashboard 841775** gained four insights (it previously had only a 3-step funnel + a signup
trend): real 6-step funnel `CcFEalTq`, channels `Hfew7Krd`, digest load vs churn `wNACrGNM`, bot
gauge `s4kBt1WL`.

## Next actions (ordered)

| # | action | effort | owner note |
|---|---|---|---|
| 1 | `$process_person_profile: false` on unattributed `apply_clicked` | XS | unpoisons all person metrics |
| 2 | `Sec-Fetch-Mode` gate + `noindex` on `/go/:id` | S | stops click inflation at the source |
| 3 | Digest frequency cap + items-per-digest cap | S | only churn signal we have points here |
| 4 | Deactivate after N `chat_unreachable` | S | stops burning sends on dead chats |
| 5 | Add `utm_*`+`path` to `landing_view`; `source`+journey to `apply_clicked` | S | makes channel analysis possible |
| 6 | Verify `subscription_create_failed` fires | XS | last blind spot on signup |
| 7 | Visual pass over `/dashboard/*` in prod | XS | never rendered authed locally (incl. the new Users widget) |
| 7b | Timeout on the `sitemap.ts` tracks fetch | XS | a slow ETL API currently fails Vercel builds (see below) |
| 8 | **Then** buy traffic: DOU forum + UA IT Telegram | — | 33% channel conversion deserves volume |
| — | Gate 0 (5 clean E2E, [`funnel-e2e-test.md`](../runbook/funnel-e2e-test.md)) | — | still open from the audit |

1–2 are measurement hygiene, 3–4 product behaviour, 5–6 instrumentation. None of them touch the
console UI.

## Constraints / repo facts worth carrying over

- **Untracked on purpose — do not commit:** `apps/web/app/{icon,apple-icon}.png` (parked favicon
  work), `md/analysis/2026-07-22-*`, `md/analysis/2026-07-23-reddit-draft.md`,
  `md/journal/2026-07-23-reddit-launch-day1.md`, `md/journal/migrations/filter-registry.md`.
- Branch per task (`<type>/<slug>`), PR, CI green, then squash-merge. **Never
  `--delete-branch` a PR that is another stacked PR's base** (cost us a reopen on #113).
- The operator dashboard reads **our own Postgres** (`product_events` / `analytics_journeys`);
  PostHog is a secondary write-only sink. Two different sources of truth — don't cross them.
- PostHog prod project is **194218**; `194189` is local/dev.
- Never call `cookies()`/`headers()` from a path reachable inside `unstable_cache()` (that was
  the #110 prod-down).
- **`app/sitemap.ts` can fail a whole Vercel build.** Seen on this session's docs-only PR #118:
  `/sitemap.xml` timed out (>60s × 3 attempts) → `Export encountered an error` → deployment
  `● Error`, while every GitHub check passed and prod stayed healthy (`/`, `/sitemap.xml`,
  `/dashboard` all fine, deployed 3h earlier). The route already has a try/catch fallback, but
  a catch can't rescue a *hang*: `tracksApi.get()` has no timeout, so a slow-but-connecting ETL
  API blocks past Next's 60s export limit. Fix is one line — pass
  `{ signal: AbortSignal.timeout(5_000) }` through to that fetch so a slow API lands in the
  existing `catch` instead of killing the build. Until then, a failed Vercel build on an
  unrelated PR is probably this, not your change — retry it.
