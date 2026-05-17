# TODO — Outbound click tracking MVP (own-it analytics)

**Target files:**
- `libs/database/src/schema/vacancy-clicks.ts` (new)
- `libs/database/migrations/<timestamp>_vacancy_clicks.sql` (new, generated)
- `apps/etl/src/clicks/clicks.module.ts` (new)
- `apps/etl/src/clicks/clicks.controller.ts` (new)
- `apps/etl/src/clicks/clicks.service.ts` (new)
- `apps/etl/src/app.module.ts` (register module)
- `apps/web/lib/api/clicks.ts` (new — exports the redirect URL builder)
- `apps/web/app/(investigation)/vacancies/_components/VacancyCard.tsx` (replace 2 outbound `href`)
- `apps/web/app/(landing)/_components/vacancy-list/PublicVacancyCard.tsx` (replace 1 outbound `href`)
- `apps/etl/src/clicks/clicks.service.spec.ts` (new) — at minimum cover the redirect-or-404 branches

**Suggested branch:** `feat/click-tracking-mvp`
**Estimated time:** one focused session (~2–3 hours including migration + DB seeding)

---

## Why this matters now

Vercel Web Analytics gives us pageviews but **not custom outbound-click events** on the Hobby plan in a useful way (the limits eat through a single viral Threads post), and even if it did, those events live in Vercel's dashboard — not joined to `vacancies`. The single highest-signal analytics question this product can answer is *"which vacancies did people actually click on, joined to source/role/skills/seniority"*, and that question is **only** answerable if we own the click data alongside the vacancy data.

The cheapest way to capture this is a redirect endpoint: replace the outbound `href` on every vacancy card with `<API>/r/:vacancyId`, log the click in Postgres, then 302 to the real link. One table, one endpoint, three UI replacements. Once it ships, every analytics question for the next year ("which sources convert", "CTR by stack", "which filters drive engagement") becomes a `SELECT` away.

Vercel Analytics stays as the pageview baseline — this is additive, not a replacement.

---

## Read first

In order:

1. `apps/etl/src/vacancies/vacancies.service.ts` — pattern for a NestJS module that reads from Postgres via `DRIZZLE` injection. Your service mirrors this shape but inserts and selects one row.
2. `libs/database/src/schema/vacancies.ts` — see how the existing tables are declared (uuid PK with `defaultRandom()`, `timestamp({ withTimezone: true })`, etc). The new table follows the same conventions.
3. `apps/etl/src/app.module.ts` — see how modules are registered. You add `ClicksModule` to the imports array.
4. `apps/web/app/(investigation)/vacancies/_components/VacancyCard.tsx` lines 100 and 274 — the two outbound `href={vacancy.link}` you replace.
5. `apps/web/app/(landing)/_components/vacancy-list/PublicVacancyCard.tsx` line 224 — the public landing card. Same replacement.

**Read but do NOT touch in this session:** `apps/web/app/(investigation)/dashboard/records/[id]/page.tsx` (line 62) and `apps/web/app/(investigation)/_components/RssRecordCard.tsx` (line 130). Those are *operator-facing* links to source RSS records — different intent than a user clicking through to a vacancy. Tracking those is noise, not signal.

---

## What to build (in this order)

### 1. Schema + migration: `vacancy_clicks`

In `libs/database/src/schema/vacancy-clicks.ts`:

```ts
import { pgTable, uuid, timestamp, text, inet } from "drizzle-orm/pg-core";
import { vacancies } from "./vacancies";

export const vacancyClicks = pgTable("vacancy_clicks", {
  id: uuid("id").primaryKey().defaultRandom(),
  vacancyId: uuid("vacancy_id")
    .notNull()
    .references(() => vacancies.id, { onDelete: "cascade" }),
  clickedAt: timestamp("clicked_at", { withTimezone: true }).notNull().defaultNow(),

  // Attribution (all optional — never required for the redirect to succeed)
  referer: text("referer"),
  utmSource: text("utm_source"),
  utmMedium: text("utm_medium"),
  utmCampaign: text("utm_campaign"),

  // Privacy-light fingerprint. NOT raw IP. sha256(ip + daily-rotating salt).
  // Lets us de-dupe identical clicks within a day without persisting PII.
  ipHash: text("ip_hash"),
  userAgent: text("user_agent"),  // raw is fine — it's not PII per GDPR
});
```

