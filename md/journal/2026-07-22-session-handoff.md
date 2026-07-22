# Session handoff — 2026-07-22 (START HERE for a new chat)

**Read this first**, then `md/runbook/funnel-e2e-test.md`, the auto-memory (`metahunt-product-stage`), and `METAHUNT_AUDIT_AND_NEXT_STEPS.md`. This captures the current stage + everything shipped so a fresh session can continue.

## TL;DR — where we are

MetaHunt is a **live production** job-aggregator: DOU + Djinni → structure with AI → dedup → public feed / CV match → **Telegram digest** → attributed click. Everything is on `main`, prod is healthy, **no open PRs**. This session built the **acquisition + measurement + launch layer**. **The product is engineering-ready; the bottleneck is validation, not code.**

**Immediate next action:** run the E2E funnel test from a clean phone (`md/runbook/funnel-e2e-test.md`, Gate 0), then **post on Reddit r/ukraine_dev → `/radar`** and watch the dashboard. Then DOU → bought posts/bloggers → Telegram Ads (last).

## Launch kit (assets ready)

- **Acquisition landing:** `https://www.metahunt.app/radar` — general **discipline picker** (Backend/Frontend/DevOps/QA/Data…) with **2-level drill-down** into stacks (`/radar/backend` → `backend-node/java/go/…`). Reddit link points here (mixed IT audience). Ukrainian, dark neobrutalist, live 3-card supply proof, `LANDING_VARIANT=radar_${slug}` for per-landing PostHog breakdown.
- **Dedup showcase (for the post):** `https://www.metahunt.app/vacancy/b159a244-532f-4087-97b4-9a49634dcef7` — "Senior BigData Java Developer" reposted **18× → one listing**. Public `/vacancy/[id]` page (full sanitized HTML description, OG metadata).
- **Analytics:** PostHog **prod project = `194218` "metahunt"** (eu.posthog.com) — ⚠️ `194189` "Default project" is **local/dev, do NOT confuse**. Activation dashboard: https://eu.posthog.com/project/194218/dashboard/841775. First-party admin view: `/product-analytics` (tabbed: funnel / subscribers / identity / journeys; per-subscriber with @username + digest-clicks + feed-clicks).
- **Test plan:** `md/runbook/funnel-e2e-test.md` (clean-phone Gate 0, 5× to pass).

## Shipped this session (14 PRs, #95–#108, all merged to prod)

- **#95** first-party analytics ledger (transactional outbox + `product_events` + `analytics_journeys` + `digest_deliveries`, migration `0029`) + admin `/product-analytics`.
- **#96** radar: generalized `/radar/[track]` + `/radar` discipline picker + drill-down + live 3-card proof + polish.
- **#97** dedup digest delivery **per chat** (was per-subscription → a chat with overlapping subs got a job twice).
- **#98** homepage: CV samples → beside ColdRecsTeaser, quiet the "AI processed" disclosure, `beta` badge on CV tab.
- **#99** capture Telegram `tg_username`/`tg_first_name` at `/start` (migration `0030`) + backfill script.
- **#100** per-subscriber activity table.
- **#101** cookie-backed session so operator/SSR pages forward the admin JWT (fixed the `/dashboard` + `/product-analytics` 401).
- **#102** dashboard redesign: tabs, subscriber identity (clickable @username), charts (funnel StackedBar + Donut), mobile-nav fix, honest `joinedAt = created_at`.
- **#103** attribute feed apply-clicks to the browser journey (`?j=` on `/go/:id` → per-journey `apply_clicked`).
- **#104** decouple funnel from mandatory `landing_view` anchor (was undercounting real conversions) + fix mislabeled "events" column.
- **#105** digest retry-hardening (Temporal `maximumAttempts` 3→5 + backoff; rate-limiter retries transient network codes; 403/chat-unreachable stays non-retryable).
- **#106** public `/vacancy/[id]` detail page (+ ETL `GET /feed/vacancy/:id` with description).
- **#107** surface feed clicks in the dashboard (separate column, journey→subscriber rollup only when 1:1).
- **#108** render vacancy description as **sanitized HTML** (sanitize-html) instead of escaped text (fixed "raw HTML" bug).

