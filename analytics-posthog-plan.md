# Analytics / PostHog — cross-platform tracking plan

Status: **plan / not started**. Goal: after a social-media launch post, track
**acquisition → activation → retention** across **two surfaces (web + Telegram)** as
**one funnel, one person**.

Companion docs: `tg-notifications-todo.md` (TG mechanics), `weekend-launch-plan.md`
(sequencing + pre-MVP gate). This file = the analytics architecture, done-right.

---

## The one hard problem: one person, two surfaces

PostHog computes retention/funnels **per person**. A person is keyed by `distinct_id`.
All cross-platform complexity reduces to: **web events and Telegram events must land on
the same `distinct_id`.** Solve that → retention, funnels, channel attribution work for free.

### Canonical id = `subscriber_uuid` (NEVER `chat_id`)

We mint our own id and use it on both surfaces. Never use `chat_id` (or email) as the
primary id — it locks us in and leaks PII. `chat_id` / future Clerk id / anon id are all
*aliases/attributes around* `subscriber_uuid`.

> **Why this matters now:** if you ship with `chat_id` as the key, switching to real auth
> later means rewriting identity. With `subscriber_uuid` as the spine, that switch is one
> `posthog.alias()` call (see "Future auth" below). Hard to retrofit → decide pre-MVP.

### The bridge (KISS — no `alias` gymnastics at MVP)

The deep-link token we already need for onboarding **is** the identity bridge:

1. **Web (anon):** `posthog-js` gives every visitor a `distinct_id` (cookie) + auto UTM.
2. **On "Subscribe":** backend mints `subscriber_uuid` (also the PK of the `subscriptions`
   row). Web immediately calls:
   ```ts
   posthog.identify(subscriber_uuid)  // merges the anon person → subscriber_uuid,
                                       // carrying all prior web activity + UTM with it
   ```
3. Same `subscriber_uuid` goes into the deep-link token payload: `t.me/<bot>?start=<token>`.
4. **Bot `/start <token>`:** captures `chat_id`, reads `subscriber_uuid` from the token,
   links `chat_id ↔ subscriber_uuid` in `subscriptions`.
5. **All server-side (TG) events** fire via `posthog-node` with `distinctId: subscriber_uuid`.

→ Same id on both surfaces. No `alias` needed because the id is identical. One person sees
the whole journey: *landed (twitter) → subscribe_clicked → telegram_linked → digest_sent →
digest_link_clicked*.

---

## Web setup (Next 16, app router, React 19)

Stack confirmed: `apps/web` = Next 16 app router, React 19, Clerk installed, `next.config.ts`.
PostHog not yet present.

### 1. Reverse-proxy ingestion (do this first — hard to change later)

Route ingestion through our own origin so ad-blockers don't cut data. Changing `api_host`
*after* launch fragments person history, so set it right on day one.

```ts
// next.config.ts — add rewrites()
async rewrites() {
  return [
    { source: '/ingest/static/:path*', destination: 'https://eu-assets.i.posthog.com/static/:path*' },
    { source: '/ingest/:path*',        destination: 'https://eu.i.posthog.com/:path*' },
  ]
}
// (use us.i.posthog.com if you pick the US cloud — pick region once, it's permanent)
```

### 2. Client provider (client component, guarded against double-init)

```tsx
// app/providers.tsx
'use client'
import posthog from 'posthog-js'
import { PostHogProvider } from 'posthog-js/react'
if (typeof window !== 'undefined' && !posthog.__loaded) {
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
    api_host: '/ingest',
    capture_pageview: false,   // app router → we capture manually (see #3)
    capture_pageleave: true,
  })
}
export const PHProvider = ({ children }) => <PostHogProvider client={posthog}>{children}</PostHogProvider>
```
Wrap `app/layout.tsx`'s body in `<PHProvider>`.

### 3. Manual pageviews (app-router gotcha)

Client-side navigation doesn't reload the page, so auto-pageview misses route changes.
A tiny tracker using `usePathname`/`useSearchParams` fixes it — **must be inside `<Suspense>`**
(Next 16 requirement for `useSearchParams`):

```tsx
'use client'
function PageView() {
  const path = usePathname(); const params = useSearchParams()
  useEffect(() => { posthog.capture('$pageview', { $current_url: window.location.href }) },
            [path, params])
  return null
}
// render <Suspense><PageView/></Suspense> inside the provider
```

### 4. Clerk interplay (when real auth lands — not now)

