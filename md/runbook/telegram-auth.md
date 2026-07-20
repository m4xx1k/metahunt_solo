# Telegram auth — setup + operations

Consumer login for the public site: **Log in with Telegram** on the header
account menu. The backend verifies Telegram's payload itself (HMAC over the same
`TELEGRAM_BOT_TOKEN` the digest bot uses), then mints its **own** session JWT.
Every later request is authed by that JWT (Bearer, `Authorization` header), not
by Telegram. Clerk still gates the operator *pages* — this is a separate,
parallel system for public users. Login is progressive: the feed stays anonymous;
the menu only converts value at the moment a user wants to save/subscribe.

## One-time bring-up

1. **Register the login domain with @BotFather.** DM `@BotFather` → `/setdomain`
   → pick the bot → send the **public web domain** (the Vercel production domain,
   e.g. `metahunt.io`). The Login Widget / `Telegram.Login.auth` only works on the
   exact registered origin. This does **not** disturb the bot's long-polling or
   commands — it's a separate setting on the same bot.
2. **Backend env** (`@metahunt/etl`, Railway):
   - `TELEGRAM_BOT_TOKEN` — already set (the digest bot); reused for login HMAC.
   - `JWT_SECRET` — **required in production** (signs session tokens). Any long
     random string. Non-prod falls back to an insecure default so local/CI boot.
   - `ADMIN_TELEGRAM_IDS` — comma-separated Telegram **user ids** granted `admin`
     at login (e.g. your own id). Empty = no admins.
3. **Web env** (`@metahunt/web`, Vercel + `apps/web/.env.local`):
   - `NEXT_PUBLIC_TELEGRAM_BOT_ID` — the bot's **numeric** id (the part before `:`
     in `TELEGRAM_BOT_TOKEN`). `Telegram.Login.auth` keys on the id, not @username.
4. **Migration:** `0027_amused_vermin.sql` adds `auth_identities`, `user_cvs`,
   `users.roles`, `subscriptions.user_id` and makes `users.email` nullable. Applied
   by the Railway pre-deploy migrate step (`libs/database/migrate.ts`).

## Local dev gotcha (important)

`Telegram.Login.auth` checks the request origin against the `/setdomain` value, so
**it will not work on `http://localhost`.** Options:

- **Tunnel:** run a tunnel (cloudflared/ngrok) to your local web dev port and set
  that tunnel URL as the login domain — easiest with a **separate dev bot** so you
  don't repoint the production bot's domain.
- **Curl the API directly:** the login endpoint is independently testable — sign a
  payload with the dev bot token and `POST /auth/telegram` (see Verify below). No
  browser/domain needed for the backend half.

## Roles / admin

- Membership is env-driven and re-evaluated on **every** login: a user is `admin`
  iff their telegram id is in `ADMIN_TELEGRAM_IDS`. Promote/demote = edit the var
  + re-login. Roles are persisted on `users.roles` and ride in the JWT.
- **What's admin-gated (API layer):** every operator controller: RSS triggering
  and recovery, loader backfill/cleanup, manual digest delivery, dedup review,
  extraction-cost reporting, raw monitoring, and taxonomy reads/writes. Guarded
  by `@AdminOnly()` (= `JwtAuthGuard` + `RolesGuard` + `@Roles('admin')`).
- The operator web UI needs to forward the same Bearer token for its server-side
  reads. A cookie-backed session remains the intended delivery mechanism; API
  authorization is not relaxed while that web work is pending.

## Claim (what a login adopts)

On login the backend claims only regular subscriptions whose `chat_id` equals
the Telegram user id (private-chat id == user id — set when they tapped
`/start`). CVs are never claimed from browser-provided UUIDs: upload requires
an authenticated account and creates its owner link atomically. See
[`cv-privacy.md`](cv-privacy.md) for deletion and Telegram-delivery rules.

`request_access: 'write'` on the widget also grants the bot permission to
message the user, so digests work without a separate `/start`.

## Verify (end-to-end)

- **Backend, no browser:** forge a payload signed with the dev bot token
  (`hash = HMAC_SHA256(data_check_string, SHA256(botToken))`), `POST /auth/telegram`
  → expect `{ token, user }`; `GET /auth/me` with `Authorization: Bearer <token>`
  → the user; tampered `hash` or `auth_date` older than 24h → 401. `GET
  /me/subscriptions` with no token → 401.
- **Roles:** a non-admin JWT on `PATCH /admin/taxonomy/nodes/:id/hide` → 403; an
  admin JWT → 200; the public feed with no token → 200.
- **UI (on the tunnel domain):** header `log in ▾` → Telegram popup → header flips
  to `@username ▾` → refresh persists (localStorage token) → upload a CV →
  `/me` lists the account-owned CV + subscriptions → pause/delete work → log
  out clears.
