# Telegram auth — setup + operations

Consumer login for the public site: **Log in with Telegram** in the header. The
primary path is a **bot deep link** — the browser never talks to Telegram at all.
The legacy Login Widget survives only as a "use the widget" fallback and will be
removed (MET-5). Either way the backend mints its **own** session JWT, and every
later request is authed by that JWT (Bearer, `Authorization` header), not by
Telegram. The same session carries an env-driven `admin` role for operator APIs.
Login is progressive: the feed stays anonymous; login only converts when a user
wants to save or subscribe.

## Deep-link login (primary path)

```
POST /auth/telegram/start  -> { nonce, pollSecret, verificationCode, startPayload }
browser -> tg://resolve?domain=<bot>&start=login_<nonce>, shows verificationCode
           (t.me/... only as the no-app fallback — it navigates the tab away)
bot     -> /start login_<nonce>  -> shows the code + [confirm] / [not me]
bot     -> callback login:ok:<nonce> -> chat_id is server-trusted -> upsert user
browser -> POST /auth/telegram/poll { nonce, pollSecret } -> { token, user }
```

Three properties hold this up, and all three are load-bearing:

- **`pollSecret` never enters the link.** Only the originating browser can
  collect the session, so observing or forwarding the URL buys nothing.
- **Pressing START authorizes nothing.** The bot only asks. Without the explicit
  confirm step, anyone could post a login link publicly and take over the
  account of whoever tapped it — the standard device-code phishing attack.
- **Confirmation is refused outside a private chat.** `callback_data` is
  client-supplied, so a forged confirm from a group would otherwise mint an
  account keyed on the group id and shared by everyone in it.

Requests are single-use and live 5 minutes; `TelegramLoginGc` sweeps expired rows
hourly.

**The handoff must not navigate the tab.** `tg://resolve` opens the app and
leaves the page where it is, so switching back to the browser lands on the site,
already logged in (the poll fires on `visibilitychange`). A plain `t.me` link
strands the user on Telegram's web page and makes them press Back to return —
it stays only as the fallback for people with no app installed.

**Known residual — consent phishing.** An attacker who starts the flow holds the
code, so they can send "confirm your account, your code is K7QM" and the bot will
echo a matching code. The code defeats *accidental* confirmation, not a prepared
story; this is the RFC 8628 §5.2 weakness, structural to every device-code flow.
Closing it further means putting non-forgeable context in the prompt (browser
family, approximate location, start time). Not built — revisit if abused.

## One-time bring-up

1. **Backend env** (`@metahunt/etl`, Railway):
   - `TELEGRAM_BOT_TOKEN` — already set (the digest bot); also the widget's HMAC key.
   - `JWT_SECRET` — **required in production** (signs session tokens). Any long
     random string. Non-prod falls back to an insecure default so local/CI boot.
   - `ADMIN_TELEGRAM_IDS` — comma-separated Telegram **user ids** granted `admin`
     at login (e.g. your own id). Empty = no admins.
2. **Web env** (`@metahunt/web`, Vercel + `apps/web/.env.local`):
   - `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` — the bot's @username **without the `@`**.
     Prod and preview: `metahuntapp_bot`. Local `.env.local`: `mh_solo_bot` (the
     dev bot). Builds the deep link. **Unset = the primary login button is dead**:
     it fails with a `configuration` toast and no fallback, since the widget lives
     inside the popover that only a successful start opens. It is `NEXT_PUBLIC_*`,
     so it is baked at build time — changing it needs a redeploy, not a restart.
   - `NEXT_PUBLIC_TELEGRAM_BOT_ID` — the bot's **numeric** id (the part before `:`
     in `TELEGRAM_BOT_TOKEN`). Only the legacy widget needs it.
3. **Widget fallback only — register the login domain with @BotFather.** DM
   `@BotFather` → `/setdomain` → pick the bot → send the **public web domain**. The
   widget works only on that exact origin; the deep-link path does not care. This
   does **not** disturb the bot's long-polling or commands.
4. **Migrations:** `0027_amused_vermin.sql` adds `auth_identities`, `user_cvs`,
   `users.roles`, `subscriptions.user_id` and makes `users.email` nullable.
   `0028_far_chronomancer.sql` makes account-owned subscriptions and their sent
   history cascade on deletion. `0032_greedy_shiva.sql` adds
   `telegram_login_requests` (the deep-link handshake). Applied by the Railway
   pre-deploy migrate step (`libs/database/migrate.ts`).

