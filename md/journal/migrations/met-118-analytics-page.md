# met-118-analytics-page — one analytics page, PostHog-backed

**Linear:** MET-118 (child of MET-114)
**Status:** spec ready, not started
**Written:** 2026-08-01

Build ONE analytics page: metrics with a working time picker, a traffic-source
filter, and a people table that stitches Postgres identity with PostHog
behaviour. Delete the current multi-tab console.

## Locked decisions

1. **Replace, don't add.** The existing `/dashboard/analytics` (3 tabs, 12
   panels) is deleted. One page takes its place.
2. **Metrics:** DAU / WAU / MAU, an acquisition funnel, traffic sources. **No
   retention** in this task.
3. **Live query.** The backend queries Postgres and PostHog on each render and
   stitches in memory. No sync table, no cron, no new migration.
4. **The ledger stays.** Deleting `product_events` and the 1465-line
   `product-analytics.service.ts` is a separate follow-up task. This task only
   stops *reading* from it in the UI.

## Measured facts that drive the design

Taken from production PostHog over the 30 days to 2026-08-01. Do not re-derive;
these numbers are why the definitions below look unusual.

| Fact | Number | Consequence |
|---|---|---|
| Persons with any event | 3392 | Naive person count is NOT usable as MAU |
| Persons whose ONLY event is `apply_clicked` | **2455 (72%)** | Crawlers hitting the redirect endpoint server-side. Must be excluded |
| Persons with at least one `$pageview` | **478** | This is the real browser population |
| `landing_view` people | 202 | |
| `landing_cta_clicked` people | 20 | Fewer than the people who reached the form — NOT a funnel gate |
| `subscription_create_started` people | 26 | |
| `subscription_handoff_opened` people | 25 | |
| `subscription_created` people | 36 | Exceeds `create_started` — some subs bypass the web form |
| `telegram_linked` people | 31 | The activation anchor |

Two conclusions baked into the spec:

- **Active user must be defined as "has a `$pageview` in the window".**
  `apply_clicked` is emitted server-side by `redirect.controller.ts`, so a
  crawler following an outbound link creates a person without ever running JS.
  Counting raw persons overstates the audience by ~7x.
- **`landing_cta_clicked` must not be a mandatory funnel step.** Only 20 people
  fired it while 26 reached the form, so gating on it would undercount. Show it
  as a standalone number instead.

## Out of scope

- Retention / cohort tables.
- Deleting `product_events`, `analytics-outbox`, or `product-analytics.service.ts`.
- The person-identity resolver (MET-115) — independent, can land before or after.
- Any change to event emission. This task only reads.

## Backend

### Environment

**Do not invent variable names.** `.env.example:65-72` already declares the full
set, added for the `pnpm posthog:founder` script. Reuse them exactly:

| Variable | Value | Already in `.env.example` |
|---|---|---|
| `POSTHOG_PERSONAL_API_KEY` | `phx_...` | yes, empty |
| `POSTHOG_PRIVATE_HOST` | `https://eu.posthog.com` | yes, filled |
| `POSTHOG_PROD_PROJECT_ID` | `194218` | yes, empty |

The existing `POSTHOG_API_KEY` is a `phc_` project ingest key and **cannot**
query — it stays as-is for event capture. `POSTHOG_HOST`
(`https://eu.i.posthog.com`) is the ingest host and is likewise not the query
host; that is why `POSTHOG_PRIVATE_HOST` exists separately.

Verified state on 2026-08-01: Railway `production` / `@metahunt/etl` has only
`POSTHOG_API_KEY` and `POSTHOG_HOST` set. The local `.env` has the same two. The
personal key exists nowhere yet and must be created by the operator.

None of the three are validated in `env.validation.ts` yet — only
`POSTHOG_API_KEY` and `POSTHOG_HOST` are (lines 145-147, 186-187). Add the three
as OPTIONAL. When any is absent the endpoints must return `{ available: false }`
and the page renders an explanatory empty state; the ETL must still boot. Do not
throw on missing keys.

### Conflict to resolve before coding