Also: backfilled the 6 prod subscribers' usernames directly (m4xx1k, elinasaur, oldnum, Лозова Дарина, evanescca, vladius_I).

## Real users so far (prod)

**6 Telegram chats** total (you `466439009=@m4xx1k` + 5 testers/friends: @elinasaur, @oldnum, Лозова Дарина, @evanescca, @vladius_I). ~10 "persons" in PostHog = mostly browser sessions, not 10 humans. Only 1 digest-click so far (yours). **No real launch traffic yet** — that's the whole point of the next step.

## Open items / next actions

1. **Test the funnel E2E** (Gate 0) → then **launch on Reddit**. This is THE next move.
2. **Digest incident (resolved-ish):** the 18:30 UTC run failed 4/4 = a **transient Telegram `ETIMEDOUT`** network blip (NOT a code bug; #95 just made the failure *visible* as durable `pending` rows). #105 hardened retries. The 4 stuck deliveries **self-heal at the next daytime run (09:30 Kyiv / 06:30 UTC)** — **verify that run succeeded**.
3. **Post-launch simplification (owner flagged):** we log the SAME events in BOTH the first-party ledger (`product_events`) AND PostHog — redundant. For this stage PostHog alone suffices. Decide post-launch: drop the ledger, or keep it as source-of-truth + PostHog as exploration. Don't rip out mid-launch.
4. **Vacancy page styling:** the `.vacancy-body` prose CSS was tuned blind (no browser) — eyeball it, tweak if needed.
5. **Housekeeping:** many agent worktrees piled up (`.claude/worktrees/agent-*` + `metahunt-*` dirs) — `git worktree prune` / remove the merged ones.
6. **Deferred features:** CV-match beta is present but higher-friction (needs the file-picker-before-login fix + privacy disclosure before pushing traffic to it). `/welcome` is a lead dead-end (don't send launch traffic).

## Gotchas / constraints (for whoever continues)

- **Next 16.2.3 / React 19.2.4** — non-standard vs training data; consult `node_modules/next/dist/docs/`. **Dark neobrutalist** design system (near-black `#0D0F12`, peach accent `#FFB380`, JetBrains-mono display+labels, zero radius, `shadow-brut` offsets). **Light-FSD** structure (see `apps/web/CLAUDE.md`). **ADR-0005**: web hand-mirrors etl contracts (not a bug).
- **Merges to `main` auto-deploy** (Vercel web + Railway ETL). Railway redeploys briefly restart the ETL → **transient SSR errors on pages that fetch it during the ~40s window** (not a bug; retry after deploy).
- **Prod access:** `scripts/prod-db-url.sh` gives the prod DB URL (read via psql). **Railway MCP token was flaky/unauthorized** this session; the `railway` CLI works. **Prod DB writes are blocked by the safety classifier** unless the user authorizes.
- **Telegram login only works on `metahunt.app`** (domain registered in BotFather) — not localhost/preview. Local admin: tunnel or curl-mint a JWT (`md/runbook/telegram-auth.md`).
- **Two Claude sessions ran in parallel** at points (one added `md/analysis/2026-07-22-market-data-report.md`, `2026-07-22-reddit-post-plan.md`, `md/journal/migrations/filter-registry.md` as untracked files + the digest-incident note in memory). Working tree may be dirty with those untracked files.

## The through-line (don't lose this)

The founder keeps polishing engineering because it's the comfortable zone; the actual bottleneck — from day one and still — is **proving the funnel with real people and then acquiring them**. Every piece to measure and acquire is now built. The next work is not more code; it's the E2E test + the Reddit post + reading the dashboard.
