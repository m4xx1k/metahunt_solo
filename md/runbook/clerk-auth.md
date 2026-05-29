# Clerk auth — first-time operator setup

The operator UI (everything under `app/(investigation)/` — `/dashboard`, `/sources`, `/vacancies`, `/unique-vacancies`, `/taxonomy`) is gated by Clerk. Landing pages stay public. Wired in [`clerk-auth-dashboard`](../journal/migrations/clerk-auth-dashboard.md).

## One-time bring-up

1. **Create the Clerk app** at https://dashboard.clerk.com (or use the pre-provisioned one if you already have it).
2. **Restrict who can sign in.** Dashboard → **User & authentication → Restrictions → Allowlist**. Toggle on, add your operator email (`maxikfabin@gmail.com` for the solo setup). Without this, anyone with the publishable key can register.
3. **Copy keys.** Dashboard → **API keys**. You need:
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (starts `pk_…`)
   - `CLERK_SECRET_KEY` (starts `sk_…`)
4. **Local dev:** paste both into `apps/web/.env.local`. Template lives at `apps/web/.env.example`.
5. **Vercel:** set both as environment variables on the `metahunt-web` project (`Production` + `Preview`). The web build won't fail without them but middleware will throw at request time.

## Daily flow

- `pnpm dev:web` from repo root.
- Open `http://localhost:4000/dashboard` → Clerk's hosted Account Portal redirects you to sign in (email magic-link by default, with the allowlist checked first).
- After sign-in you land on `/dashboard`. Sign-out lives in the `<UserButton />` at the bottom of the operator sidebar.

## Adding another operator

Dashboard → **Allowlist** → add their email. No code change, no deploy.

## What's NOT gated

- The Nest API (`@metahunt/etl`) is still wide open — Clerk only fronts the Next.js operator pages. If you expose the API to the public internet, gate it separately (see the open hardening item in [`rss-schedule-followups.md#a--production-hardening`](../journal/migrations/rss-schedule-followups.md#a--production-hardening)). Today the operator pages call the API via `lib/api/*` from Server Components, so traffic still originates from the trusted Vercel runtime.
- Landing (`/`, `/welcome`) — intentional, that's the public surface.

## Troubleshooting

- **"clerkMiddleware: secret key missing"** at request time → `CLERK_SECRET_KEY` not set on Vercel or in `.env.local`.
- **Redirect loop on `/dashboard`** → publishable key mismatch between client (`NEXT_PUBLIC_*`) and secret. Rotate both from the same Clerk environment.
- **Allowlist rejection looks like a generic error** → check the Clerk Dashboard → **Logs** for the rejected sign-up attempt.
- **`@clerk/shared` postinstall warning** from pnpm (`ERR_PNPM_IGNORED_BUILDS`) → harmless, the postinstall is optional telemetry/build. Approve with `pnpm approve-builds` if you want it gone.