`.env.example:65` currently labels this block **"operator-only; never set in
runtime services"**. This task deliberately breaks that rule — live per-render
queries require the key inside the ETL runtime. Two consequences, both required:

1. Update that comment in `.env.example` to say the key is now also a runtime
   variable for the analytics page. Leaving a comment that contradicts the code
   is worse than either choice alone.
2. Use a **separate, narrowly-scoped personal key** for the runtime — scopes
   `query:read` and `person:read` only. Do NOT reuse the founder-script key,
   which needs `project/action/dashboard/insight` write scopes. A broad write key
   sitting in a deployed service is the thing to avoid here.

The founder script validates that the key starts with `phx_`
(`scripts/posthog-founder-setup.ts:298`); apply the same check.

### PostHog query client

New file: `apps/etl/src/platform/analytics/posthog-query.client.ts`.

```
POST {POSTHOG_PRIVATE_HOST}/api/projects/{POSTHOG_PROD_PROJECT_ID}/query/
Authorization: Bearer {POSTHOG_PERSONAL_API_KEY}
Content-Type: application/json

{ "query": { "kind": "HogQLQuery", "query": "<sql>" } }
```

The response carries `results` as an array of positional arrays plus `columns`.
Map to objects by column name — do not rely on positional order.

Requirements:

- 10s timeout; on timeout or non-2xx, log and return `null` (never throw into the
  request path — a PostHog outage must not 500 the dashboard).
- In-memory cache keyed by the full SQL string, TTL 60s. A plain `Map` is fine;
  this is a single-operator page.
- Every query MUST carry a `timestamp` bound. Interpolate the window as literals
  (the query API takes no bind params here); the window values come from a fixed
  server-side enum, never from raw user input.

### New module

`apps/etl/src/admin/analytics-page/` — a new folder, deliberately NOT inside the
existing `product-analytics/` (which stays untouched for the follow-up task).

- `analytics-page.module.ts`
- `analytics-page.controller.ts`
- `analytics-page.service.ts`
- `analytics-page.contract.ts`

Guard the controller with the same admin guard the existing
`product-analytics.controller.ts` uses — copy that exact decorator, do not
invent a new auth path.

### Endpoints

Both accept `?period=24h|7d|30d|90d` (default `30d`) and optional
`?source=<referring_domain>`.

**`GET /admin/analytics-page/metrics`**

```ts
{
  available: boolean;          // false when the personal API key is unset
  activeUsers: { dau: number; wau: number; mau: number };
  funnel: Array<{ step: string; label: string; people: number; conversionFromPrev: number | null }>;
  ctaClicks: number;           // landing_cta_clicked people — shown beside the funnel, not inside it
  sources: Array<{ source: string; people: number }>;
}
```

**`GET /admin/analytics-page/people`**

Accepts `?limit=50&offset=0&sort=<col>&dir=asc|desc&q=<search>`.

```ts
{
  total: number;
  rows: Array<{
    personId: string;
    displayName: string;
    hasAccount: boolean;
    providers: string[];            // from auth_identities
    registeredAt: string | null;    // users.created_at
    subscriptions: number;
    activeSubscriptions: number;
    firstSubscriptionAt: string | null;
    telegramLinked: boolean;
    // PostHog side — null when unavailable
    firstEventAt: string | null;
    lastEventAt: string | null;
    pageviews: number | null;
    feedClicks: number | null;
    digestClicks: number | null;
    // derived, null when either side is missing
    minutesToRegistration: number | null;
    minutesToSubscription: number | null;
  }>;
}
```

### HogQL queries

Active users. The `$pageview` filter is the bot exclusion — do not drop it.

```sql
SELECT
    uniqIf(person_id, timestamp >= now() - INTERVAL 1 DAY)  AS dau,
    uniqIf(person_id, timestamp >= now() - INTERVAL 7 DAY)  AS wau,
    uniqIf(person_id, timestamp >= now() - INTERVAL 30 DAY) AS mau
FROM events
WHERE timestamp >= now() - INTERVAL 30 DAY
  AND event = '$pageview'
```