Export it from `libs/database/src/schema/index.ts`. Run `pnpm --filter @metahunt/database db:generate` to produce the migration. Eyeball the generated SQL before committing — confirm the FK + the `default now()` came through.

Add **one index** in the migration manually:
```sql
CREATE INDEX vacancy_clicks_vacancy_id_clicked_at_idx
  ON vacancy_clicks (vacancy_id, clicked_at DESC);
```
This is enough for "top vacancies by clicks last N days" and "click timeline per vacancy". Don't add more indexes until a query is slow.

### 2. ETL service + controller: `GET /r/:vacancyId`

`apps/etl/src/clicks/clicks.service.ts`:

```ts
@Injectable()
export class ClicksService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async resolve(vacancyId: string, attribution: {
    referer: string | null;
    utmSource: string | null;
    utmMedium: string | null;
    utmCampaign: string | null;
    ipHash: string | null;
    userAgent: string | null;
  }): Promise<string | null> {
    // Single round-trip via CTE: insert click, return vacancy.link.
    // If vacancy doesn't exist or has null link → returns null → caller 404s.
    const row = await this.db.execute<{ link: string | null }>(sql`
      WITH ins AS (
        INSERT INTO vacancy_clicks (
          vacancy_id, referer, utm_source, utm_medium, utm_campaign, ip_hash, user_agent
        )
        SELECT ${vacancyId}::uuid, ${attribution.referer}, ${attribution.utmSource},
               ${attribution.utmMedium}, ${attribution.utmCampaign},
               ${attribution.ipHash}, ${attribution.userAgent}
        WHERE EXISTS (SELECT 1 FROM vacancies WHERE id = ${vacancyId}::uuid)
        RETURNING vacancy_id
      )
      SELECT v.link
      FROM vacancies v
      WHERE v.id = ${vacancyId}::uuid
    `);
    return row[0]?.link ?? null;
  }
}
```

`apps/etl/src/clicks/clicks.controller.ts`:

```ts
@Controller("r")
export class ClicksController {
  constructor(private readonly clicks: ClicksService) {}

  @Get(":vacancyId")
  @Header("Cache-Control", "no-store")
  async redirect(
    @Param("vacancyId") vacancyId: string,
    @Query("utm_source") utmSource: string | undefined,
    @Query("utm_medium") utmMedium: string | undefined,
    @Query("utm_campaign") utmCampaign: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    if (!isUuid(vacancyId)) throw new BadRequestException("invalid id");

    const ipHash = hashIp(req.ip, dailySalt());  // see "ip salting" below
    const link = await this.clicks.resolve(vacancyId, {
      referer: req.headers.referer ?? null,
      utmSource: utmSource ?? null,
      utmMedium: utmMedium ?? null,
      utmCampaign: utmCampaign ?? null,
      ipHash,
      userAgent: req.headers["user-agent"] ?? null,
    });
    if (!link) throw new NotFoundException("vacancy not found");
    res.redirect(302, link);
  }
}
```

**ip salting.** Use a per-day salt: `sha256(ip + YYYY-MM-DD + ANALYTICS_SALT)`. Daily rotation means we can dedupe clicks within a day but can't correlate users across days. Add `ANALYTICS_SALT` to `apps/etl/.env.example` with a generated value; document it in `md/runbook/`. **Do not commit a real salt.**

### 3. Web: outbound URL builder

`apps/web/lib/api/clicks.ts`:

```ts
export function vacancyOutboundUrl(vacancyId: string, opts?: {
  utmCampaign?: string;
}): string {
  const base = process.env.NEXT_PUBLIC_API_URL!;
  const url = new URL(`/r/${vacancyId}`, base);
  if (opts?.utmCampaign) url.searchParams.set("utm_campaign", opts.utmCampaign);
  return url.toString();
}
```

`NEXT_PUBLIC_API_URL` is already configured (used by `lib/api/vacancies.ts`) — no new env work needed.

### 4. Web: replace outbound hrefs (3 spots)

In each call site:
```tsx
// before
<a href={vacancy.link} target="_blank" rel="noopener noreferrer">…</a>

// after
<a
  href={vacancyOutboundUrl(vacancy.id, { utmCampaign: "vacancy-card" })}
  target="_blank"
  rel="noopener noreferrer"
>…</a>
```

Pass distinct `utmCampaign` per surface (`"vacancy-card"`, `"public-card"`, `"vacancy-sidebar"`) so the data downstream tells you *which UI* drove the click.

**Important:** keep the existing `target="_blank"` and `rel="noopener noreferrer"`. Don't change link semantics.

If `vacancy.link` is `null` in the data, **don't render the link as a redirect** — keep the existing fallback behavior (disabled / hidden). Logging a click for a vacancy with no destination is noise.

### 5. Minimal dashboard query (optional in this session, recommended)

In `apps/web/app/(investigation)/dashboard/page.tsx` (or its data fetcher), add a new KPI:

```sql
-- Top 5 clicked vacancies last 7d
SELECT v.id, v.title, COUNT(c.id)::int AS clicks
FROM vacancy_clicks c
JOIN vacancies v ON v.id = c.vacancy_id
WHERE c.clicked_at > now() - interval '7 days'
GROUP BY v.id, v.title
ORDER BY clicks DESC
LIMIT 5;
```

Render as a small table. This is the screenshot you'll want for the build-in-public post: "here's what people actually clicked on." If it's empty for the first hour after deploy — great, you have a baseline.

---

## How to measure (verification)

```bash
# Migration applied
pnpm --filter @metahunt/database db:migrate
psql $DATABASE_URL -c "\d vacancy_clicks"

# Redirect path (happy)
curl -sI "http://localhost:4567/r/<real-vacancy-id>?utm_campaign=test" | head -5
#   expect: HTTP/1.1 302, Location: <vacancy.link>

# Row landed
psql $DATABASE_URL -c "SELECT vacancy_id, utm_campaign, referer FROM vacancy_clicks ORDER BY clicked_at DESC LIMIT 1;"
#   expect: row with utm_campaign='test'

# Sad paths
curl -sI "http://localhost:4567/r/00000000-0000-0000-0000-000000000000" -w "%{http_code}"
#   expect: 404
curl -sI "http://localhost:4567/r/not-a-uuid" -w "%{http_code}"
#   expect: 400

# UI smoke
pnpm dev
# Click "apply" / source link on a vacancy card → URL bar briefly shows api host → lands on djinni/dou
# psql confirms a new row exists with utm_campaign='vacancy-card'
```

---

## Definition of done

- Migration applied locally; `vacancy_clicks` exists with the FK and the composite index.
- 302 redirect works for a real id; 404 for missing; 400 for malformed.
- Clicking the 3 replaced UI links in the browser produces one row per click with the right `utm_campaign`.
- `ANALYTICS_SALT` documented in `.env.example` and the runbook entry mentions daily salt rotation behavior.
- No regression: `pnpm --filter @metahunt/etl test` and `pnpm --filter @metahunt/web build` are green.
- Tracker added to `md/journal/migrations/click-tracking.md` linking back to this todo and capturing the few followups out of scope (see "Scaling" block).

---

## Things to NOT do

