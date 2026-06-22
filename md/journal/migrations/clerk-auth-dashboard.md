## clerk-auth-dashboard — Clerk auth on the operator UI

**Branch:** `feat/clerk-auth-dashboard`
**Status:** in-progress
**Started:** 2026-05-25 · **Closed:** —

## Outcome

*(fill in when closing)*

## Scope

Close the auth gap on the operator UI (the entire `app/(investigation)` route group). Landing pages stay public. Single-operator setup — sign-in is gated via the Clerk Dashboard **Allowlist** (one email), not by a code-side role check. The ETL/Nest API itself stays unauthenticated; Clerk only fronts the Next.js operator pages.

## Subtasks

- [ ] T0 — Install `@clerk/nextjs` in `apps/web` via `clerk init` — *done when:* `apps/web/package.json` lists `@clerk/nextjs` and `pnpm-lock.yaml` updated.
- [ ] T1 — Wrap `<ClerkProvider>` around the root layout body — *done when:* `apps/web/app/layout.tsx` renders `<ClerkProvider>{children}</ClerkProvider>` inside `<body>`.
- [ ] T2 — Add `apps/web/proxy.ts` with `clerkMiddleware` + `createRouteMatcher` protecting `/dashboard(.*)`, `/sources(.*)`, `/vacancies(.*)`, `/unique-vacancies(.*)`, `/taxonomy(.*)`. Matcher includes `/(api|trpc)(.*)` and `/__clerk/(.*)` — *done when:* unauthenticated request to `/dashboard` redirects to sign-in; `/` still renders.
- [ ] T3 — Add `<UserButton />` to the operator Sidebar footer so the signed-in user has a clear sign-out control — *done when:* visible on `/dashboard` for a signed-in user.
- [ ] T4 — Write `apps/web/.env.example` with `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` + `CLERK_SECRET_KEY` placeholders — *done when:* file present, `apps/web/.env.local` gitignored.
- [ ] T5 — Runbook `md/runbook/clerk-auth.md`: first-time setup (create app, enable allowlist, add operator email, paste keys, start dev server) — *done when:* file present.
- [ ] T6 — Update `md/architecture/overview.md` — note the new `(investigation)` auth boundary; remove the matching gap entry — *done when:* snapshot reflects reality.
- [ ] T7 — Verify: `pnpm lint:web && pnpm build:web && clerk doctor` clean — *done when:* all three pass.

## Decisions

- **Why Clerk Allowlist vs a code-side email check.** Single-operator project; Clerk's Dashboard allowlist is the smallest moving part. No `if (email !== ALLOWED)` scattered through the codebase, no extra env to rotate, no DB column. Trade-off: switching operator requires a dashboard edit instead of a deploy — acceptable.
- **Why `proxy.ts`, not `middleware.ts`.** Next.js 16.2.3 (see `apps/web/package.json`). Per Next.js 16 and Clerk docs, the convention is `proxy.ts` at the project root.
- **Why protect the whole `(investigation)` group, not just `/dashboard/*`.** Sidebar labels itself "operator" and the architecture snapshot flags `/admin/taxonomy/*` as an unauthorized gap. One matcher covers the whole operator surface in one go; promoting some pages to public later is a one-line matcher change.
- **Why no custom `/sign-in` page.** "Max basic" — Clerk's hosted Account Portal handles sign-in. Custom branded pages can come later as a separate ADR if needed.

## Links

- ADRs: [0005-vercel-for-frontend](../decisions/0005-vercel-for-frontend.md) (deploy target)
- Releases: *(add when shipped)*
- PR: *(add when opened)*
