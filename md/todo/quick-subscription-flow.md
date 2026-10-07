# Feature: Quick Subscription Flow (Job Radar)

> **Branch:** `feat/quick-subscription-flow`  
> **Status:** Code review passed, crutches removed, verified via lint/tests/build, pushed to `origin/feat/quick-subscription-flow`.  
> **Date:** 2026-10-07

---

## 1. Executive Summary

A clean, minimal, brutalist "Job Radar" component implemented on the MetaHunt homepage (`/`) under `FeedHero`, with an interactive preview switch on `/match`.

It solves the onboarding paradox:
- **Before:** Visitors had to navigate heavy feed filters or an obscure `/match` stepper wizard to see what MetaHunt offers.
- **Now:** A visitor can either **drop their CV** for instant autofill or **configure their exact stack in 15 seconds** (Role, Tech Stack, Domain, Exclusions, Work format, Seniority, Experience, English, Perks), see a live count of matching jobs with 0 duplicates, and either scroll straight into the live feed or activate a 1-tap Telegram alert subscription.

---

## 2. Key Commits & History

1. `d021695`: `feat(web): add QuickSubscriptionCard component and integrate preview on /match`
2. `bb8610d`: `feat(web): add minimal brutalist HomeRadarBlock to homepage`
3. `119114d`: `refactor(web): streamline HomeRadarBlock with English copy, MultiSelect, and top CV strip`
4. `26735a4`: `feat(web): add Domain to core radar, add exclude domains/skills, limit MultiSelect height, and fix role selection label`
5. `1544985`: `refactor(web): remove MultiSelect hack, align canonical role taxonomy, and clean obsolete quick-flow code`

---

## 3. Architecture & Code Changes

### A. `HomeRadarBlock.tsx` (`apps/web/features/quick-flow/HomeRadarBlock.tsx`)
- **CV Drop Strip:** Accepts `.pdf` or `.txt`, auto-parses candidate skills, matches target role and seniority via `cvApi.uploadFile`.
- **Core 3-Column Selectors:**
  - `Role` (Backend Developer, Full Stack Developer, DevOps Engineer, etc.)
  - `Tech Stack` (Python, Docker, SQL, AWS, PostgreSQL, Go, etc.)
  - `Domain` (Fintech, DefTech, SaaS, AI, HealthTech, etc.)
- **Collapsible Additional Criteria (`isExtraOpen`):**
  - Exclude Domains (e.g. iGaming, Crypto, Adult)
  - Exclude Skills (e.g. PHP, 1C, WordPress, Ruby)
  - Work Format (Remote, Hybrid, Office)
  - Seniority (Junior, Middle, Senior, Lead)
  - Experience (0–1 yr, 1–2 yrs, 2–3 yrs, 3–5 yrs, 5+ yrs)
  - English level (No English up to Fluent)
  - Employment (Full-time, Part-time, Contract)
  - Perks & Requirements (No test assignment, Military reservation)
- **Zero-Flash Server Hydration:**
  - Receives `roleCatalog`, `skillCatalog`, `domainCatalog` as props directly from `app/(feed)/[[...slug]]/page.tsx`.
  - Safely falls back to client `useQuery` via `facetsApi` if mounted standalone (e.g. on `/match`).
- **Live Match Count:** Calls `vacanciesApi.list({ ...currentFilter, pageSize: 1 })` with 30s stale time.
- **Dual CTAs:**
  - `View in feed`: pushes query params and smooth-scrolls to the feed shell.
  - `Get alerts in Telegram →`: invokes `subscriptionsApi.create()`, redirects to Telegram deep link.

### B. `MultiSelect.tsx` (`apps/web/ui/inputs/MultiSelect.tsx`)
- Generic and domain-agnostic UI primitive.
- All temporary string manipulation hacks (`replace("developer", "engineer")`) removed.
- Added scrollable height constraint: `(showAll || q.length > 0) && "max-h-60 overflow-y-auto pr-1"` to keep large chip pools (1,200+ skills) from expanding the entire viewport.

### C. Dead Code Cleanup
- Deleted redundant prototype file `QuickSubscriptionCard.tsx` (−856 lines).
- Updated `MatchViewSwitcher.tsx` on `/match` to directly embed `<HomeRadarBlock />`.

---

## 4. Taxonomy & Single Source of Truth Rules

- **Database Node IDs:**
  - `backend-developer` (Canonical name: `Backend Developer`)
  - `full-stack-developer` (Canonical name: `Full Stack Developer`)
  - `devops-engineer` (Canonical name: `DevOps Engineer`)
  - `software-engineer` (Canonical name: `Software Engineer`)
  - `qa-engineer` (Canonical name: `QA Engineer`)
  - `frontend-developer` (Canonical name: `Frontend Developer`)
- **Rule:** Never use mock slugs like `backend-engineer` in component state or defaults. Always match the live catalog taxonomy.

---

## 5. Verification Checklist

- [x] `pnpm --filter @metahunt/web lint` (0 errors)
- [x] `pnpm --filter @metahunt/web test` (26 suites / 215 tests pass)
- [x] `pnpm --filter @metahunt/web build` (Full Turbopack production build succeeds)
- [x] Remote branch pushed: `git push -u origin feat/quick-subscription-flow`
