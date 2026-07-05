# TODO — Auth (Telegram Login) + CV-based subscriptions + candidate dashboard

> **Post-flip note (2026-07-05):** the standalone `/reverse-ats` route was removed —
> the CV-match experience is now the **warm lens of the home feed at `/`**
> (`app/(feed)/_components/FeedLensShell.tsx` + `features/cv-match/`). The anonymous
> CV/subscription state already lives in `apps/web/lib/hooks/use-saved.ts`
> (localStorage `metahunt.saved`) — that is the claim seam this auth work hooks into.
> References below to `app/reverse-ats/**` / `ReverseAtsClient` predate the flip;
> read them as "the warm-lens upload flow".

**Target files:**

_Schema (`libs/database/src/schema/`)_
- `users.ts` — evolve waitlist table: keep `email` but make it nullable (waitlist + auth share one `users` row)
- `auth-identities.ts` (new) — `{ userId, provider, providerUserId, secret? }`, one row per login method
- `user-cvs.ts` (new) — `{ userId, candidateId, label, isActive, createdAt }` (ownership link, keeps `candidates` anonymous + content-hashed)
- `subscriptions.ts` — add `userId` (nullable FK, legacy rows keep null); `candidateId` lives inside `params`

_Backend auth (`apps/etl/src/04-notify/.../auth/` — new module, or a top-level `apps/etl/src/auth/`)_
- `auth.controller.ts` (new) — `POST /auth/telegram`, `GET /auth/me`, `POST /auth/logout`
- `auth.service.ts` (new) — Telegram HMAC verify + JWT mint + user/identity upsert + claim
- `jwt-auth.guard.ts` (new) — verifies the app's own session JWT on protected routes
- `apps/etl/src/03-discovery/telegram/subscriptions.contract.ts` — add `candidateId` to `SUBSCRIPTION_PARAM_KEYS`
- `apps/etl/src/03-discovery/telegram/digest.service.ts` — branch `matchNew()`: CV-path vs filter-path
- `apps/etl/src/03-discovery/ranking/ranking.service.ts` — teach `rankByRefs` to accept `excludeIds` + `loadedAfter`
- `apps/etl/src/.../me.controller.ts` (new) — `GET /me/cv`, `DELETE /me/cv/:id`, `GET /me/subscriptions`, `PATCH /me/subscriptions/:id` (pause/resume), `DELETE /me/subscriptions/:id` — all behind `JwtAuthGuard`

_Frontend (`apps/web/`)_
- `lib/api/auth.ts` (new) — `loginTelegram(payload, claim?)`, `me()`, `logout()`
- `lib/hooks/use-session.ts` (new) — client session state from `/auth/me`
- `components/shared/TelegramLoginButton.tsx` (new — tier 2, used on `reverse-ats` + `/me`)
- `components/shared/AuthStatus.tsx` (new — tier 2, header user chip + logout)
- `app/(account)/layout.tsx` (new) — auth guard + account chrome
- `app/(account)/me/page.tsx` (new) — server component, fetches CV + subscriptions
- `app/(account)/me/_components/MyCvPanel.tsx`, `SubscriptionList.tsx`, `SubscriptionCard.tsx`, `CreateSubscriptionButton.tsx` (new — page-private)
- `app/reverse-ats/_components/ReverseAtsClient.tsx` — progressive CTA after upload; stash `candidateId` in `localStorage` for claim
- `lib/api/subscriptions.ts`, `lib/api/cv.ts` — extend with the new `/me/*` endpoints

**Suggested branch:** `feat/auth-cv-subscriptions-mvp`
**Estimated time:** one focused day (~8 h). Schema change required (one migration).

---

## Why this matters now

Today the product has no front door: a user lands on `/reverse-ats`, uploads a CV, sees a ranked feed — and **nothing is saved**. They can't come back to it, can't subscribe to it in Telegram, and there's no identity. The whole funnel ends at a screenshot.

Two things unlock "ready for users":
1. **A durable identity** so the CV + feed survive a refresh and the user can be reached again.
2. **CV-driven subscriptions** so the existing Telegram digest engine sends *relevant* matches (ranked, fit-gated) instead of the current binary "all skills or nothing" filter.

