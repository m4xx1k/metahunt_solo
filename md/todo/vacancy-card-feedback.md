# TODO — Vacancy card: feedback/bait buttons + skill-display changes

Branch: `feat/vacancy-card-feedback`. Two independent changes to the vacancy card,
one PR.

## Why

- **Demand + fit signal, zero backend.** We want to know which vacancies land
  (like/dislike) and whether people want AI helpers (cover letter / CV tuning)
  before building either. Collect it as PostHog events, gated behind a flag so we
  can dark-launch to a cohort / % rollout without a deploy.
- **Skill readability.** On the warm lens the card truncates required skills and
  the nice-to-have chips are almost invisible; a candidate can't see at a glance
  what a role actually demands vs. what they're missing.

---

## Part 1 — Skill display (unconditional, all users)

Files: `apps/web/entities/vacancy/VacancySkills.tsx`, `apps/web/entities/skill/SkillChip.tsx`.

1. **All required skills always visible.** Drop the `REQUIRED_SHOWN` cap for the
   required row — render every required chip. Keep the `OPTIONAL_SHOWN` cap +
   "show all" on the optional row only (`hidden` counts optional overflow only).
2. **Matched nice-to-have → dotted border.** A required skill the candidate has =
   solid green ✓ (unchanged). An **optional** skill the candidate has = green ✓
   but with a **dotted** border, so "bonus you already have" reads differently
   from "required and covered". Add a `dotted?: boolean` prop to `SkillChip`
   (`border-dotted`); `VacancySkills` passes it for matched-optional only.
3. **More visible nice-to-have border.** Bump the `optional` tone border from
   `border-border` (#2A2F38, near-invisible) to `border-border-strong` (#3B424F)
   so unmatched nice-to-haves are legible. Text stays `text-text-secondary`.

Result on the warm lens: required = full row (accent / ✓green / ✗red),
optional = legible (strong border), matched-optional = green dotted.

---

## Part 2 — Feedback + bait buttons (behind PostHog flag `feedback-buttons`)

Flag off by default; when PostHog is dormant (no key) the flag is `undefined` →
renders **off** (safe default). Read on the client via
`useFeatureFlagEnabled("feedback-buttons")` (`posthog-js/react`).

**Placement (Variant B, adjusted):**
- **Bait — top.** `⚡ cover letter` + `✎ tune CV` at the right of the warm fit
  strip (`apps/web/app/(feed)/_components/WarmCard.tsx`). Warm-only (they need a CV).
- **Vote — bottom, inline with the flags.** `▲ / ▼` in the `VacancyCard` footer,
  in the same row as the `test task` / `reservation` flags — via a new
  `feedbackSlot?: ReactNode` prop on `VacancyCard` (entities stay dumb — slot, not
  a feature import). `WarmCard` fills the slot with `<VacancyFeedback>`; the cold
  list passes nothing for v1.

**Components** — new slice `apps/web/features/vacancy-feedback/`:
- `vacancy-feedback.tsx` — the `▲/▼` vote. Self-gates on the flag (returns null
  when off). Optimistic + mutually exclusive; persists per-vacancy sentiment in
  `localStorage` (mirror `lib/hooks/use-saved.ts`) so it stays pressed and isn't
  double-counted. Fires on change only.
- `bait-buttons.tsx` — `⚡ cover letter` (per-vacancy) + `✎ tune CV` (CV-level).
  Self-gates on the flag. Click → capture + `toast` "coming soon — log in with
  Telegram to get it first" (sonner; also feeds the auth funnel). No feature yet.
- (optional) `use-feature-flag.ts` — thin wrapper over `useFeatureFlagEnabled`.

**Analytics** (`apps/web/lib/hooks/use-analytics.ts`, domain methods only):
- `vacancyFeedback(vacancyId, sentiment)` → `capture("vacancy_feedback", {vacancy_id, sentiment, lens})`.
- `baitClick(feature, vacancyId?)` → `capture("bait_click", {feature, vacancy_id})`.
Add both to `ANALYTICS_EVENTS`.

**Feature flag setup:** create `feedback-buttons` in PostHog (boolean, 0% rollout
= off). No env var; the SDK resolves it. Toggle rollout in PostHog to launch.

---

## Out of scope
- Actual cover-letter / CV generation (LLM) — this only measures demand.
- Persisting feedback server-side — PostHog events are enough until the signal
  justifies a table.
- Vote on the cold lens — warm-only for v1 (slot is passed only by WarmCard).

## Verify
- Flag off (default) → card looks exactly as today + the skill-display changes.
- Flag on (PostHog rollout or local override) → bait in the top strip, vote in
  the footer flags row; clicking fires the events (check PostHog); vote persists
  across reload and doesn't double-count.
- `pnpm build:web` green.