## Local dev

The deep-link flow **works on `http://localhost`** — no tunnel, no `/setdomain`.
Set `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`, run the API so the bot polls, and log in
against the real bot from a local browser.

The widget fallback is the one that still needs a public origin: it checks the
request origin against the `/setdomain` value, so it cannot work on localhost.
To exercise it, tunnel (cloudflared/ngrok) with a **separate dev bot** so you
don't repoint the production bot's domain, or curl `POST /auth/telegram`
directly (see Verify below).

## Roles / admin

- Membership is env-driven and re-evaluated on **every** login: a user is `admin`
  iff their telegram id is in `ADMIN_TELEGRAM_IDS`. Promote/demote = edit the var
  + re-login. Roles are persisted on `users.roles` and ride in the JWT.
- **What's admin-gated (API layer):** every operator controller: RSS triggering
  and recovery, loader backfill/cleanup, manual digest delivery, dedup review,
  extraction-cost reporting, raw monitoring, and taxonomy reads/writes. Guarded
  by `@AdminOnly()` (= `JwtAuthGuard` + `RolesGuard` + `@Roles('admin')`).
- The operator web UI forwards the same Bearer token for its server-side reads
  via a cookie-backed session: on login, `apps/web/features/auth/use-session.ts`
  additionally POSTs the token to `POST /api/session` (a Next Route Handler),
  which sets it as an httpOnly cookie; `apps/web/lib/api/client.ts` reads that
  cookie via `next/headers` on the server and attaches it as the Bearer header.
  Client-side calls still use the localStorage token; the two are independent
  copies kept in sync on login/logout. `(investigation)/layout.tsx` redirects
  home when the cookie is absent, and `(investigation)/error.tsx` catches a
  present-but-invalid/non-admin session instead of an unhandled SSR error.
- The JWT guard reloads account existence and current roles from Postgres on
  every protected request. Deleting an account or removing a persisted admin
  role makes an already-issued token unusable immediately; signature validity
  alone is not sufficient.

## Claim (what a login adopts)

On login the backend claims only regular subscriptions whose `chat_id` equals
the Telegram user id (private-chat id == user id — set when they tapped
`/start`). CVs are never claimed from browser-provided UUIDs: upload requires
an authenticated account and creates its owner link atomically. See
[`cv-privacy.md`](cv-privacy.md) for deletion and Telegram-delivery rules.

`request_access: 'write'` on the widget also grants the bot permission to
message the user, so digests work without a separate `/start`.

## Verify (end-to-end)

- **Deep link, real bot:** `POST /auth/telegram/start` → open the `t.me` link →
  the bot shows the same 4-char code the response returned → confirm → `POST
  /auth/telegram/poll` with `{nonce, pollSecret}` → `{ token, user }`. Polling a
  second time, polling with a wrong `pollSecret`, and polling an unknown nonce
  must all return exactly `{"status":"expired"}` — anything more specific is an
  oracle. Pressing "not me" must make the poll return `expired` too.
- **Backend, no browser:** forge a payload signed with the dev bot token
  (`hash = HMAC_SHA256(data_check_string, SHA256(botToken))`), `POST /auth/telegram`
  → expect `{ token, user }`; `GET /auth/me` with `Authorization: Bearer <token>`
  → the user; tampered `hash` or `auth_date` older than 24h → 401. `GET
  /me/subscriptions` with no token → 401.
- **Deletion:** `DELETE /me` with the Bearer token → 200; the same token on
  `GET /auth/me` → 401. Full data-boundary checks live in
  [`account-deletion.md`](account-deletion.md).
- **Roles:** a non-admin JWT on `PATCH /admin/taxonomy/nodes/:id/hide` → 403; an
  admin JWT → 200; the public feed with no token → 200.
- **UI (on the tunnel domain):** header `log in ▾` → Telegram popup → header flips
  to `@username ▾` → refresh persists (localStorage token) → upload a CV →
  `/me` lists the account-owned CV + subscriptions → pause/delete work → log
  out clears.
