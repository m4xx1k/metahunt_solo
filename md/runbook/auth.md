# Auth — setup + operations

Two ways in: **Telegram** (also the delivery channel) and **Google**. Both are
rows in `auth_identities` against one `users` row, and both end the same way —
the backend mints its **own** session JWT and every later request is authed by
that, not by the provider. Adding a third provider changes nothing else.

## Telegram

The only path is a **bot deep link** — the browser never talks to Telegram at
all. The backend mints its **own** session JWT, and every later request is
authed by that JWT (Bearer, `Authorization` header), not by Telegram. The same
session carries an env-driven `admin` role for operator APIs.
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

**Known gap — ID tokens carry no nonce.** A captured Google credential is
replayable for its ~1h life, and `POST /auth/link/google` makes that worse than
plain session theft: an attacker who obtains a live token for an unlinked
address can attach it to _their_ account, after which the victim's own Google
sign-in resolves there. Closing it means a server-issued single-use nonce
threaded through `initialize()`. Not built — tracked on MET-45.

**Known residual — consent phishing.** An attacker who starts the flow holds the
code, so they can send "confirm your account, your code is K7QM" and the bot will
echo a matching code. The code defeats _accidental_ confirmation, not a prepared
story; this is the RFC 8628 §5.2 weakness, structural to every device-code flow.
Closing it further means putting non-forgeable context in the prompt (browser
family, approximate location, start time). Not built — revisit if abused.

## One-time bring-up

1. **Backend env** (`@metahunt/etl`, Railway):
   - `TELEGRAM_BOT_TOKEN` — already set (the digest bot).
   - `JWT_SECRET` — **required in production** (signs session tokens). Any long
     random string. Non-prod falls back to an insecure default so local/CI boot.
   - `ADMIN_TELEGRAM_IDS` — comma-separated Telegram **user ids** granted `admin`
     at login (e.g. your own id). Empty = no admins.
2. **Web env** (`@metahunt/web`, Vercel + `apps/web/.env.local`):
   - `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` — the bot's @username **without the `@`**.
     Prod and preview: `metahuntapp_bot`. Local `.env.local`: `mh_solo_bot` (the
     dev bot). Builds the deep link. **Unset = Telegram login is disabled**. It is
     `NEXT_PUBLIC_*`, so it is baked at build time — changing it needs a redeploy,
     not a restart.
   - `NEXT_PUBLIC_TELEGRAM_BOT_ID` is obsolete and unused; remove it from old
     Vercel environments when convenient.
3. **Migrations:** `0027_amused_vermin.sql` adds `auth_identities`, `user_cvs`,
   `users.roles`, `subscriptions.user_id` and makes `users.email` nullable.
   `0028_far_chronomancer.sql` makes account-owned subscriptions and their sent
   history cascade on deletion. `0032_greedy_shiva.sql` adds
   `telegram_login_requests` (the deep-link handshake); `0035_safe_auth_linking.sql`
   adds its authenticated link mode. Applied by the Railway pre-deploy migrate
   step (`libs/database/migrate.ts`).

## Local dev

The deep-link flow **works on `http://localhost`** — no tunnel, no `/setdomain`.
Set `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`, run the API so the bot polls, and log in
against the real bot from a local browser.

## Google

`POST /auth/google` takes the ID token Google Identity Services hands the
browser. `google-auth-library` checks its RS256 signature against Google's
published keys, the issuer, the expiry, and that `aud` is our client id — that
last one is what stops a token minted for some other site being replayed here.
No client secret exists in this flow; nothing is exchanged with Google
server-side.

**Bring-up.** Google Cloud Console → Auth Platform → _Branding_: External
audience, scopes `openid`/`email`/`profile` only. Those are non-sensitive, so
publishing is immediate — no verification review. Then _Clients_ → **Web
application** → Authorized JavaScript origins `http://localhost:4000`,
`https://www.metahunt.app`, `https://metahunt.app`. No redirect URIs. Put the
client id in `GOOGLE_CLIENT_ID` (Railway) and `NEXT_PUBLIC_GOOGLE_CLIENT_ID`
(Vercel + `apps/web/.env.local`). Empty on the API → `/auth/google` 503s; empty
on the web → the button does not render. The two values must be the **same Web
client ID**, and every origin is exact (scheme + host + port; no path or trailing
slash). Changing the API env needs a service restart; changing the web env needs
a new web build/deploy.

**Email adoption.** On sign-in, a _verified_ email that matches a `users` row
**with no identity of any kind** adopts that row instead of creating a second
account. The "no identity" part is the whole safety argument: a row with an
identity has a real owner, and letting an email reach it would hand the account
to whoever controls that mailbox at the provider — a Workspace address gets
reassigned and the successor inherits the CV, the subscriptions and the roles.
Provider emails therefore live on `auth_identities.email`, never on `users`, so
`users.email` keeps meaning exactly one thing: a waitlist signup. Emails are
lowercased on both sides, since waitlist rows are stored that way and Postgres
comparison is case-sensitive.