The leverage is that **most of the machinery already exists**:
- CV pipeline already persists `candidates` (content-hashed, idempotent) + resolves skills to taxonomy nodes (`candidate_nodes`).
- The ranking engine (`ranking.rankByRefs`) already does IDF-weighted ranking + fit tiers (STRONG/GOOD/STRETCH) + skill diff.
- The Telegram subscription + digest engine already does deep-link linking, hourly scheduled delivery, dedup via `sent_notifications`, paging, GC.
- `lib/api/{subscriptions,cv,users,ranking}.ts` already exist.

What's missing is the **identity layer** and a **single branch** in the digest to swap `feed.search()` for `ranking.rankByRefs()` when the subscription is CV-based.

**Auth approach (decided):** Telegram Login Widget as MVP login. The backend verifies the widget payload itself via HMAC using `TELEGRAM_BOT_TOKEN` — fully self-verified, no third-party, same token the ETL bot already uses. Telegram is only the *login event*; after verifying, the backend mints its **own** session JWT and every request is authed by a NestJS guard against that JWT. This keeps the door open for email later (see "Future: email" block) without touching the JWT/guard/ownership layer.

**Not** Clerk / Auth0 — same lock-in/MAU-cap category we want to avoid; and Telegram is already our durable identity (the `telegramLinked` PostHog merge already treats it as canonical).

---

## Read first

In order:

1. `apps/etl/src/03-discovery/telegram/subscriptions.service.ts` — `create()`, `linkChat()`, `SUBSCRIPTION_PARAM_KEYS` whitelist. The CV subscription is just a subscription whose `params` carries `candidateId`.
2. `apps/etl/src/03-discovery/telegram/digest.service.ts` — `matchNew()` (lines ~63–81) calls `feed.search({...params, excludeIds, loadedAfter})`. This is the one method that branches.
3. `apps/etl/src/03-discovery/ranking/ranking.service.ts` — `rankByRefs()` (the CTE). You add two WHERE clauses (`excludeIds` anti-join, `loadedAfter` floor) so it matches `feed.search`'s contract.
4. `apps/etl/src/03-discovery/cv/candidate-loader.service.ts` — how a CV becomes a `candidateId` + `candidate_nodes`. Confirms candidates are anonymous + content-hashed (why ownership goes in a separate `user_cvs` link table, not a `userId` column on `candidates`).
5. `libs/database/src/schema/subscriptions.ts` + `users.ts` — existing shapes you're extending.
6. `apps/web/app/reverse-ats/_components/ReverseAtsClient.tsx` — current ephemeral state; where the progressive CTA + `localStorage` claim hook in.
7. `apps/web/CLAUDE.md` — 3-tier component rule (login button + auth status start tier 2 because 2+ pages consume them).

---

## Data model

Keep `candidates` anonymous and shared (same CV text → same row, content-hash dedup stays intact). Ownership is a separate link:

```
users            { id, email?(nullable), createdAt }            -- canonical person
auth_identities  { userId, provider, providerUserId, secret? }  -- one row per login method
                   provider = 'telegram' now; 'email' | 'google' later
user_cvs         { userId, candidateId, label, isActive, createdAt }
subscriptions    { ...existing, userId(nullable) }              -- candidateId lives in params
```

- **Delete CV** = remove the `user_cvs` row (the `candidate` row survives for dedup / other users).
- **Replace / new CV** = new upload → new `candidateId` → new `user_cvs` row, old one `isActive=false`.
- **MVP scope:** one active CV per user, multiple subscriptions from it (different filters / fit thresholds).

---

## User flow (progressive auth → retention)

Login is **not** a gate at the entrance — it appears at the value moment, which removes the "Telegram-only scares people" friction:

```
1. /reverse-ats  →  upload CV  →  ranked feed                 [ANONYMOUS, as today]
                          │
                          ▼
2. CTA "Get new matches for this CV in Telegram"              [VALUE MOMENT]
                          │
                          ▼
3. Telegram Login (1 click)  →  backend HMAC-verifies
   • anonymous candidateId (from localStorage) is claimed onto the user
   • a subscription is created from the CV + current filters
   • login == Telegram, so identity is already unified (no extra /start dance)
                          │
                          ▼
4. /me  →  sees their CV + subscriptions, manages them
                          │
                          ▼
5. RETENTION LOOP:
   Telegram digest ("5 new for your stack") → tap a vacancy →
   back to the site → updated feed → tune subscription → ...
```

**Retention is built into the flow (no separate work):**
- Push already exists — the hourly digest engine; CV subscriptions just make it relevant (STRONG/GOOD only).
- "N new" badge on each subscription card in `/me` — computed from the same `sent_notifications` anti-join.
- One tap from digest → feed — the digest card buttons already link back to the site.
- Progressive: users who don't want Telegram keep using the feed anonymously; conversion isn't blocked.