When a time picker other than 30d is active, scale all three windows to fit
inside the selected period and label them accordingly; never query a window
wider than the picker.

Funnel — four steps, counted as distinct people who fired each event within the
window. This is a step-presence funnel, not an ordered one; that is deliberate,
because `subscription_created` can arrive from the bot without a web form.

```sql
SELECT
    uniqIf(person_id, event = '$pageview')                     AS visited,
    uniqIf(person_id, event = 'subscription_create_started')   AS started,
    uniqIf(person_id, event = 'subscription_handoff_opened')   AS handoff,
    uniqIf(person_id, event = 'telegram_linked')               AS linked,
    uniqIf(person_id, event = 'landing_cta_clicked')           AS cta
FROM events
WHERE timestamp >= now() - INTERVAL {N} DAY
```

Traffic sources:

```sql
SELECT
    coalesce(nullIf(properties.$referring_domain, ''), 'direct') AS source,
    uniq(person_id) AS people
FROM events
WHERE timestamp >= now() - INTERVAL {N} DAY
  AND event = '$pageview'
GROUP BY source
ORDER BY people DESC
LIMIT 20
```

When `?source=` is set, add `AND properties.$referring_domain = '<source>'` to
the active-users and funnel queries too — the filter applies to the whole page.

PostHog side of the people table, fetched once for all rows:

```sql
SELECT
    person_id,
    min(timestamp) AS first_event_at,
    max(timestamp) AS last_event_at,
    countIf(event = '$pageview')          AS pageviews,
    countIf(event = 'apply_clicked')      AS feed_clicks,
    countIf(event = 'digest_link_clicked') AS digest_clicks
FROM events
WHERE timestamp >= now() - INTERVAL 180 DAY
  AND person_id IN ({person_ids})
GROUP BY person_id
```

`person_ids` is the page of ids from Postgres, quoted and comma-joined. Cap the
page size at 100 so the `IN` list stays bounded. Note the 180-day window is
deliberately wider than the picker: `firstEventAt` and the time-to-registration
derivation need history older than the selected period.

### Postgres side

Query `users`, `auth_identities`, and `subscriptions`. Two populations must both
appear, so build the roster as a UNION keyed on person id:

- people with an account — key `users.id`;
- Telegram-only subscribers with no account — key `subscriptions.person_id`.

This mirrors the existing `people_raw` CTE in
`product-analytics.service.ts:~215-255`. **Read that CTE before writing this
one** and reuse its shape; it already handles the display-name fallback chain
(`tg_first_name` → `tg_username` → `name`). Do not join through
`product_events` — the new page must not read the ledger at all.

The join key to PostHog is the person id: after login, both
`subscriptions.person_id` and `analytics_journeys.person_id` are set to
`users.id`, and the browser aliases the PostHog person to the same value.

Known limitation to accept, not fix here: a Telegram-only subscriber who never
opened the web app may have several person ids (one per bot-created
subscription), so they can appear as more than one row. That is MET-115's job.
Add a short note in the UI empty-state copy, not a workaround in the SQL.

Derived fields: `minutesToRegistration = users.created_at - firstEventAt`,
`minutesToSubscription = firstSubscriptionAt - firstEventAt`. Both are `null` if
either side is missing, and both must be clamped at `>= 0` — a negative value
means the person id was reassigned by a merge, so render `null`, never a
negative duration.

## Frontend

### Delete

Remove `apps/web/app/dashboard/analytics/_components/` entirely — all 12 panels
(`DeliveryPanel`, `EventsPanel`, `FunnelPanel`, `IdentityPanel`,
`JourneyActions`, `JourneysPanel`, `LeakPanel`, `PeoplePanel`,
`RetentionPanel`, `SubscribersPanel`, `SubscriptionsPopover`, `TalkToPanel`)
and rewrite `apps/web/app/dashboard/analytics/page.tsx`.

**Before deleting, grep each component name across `apps/web`.** Anything
imported from outside this route must be moved to `entities/`, not deleted.
`apps/web/entities/analytics/*` is a separate folder — check its consumers
too, and delete only what becomes unreferenced.

