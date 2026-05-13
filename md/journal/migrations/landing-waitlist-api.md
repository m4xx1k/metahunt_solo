# landing-waitlist-api — own backend for the landing waitlist signup

**Branch:** `feat/landing-waitlist-api` · **Status:** in progress · **Started:** 2026-05-13

## Outcome

Replace the third-party `web3forms.com` signup target on the landing CTA with a first-party endpoint backed by our own `users` table. The CTA now mounts on the homepage (`apps/web/app/(landing)/page.tsx`) in addition to `/welcome`, so every visitor sees the waitlist offer, and every signup lands in Postgres where we can attribute / re-engage later.

Scope is intentionally minimal — just email + source + created_at. No auth, no admin view, no rate limit beyond the DB unique constraint. Those are follow-ups.

## Subtasks

- [x] T1 — `users` Drizzle schema + reexport + migration `0010_petite_meggan.sql` — *done when:* `pnpm --filter @metahunt/database build` succeeds and `pnpm db:generate` emits no further diff.
- [x] T2 — `UsersModule`: `users.contract.ts`, `users.service.ts` (idempotent `INSERT … ON CONFLICT DO NOTHING RETURNING`), `users.controller.ts` (`POST /users/subscribe`), wired into `AppModule` — *done when:* `pnpm --filter @metahunt/etl build` succeeds.
- [x] T3 — Service + controller specs covering happy path, duplicate (`already_subscribed`), missing email, malformed email, length cap, unknown source — *done when:* `pnpm --filter @metahunt/etl test` passes 27/27 suites.
- [x] T4 — Web side: `lib/api/users.ts` typed fetcher; `FinalCTAForm.tsx` rewritten to call `usersApi.subscribe` (web3forms hidden inputs + `action` removed), localStorage lock key renamed `metahunt:waitlist:email-lock`, tri-state toast (`success` / `info` for `already_subscribed` / `error`) — *done when:* `pnpm build:web` clean.
- [x] T5 — Mount `<FinalCTA />` on `app/(landing)/page.tsx` after `<VacancyList />`; `/welcome` keeps using the same component and so flips to the new backend automatically — *done when:* homepage renders the CTA in `pnpm build:web` output.
- [ ] T6 — Apply migration `0010_petite_meggan.sql` to local + Railway db, smoke-test `POST /users/subscribe` end-to-end (curl + browser).

## Decisions

- **Idempotent signup, not 409.** `INSERT … ON CONFLICT DO NOTHING RETURNING id` plus a `subscribed | already_subscribed` status. Avoids forcing the client to handle a 409 just to render the same toast, and a concurrent retry from the form never produces a 5xx.
- **Email normalized server-side.** `trim().toLowerCase()` happens in the service, not only in the form. The DB unique index is on the lowercased value (we only ever insert lowercase). Form-side normalization stays for the localStorage lock key — clients that bypass the form still get deduped at insert.
- **`source` as plain text, not enum.** A pg enum would require a migration per new signup surface (`pricing-page`, `footer`, partner referrals). Validated by the controller against `ALLOWED_SIGNUP_SOURCES` so we still gate what's accepted.
- **No rate limit in this PR.** DB unique constraint is the baseline. If we see abuse on the open `POST /users/subscribe`, add IP-keyed throttling at the controller — out of scope here.
- **Hand-mirrored types.** `apps/web/lib/api/users.ts` duplicates the contract types from `apps/etl/src/users/users.contract.ts` per ADR-0005 (no shared `libs/contracts/` until the second web consumer).

## Links

- ADRs: none — all decisions small enough to live here.
- Releases: → pending (`md/journal/releases.md` updated on close)
- Supersedes: none