- **Don't** track operator-facing links (RSS records in the dashboard, the about-me page social links). That's not user behavior — it's you clicking around your own admin UI. Pollutes the dataset.
- **Don't** add cookies, `localStorage` IDs, or any session-tying mechanism in this session. The `ip_hash + daily_salt` approach is intentionally privacy-light. Sessions = consent banners = scope creep.
- **Don't** fire `await fetch('/api/click')` from the client *before* navigation. Browsers cancel in-flight requests on `target="_blank"` and unreliably on same-tab navigation. The server-side redirect is what makes capture deterministic.
- **Don't** keep raw IP addresses. Hash + daily salt is the contract. If someone asks for "show me all clicks from this IP" in three months, you should be unable to answer — that's the feature.
- **Don't** replace Vercel Web Analytics. It still gives you pageviews, referrer mix, country breakdown for *free traffic into the site*. This system tracks intent (clicks out). Both are needed.
- **Don't** put a `nginx`/CDN cache in front of `/r/:vacancyId`. The `Cache-Control: no-store` header is non-negotiable; a cached 302 means lost clicks and stale destinations.

---

## Commit format

Two commits, in this order:

```
feat(db): vacancy_clicks table + composite index for click analytics
```

```
feat(clicks): outbound redirect endpoint + UI swap on vacancy cards

- ETL: GET /r/:id logs click and 302s to vacancy.link
- web: vacancyOutboundUrl() helper, swap 3 outbound hrefs to go through the redirect
- daily-rotated ip_hash for de-dupe without retaining PII
```

---

## Scaling — what comes after this MVP

Once raw clicks are landing, the next iterations are:

1. **Page-view tracking from your own backend.** Mirror the click flow for landing-page visits via a `/v` (view) beacon, so visit-to-click funnels are queryable in your own SQL. Don't drop Vercel Analytics — they're still useful for referrer attribution and Core Web Vitals — but having your own copy means you can join visits to filter-state and click-state in one query.

2. **Daily rollup table + retention policy.** `vacancy_clicks` grows linearly; after ~100k rows the dashboard query starts feeling it. Add `vacancy_click_daily(vacancy_id, day, count, distinct_ips)` populated by a Temporal cron (you already have Temporal for ETL — extending it to ops jobs is cheap). Then drop raw rows older than 90 days. The rollup keeps the analytics, the drop keeps the table small + GDPR-friendly.

3. **Funnel analytics.** Once filter applies are also logged (`filter_apply` event from the web side, sent via beacon), you can answer "of users who applied a seniority=SENIOR filter, what % clicked through?" — the most valuable product question once the feed has volume. This needs a new event-table (`user_events` with a polymorphic `event_type`) or a unified `events` table from the start. Decide via ADR before shipping.

4. **Server-side render of click counts on the cards.** "23 people clicked this vacancy this week" is a social-proof signal that drives more clicks. Once the rollup exists, attach `clickCount7d` to the `VacancyDto` and render a small badge. Make sure the count update doesn't bust caches on every click (rollup runs hourly, not realtime).

5. **PostHog (or self-hosted Plausible) on top.** When you need session replays, A/B testing, or funnels-as-a-UI rather than funnels-as-SQL, layer PostHog Cloud free tier in parallel. *Don't* migrate clicks to PostHog — keep clicks in your own DB joined to vacancies. PostHog is for product-analytics UX, your DB is for product intelligence joined to data assets.

6. **Bot filtering.** Right now `vacancy_clicks` will include search-engine crawlers and link-preview bots (Slack, Telegram, Twitter). Once a viral post lands you'll see the spike. Filter via user-agent allowlist at query time first (cheap), then drop at insert time once the patterns are clear.

7. **A "go.metahunt.app" subdomain.** Brief flash of `api.metahunt.app` in the URL bar during redirect is fine for an internal investigation page, slightly worse for the public landing. A dedicated short-link domain (Vercel rewrite to ETL) makes the URL feel intentional. Pure polish — defer until there's a real public surface using outbound links.

The throughline: **own the click data, layer SaaS analytics on top, never replace.** The reason this project gets to make claims about the Ukrainian IT market is that you have data nobody else publishes. Click data joined to vacancy data is a strict superset of what any third-party analytics platform can show you about your own product — give that up at your peril.
