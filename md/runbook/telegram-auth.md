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
- **What's admin-gated (API layer):** the destructive, client-triggered operator
  mutations — taxonomy `verify`/`hide`/`rename`/`merge-into` (`PATCH|POST
  /admin/taxonomy/nodes/*`) and `POST /rss/extract-missing`. Guarded by
  `@AdminOnly()` (= `JwtAuthGuard` + `RolesGuard` + `@Roles('admin')`).
- **Why only mutations, not the operator reads:** operator pages are SSR (server
  components fetch on Vercel), where a browser-localStorage Bearer token can't
  reach — gating the GET reads would break the pages. Mutations run client-side
  (button clicks) and *do* carry the token. So the operator must be **logged in
  via Telegram as admin** for those buttons to work; the pages still render (reads
  ungated) and Clerk still gates page access. Gating the SSR reads is deferred to
  reconciling Clerk↔Telegram-admin into one identity.

## Claim (what a login adopts)

On login the backend claims the user's anonymous artifacts: (a) subscriptions
whose `chat_id` equals the telegram user id (private-chat id == user id — set when
they tapped `/start`); (b) CVs the browser holds in `localStorage`
(`metahunt.saved`), sent as `candidateIds`, linked via `user_cvs`. `request_access:
'write'` on the widget also grants the bot permission to message the user, so
digests work without a separate `/start`.

## Verify (end-to-end)

- **Backend, no browser:** forge a payload signed with the dev bot token
  (`hash = HMAC_SHA256(data_check_string, SHA256(botToken))`), `POST /auth/telegram`
  → expect `{ token, user }`; `GET /auth/me` with `Authorization: Bearer <token>`
  → the user; tampered `hash` or `auth_date` older than 24h → 401. `GET
  /me/subscriptions` with no token → 401.
- **Roles:** a non-admin JWT on `PATCH /admin/taxonomy/nodes/:id/hide` → 403; an
  admin JWT → 200; the public feed with no token → 200.
- **UI (on the tunnel domain):** header `log in ▾` → Telegram popup → header flips
  to `@username ▾` → refresh persists (localStorage token) → `/me` lists the
  claimed CV + subscriptions → pause/delete work → log out clears.