Already have `@clerk/nextjs`. When auth ships, call `posthog.identify(clerkUserId)` after
login. Until then, `subscriber_uuid` is the spine.

---

## Server setup (`apps/etl`, NestJS + Temporal)

`posthog-node` is queue/batch based — fine inside short-lived Temporal activities, **but
activities can be killed before the queue flushes**. So:

- Single shared client (Nest provider), `flushAt`/`flushInterval` low.
- **`await client.flush()` at the end of every activity that captures** (or use a wrapper).
  Otherwise digest events silently vanish. This is the #1 server-side footgun.
- `await client.shutdown()` on app teardown.

```ts
// fire from sendDigest activity, then flush
posthog.capture({ distinctId: subscriber_uuid, event: 'digest_sent',
                  properties: { vacancy_count, track_slug } })
await posthog.flush()
```

---

## Event taxonomy (FREEZE before launch — names are forever)

`snake_case`, past-tense-ish, stable. Define required props now so dashboards aren't garbage.

| Event | Surface | Key props | Fires when |
|---|---|---|---|
| `$pageview` | web | (auto) `$current_url`, UTM | every route |
| `subscribe_clicked` | web | `track_slug`, filter facets | user hits Subscribe |
| `subscription_created` | server | `subscriber_uuid`, `params` | backend persists sub |
| `telegram_linked` | server (bot) | `subscriber_uuid` | `/start <token>` succeeds |
| `digest_sent` | server | `vacancy_count`, `track_slug` | `sendDigest` activity |
| `digest_link_clicked` | server (`/r`) | `vacancy_id` | user clicks vacancy in TG digest |
| `unsubscribed` | server (bot) | — | `/stop` |

Rule: **one verb, one surface noun.** Don't invent variants later without adding a row here.

---

## Acquisition attribution (the social post)

PostHog auto-captures `utm_*` into person initial-properties. So the launch link is just:

```
https://<domain>/?utm_source=twitter&utm_medium=social&utm_campaign=launch_2026_06
```

Freeze a UTM convention (one `utm_campaign` value per post) so channels stay comparable.
**TG-direct acquisition** (post links straight to the bot, skipping web): encode it in the
deep link `t.me/<bot>?start=src_twitter`; `/start` reads the payload → `subscription_created`
gets `acquisition_source: twitter`.

---

## Retention — closing the TG loop

Telegram messages run no JS, so "user clicked a vacancy from the digest" needs a **redirect
tracker**: digest links point at `/<domain>/r?v=<vacancyId>&s=<subscriber_uuid>` (a Next
route handler or an etl endpoint — etl already has an HTTP server). It fires
`digest_link_clicked` server-side (same `distinct_id`) then 302s to the vacancy.

Without it you measure *delivery* (`digest_sent`), not *engagement* — and engagement IS the
retention signal for a notification product. Since "track retention" is the whole point of
the launch, treat `/r` as **in-MVP, not deferred**.

PostHog insights to build post-launch:
- **Funnel:** `$pageview` → `subscribe_clicked` → `telegram_linked` → `digest_sent` → `digest_link_clicked`
- **Retention:** returning `digest_link_clicked` week-over-week (do subscribers keep engaging?)
- **Channel breakdown:** funnel split by `utm_source` / `acquisition_source`

---

## PII / hygiene (decide pre-MVP)

- `distinct_id` = `subscriber_uuid` only. Never email, never `chat_id`.
- Don't let autocapture slurp tokens/PII from URLs — the deep-link token and `/r` params are
  sensitive-ish; keep them out of `$current_url` on identifying pages, or disable input
  autocapture (`autocapture: { dom_event_allowlist: ['click'] }`) and capture explicitly.
- EU vs US cloud: pick the region once (GDPR → EU likely). Permanent choice.

---

## Future auth (don't paint into a corner)

When Clerk login ships: `posthog.alias(subscriber_uuid → clerkUserId)` once → all prior anon
+ TG events reattach to the Clerk person. This is the *only* reason `subscriber_uuid` must be
the spine today. See `tg-notifications-todo.md` open question on linking `subscriptions` to
the `users` table — same decision: keep `subscriber_uuid` canonical, hang `clerk_id` off it.

---

## Deferred (post-launch, YAGNI)

- Real auth / web subscription-management UI.
- `alias` to Clerk id (only when auth lands).
- Session replay, heatmaps, feature flags, A/B (PostHog has them — turn on later).
- Self-hosted PostHog (cloud free tier covers launch scale by far).