**Delivery edge case to handle:** Telegram Login gives a `telegram user id` which equals `chatId` for private chats — but the bot can only *send* if the user has opened it at least once. If the first digest 403s, show "open @bot" (one button). Not a blocker; just handle it.

---

## What to build (in this order)

### Phase 0 — Schema (~30 min)
- Add `auth-identities.ts`, `user-cvs.ts`; make `users.email` nullable; add `subscriptions.userId`.
- Add `candidateId` to `SUBSCRIPTION_PARAM_KEYS`.
- One Drizzle migration.

### Phase 1 — Backend auth (~2–3 h)
- `POST /auth/telegram`: verify HMAC (`secret = SHA256(TELEGRAM_BOT_TOKEN)`, recompute `hmac_sha256(data_check_string, secret)`, compare `hash`, reject stale `auth_date`) → upsert `users` + `auth_identities` → mint session JWT → set httpOnly cookie.
- `GET /auth/me`, `POST /auth/logout`.
- `JwtAuthGuard` verifying the app JWT (not Telegram per-request).

### Phase 2 — Ownership + CV subscription (~2–3 h)
- Claim: `POST /auth/telegram` accepts optional `candidateId` (+ pending filters) → create `user_cvs` link + a subscription with `userId` + `chatId`.
- `/me/*` endpoints behind `JwtAuthGuard` (list/delete CV, list/pause/delete subscriptions).
- **Digest branch** (the one core change): in `digest.service.ts` `matchNew()` —
  `if (params.candidateId) → ranking.rankByRefs(candidateNodes, filters, { excludeIds, loadedAfter })` else keep `feed.search()`. Default `minFitTier = GOOD`.
- Teach `rankByRefs` to accept `excludeIds` (anti-join) + `loadedAfter` (floor) — mirror `feed.search`, small CTE patch.

### Phase 3 — Frontend (~2–3 h)
- `TelegramLoginButton` + `AuthStatus` (shared); `lib/api/auth.ts`; `lib/hooks/use-session.ts`.
- `app/(account)/layout.tsx` (guard) + `me/page.tsx` + the four `_components` panels (see dashboard sketch below).
- Progressive CTA on `reverse-ats`: after CV upload, show "Get in Telegram"; stash `candidateId` in `localStorage` for the claim.
- Extend `lib/api/subscriptions.ts` + `cv.ts` with the new endpoints.

### Phase 4 — PostHog + polish (~1 h)
- On login: `identify(userId)` + `alias(anonymous device_id)`; alias the existing `subscription_uuid` link into `userId` so the live funnel doesn't break.
- Empty states, "N new" badge, 403 "open the bot" handling.

**Order rationale:** 0 → 1 → 2 lets the whole backend be curl-tested before any UI exists; 3 → 4 layer the frontend + analytics on a working API.

---

## Dashboard sketch (`/me`)

```
┌─────────────────────────────────────────────────────────────┐
│  metahunt            @maxxik (Telegram)          logout      │  AuthStatus
├─────────────────────────────────────────────────────────────┤
│  MY CV                                                        │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Senior Backend · Python · 6 yr · English B2          │    │
│  │ 18 skills matched   4 unrecognized                   │    │  MyCvPanel
│  │ [ View feed ] [ Replace CV ] [ Delete ]              │    │
│  └─────────────────────────────────────────────────────┘    │
│   (no CV → big dropzone)                                      │
│                                                               │
│  MY SUBSCRIPTIONS                              + new from CV  │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Python Backend · Remote · fit >= GOOD                │    │  SubscriptionCard
│  │    12 new this week · delivered via Telegram          │    │
│  │    [ View ] [ Pause ] [ Delete ]                     │    │
│  └─────────────────────────────────────────────────────┘    │
└───────────────────────────────────────────────────────────────┘
```

---

## Out of scope (next iterations)

- **Email / Google login** — the `auth_identities` table is the seam; adding email = new rows with `provider='email'` + a magic-link token table. JWT, guard, `/me/*`, and CV/subscription ownership all reference `userId` and don't change. Account-linking (same person via TG + email) deferred (start with same-email heuristic).
- **Multiple active CVs** per user — MVP is one active CV.
- **Web-based notifications** (in-app inbox) — Telegram is the only channel for MVP.