`apps/web/lib/api/product-analytics.ts` is replaced by a new
`apps/web/lib/api/analytics-page.ts`. Delete the old file once nothing imports it.

### Page

`apps/web/app/dashboard/analytics/page.tsx` — server component, `dynamic = "force-dynamic"`.

Layout, top to bottom, single column:

1. **Controls row** — time picker (`24h` / `7d` / `30d` / `90d`) and a source
   dropdown populated from the `sources` response, with an "all sources" option.
2. **Three metric tiles** — DAU, WAU, MAU. Each shows the number and the window
   it covers.
3. **Funnel** — four horizontal bars (visited → started → handoff → linked) with
   the conversion percentage between consecutive steps. The CTA-click number sits
   beside it as a plain stat, explicitly labelled as not a funnel step.
4. **Traffic sources** — a short bar list, top 10, each row clickable to apply
   that source as the page filter.
5. **People table** — the columns from the `people` contract, sortable
   server-side, with a search box and pagination.

Both the time picker and the source filter are URL search params (`?period=`,
`?source=`), read by the server component and passed to the fetchers — the same
pattern the current page already uses for `period`/`population`. Follow it.

Use the existing kit under `apps/web/ui/` (`PageBody`, `PageHeader`,
`UrlSegments`). Do not introduce a chart library — bars are divs with widths.

### Empty and degraded states

- Personal API key unset (`available: false`) — render the Postgres-only columns
  of the people table and a single explanatory line where the metrics go. The
  page must not error.
- PostHog reachable but the window has no data — render zeros, not a spinner.

## Definition of Done

- [ ] `POSTHOG_PERSONAL_API_KEY`, `POSTHOG_PRIVATE_HOST`, `POSTHOG_PROD_PROJECT_ID`
      are validated as OPTIONAL in `env.validation.ts`. No new variable names were
      introduced — all three already exist in `.env.example`.
- [ ] The "operator-only; never set in runtime services" comment at
      `.env.example:65` is updated to match the new runtime usage.
- [ ] The runtime key is a separate `phx_` key scoped to `query:read` +
      `person:read`, not the founder script's write-scoped key.
- [ ] ETL boots with all three unset; both endpoints return `available: false`.
- [ ] `/dashboard/analytics` renders one page with the five blocks above and no tabs.
- [ ] Changing the time picker changes DAU/WAU/MAU, the funnel, AND the sources
      list — verified for all four periods.
- [ ] Selecting a traffic source filters the metric tiles and the funnel, and is
      reflected in the URL.
- [ ] Active-user counts exclude persons without a `$pageview`. Sanity check
      against the recorded numbers: over 30 days MAU should land near **478**,
      NOT near 3392. A number above ~1000 means the bot filter was dropped.
- [ ] Funnel step people counts over 30 days are within a few of: visited 478,
      started 26, handoff 25, linked 31. CTA shows 20 and sits outside the funnel.
- [ ] The people table shows both account holders and Telegram-only subscribers,
      with PostHog columns populated for those who have browser events.
- [ ] `minutesToRegistration` / `minutesToSubscription` render for at least one
      real row, and never render negative.
- [ ] Sorting, search, and pagination on the people table all execute server-side.
- [ ] Nothing under `apps/web/app/dashboard/analytics/` imports
      `lib/api/product-analytics.ts`, and no frontend code reads the ledger.
- [ ] `pnpm lint:web`, `pnpm test:web`, `pnpm test:etl`, `pnpm build:all` pass.
- [ ] Unit tests: the PostHog client maps `columns`/`results` into objects
      correctly, returns `null` on non-2xx, and respects the cache TTL.
- [ ] The derived-duration clamp is unit-tested with a negative input.

## Follow-ups (do not do here)

- MET-115 — person identity resolver; removes the duplicate-row limitation above.
- MET-119 — delete `product_events`, `product-analytics.service.ts`, and its
  controller. After this task they have no consumers, which is what makes that
  deletion safe.