**Roles are recomputed, never granted.** `syncRoles` derives them from the
account's _current_ Telegram identities on every session mint and every
link/unlink. Granting without a matching revoke was the bug this replaced: an
admin who linked Google and unlinked Telegram would have kept `admin` forever,
with no id left in `ADMIN_TELEGRAM_IDS` to remove.

**Button styling.** GIS does not allow a custom trigger for the ID-token flow —
`renderButton` draws Google's own button in an iframe. We use the black square
variant. One Tap is deliberately off: under FedCM the browser owns the prompt,
and an unprompted card on a cold first visit is a distraction.

## Linking providers

`POST /auth/link/google`, `POST /auth/link/telegram/start` and
`DELETE /auth/link/:provider` are JWT-guarded and act on the **caller's**
account. Google linking completes in the request. Telegram linking starts the
same one-time deep-link handshake as login; the browser polls the result and
receives a freshly minted session for the now-linked account.

- An identity already owned by a _different_ account → conflict (**409** for
  Google; `{"status":"conflict"}` from the Telegram poll). Merging two accounts
  is destructive and irreversible; it needs a real merge flow, not a silent
  reassignment. The insert leans on the unique constraint rather than a
  check-then-insert, so two concurrent links resolve to one conflict and not a 500.
- Relinking what you already have is a no-op, not an error.
- Unlinking your **last** identity → **400**, counted by _survivors_ under a row
  lock. Two concurrent unlinks would otherwise each see "two left" and take one
  apiece, and `users` rows are only reachable through `auth_identities` — a
  stranded account is unrecoverable.
- Linking Telegram also refreshes admin membership and claims that chat's
  orphan subscriptions. This is what starts digest delivery for someone who
  signed up with Google; the Bot API private-chat confirmation is the proof.

**What the user is told.** `/me` → _sign-in_ spells out the consequence, because
it is not guessable: both methods sign in to one account, connecting there is
what joins them, and signing in with a method that is not listed creates a
_separate_ account that is not merged automatically. That last clause is the
one people need before they act, not after.

**How often it happens is measured, not assumed.** The 409 is emitted as
`identity_link_conflict` (with `identity_linked` / `identity_unlinked`
alongside), so "one person ended up with two accounts" is a number rather than
a hunch. MET-82 (a merge flow) is deliberately gated on that number: at 5 users
the honest answer is to merge by hand in SQL and see whether it repeats.

Telegram linking uses the deep-link request's `link_user_id`: the guarded start
request binds the attempt to the current account, then the private-chat bot
confirmation attaches that Telegram identity instead of creating an account.

## Roles / admin

- Membership is env-driven and recomputed on **every** session mint and every
  link/unlink: a user is `admin` iff one of the Telegram identities _currently_
  on their account is in `ADMIN_TELEGRAM_IDS`. Promote/demote = edit the var +
  re-login. Roles are persisted on `users.roles` and ride in the JWT.
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

## Claim (what a Telegram login or link adopts)

On login the backend claims only regular subscriptions whose `chat_id` equals
the Telegram user id (private-chat id == user id — set when they tapped
`/start`). CVs are never claimed from browser-provided UUIDs: upload requires
an authenticated account and creates its owner link atomically. See
[`cv-privacy.md`](cv-privacy.md) for deletion and Telegram-delivery rules.

## Verify (end-to-end)

- **Deep link, real bot:** `POST /auth/telegram/start` → open the `t.me` link →
  the bot shows the same 4-char code the response returned → confirm → `POST
/auth/telegram/poll` with `{nonce, pollSecret}` → `{ token, user }`. Polling a
  second time, polling with a wrong `pollSecret`, and polling an unknown nonce
  must all return exactly `{"status":"expired"}` — anything more specific is an
  oracle. Pressing "not me" must make the poll return `expired` too.
- **Telegram link:** sign in with Google → `/me` → _connect Telegram_ → complete
  the same bot confirmation → the polling result contains the existing user id
  and a Telegram identity. A Telegram identity already attached to another user
  returns `{"status":"conflict"}` to the originating browser and attaches
  nothing.
- **Deletion:** `DELETE /me` with the Bearer token → 200; the same token on
  `GET /auth/me` → 401. Full data-boundary checks live in
  [`account-deletion.md`](account-deletion.md).
- **Roles:** a non-admin JWT on `PATCH /admin/taxonomy/nodes/:id/hide` → 403; an
  admin JWT → 200; the public feed with no token → 200.
- **UI:** header `log in ▾` → Telegram deep link → bot confirmation → header flips
  to `@username ▾` → refresh persists (localStorage token) → upload a CV →
  `/me` lists the account-owned CV + subscriptions → pause/delete work → log
  out clears.
