# Market-Snapshot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the marketing landing on `/` with a public "market snapshot" — hero band (text + total counter + 3-tile widget row: top skills, seniority dist, work-format donut + reservation %) plus a public-styled vacancy list. Old marketing copy moves to `/welcome`. Backend gets `GET /vacancies/aggregates`. Animations land as a separate P2 commit.

**Architecture:** Backend NestJS service runs 4 raw-SQL aggregations against Postgres (mirroring `taxonomy.service.getCoverage()` style). Frontend Next.js 16 page at `/` is a server component that does `Promise.all` of the aggregates fetch + first vacancy page, then renders page-private widgets composed from the existing `components/data/{Donut,Sparkline,StackedBar}` primitives. P2 wraps animations around already-shipped static components using `framer-motion` with `prefers-reduced-motion` respected.

**Tech Stack:** NestJS · Drizzle (raw `sql\`\``) · Postgres · Next.js 16 (App Router, Server Components) · React 19 · Tailwind · framer-motion (P2 only)

**Spec:** [`md/journal/migrations/market-snapshot.md`](../../../md/journal/migrations/market-snapshot.md)

---

## File map

```
apps/etl/src/vacancies/
  vacancies.contract.ts              EDIT  add VacancyAggregatesResponse + sub-types
  vacancies.service.ts               EDIT  add getAggregates() + 4 raw-SQL queries
  vacancies.controller.ts            EDIT  add @Get('aggregates') route

apps/web/lib/api/
  aggregates.ts                      NEW   typed fetcher + types mirror

apps/web/app/(landing)/
  page.tsx                           REWRITE  /  -> snapshot + vacancy list
  welcome/page.tsx                   NEW      old landing moved here
  _components/market-snapshot/
    Snapshot.tsx                     NEW   hero band wrapper (row 1 + row 2 grid)
    TotalCounter.tsx                 NEW   big number + subtitle + status row
    TopSkills.tsx                    NEW   horizontal bars relative to leader
    SeniorityBars.tsx                NEW   vertical histogram
    FormatDonut.tsx                  NEW   donut + reservation stat in same tile
  _components/vacancy-list/
    VacancyList.tsx                  NEW   wraps Pagination + cards
    PublicVacancyCard.tsx            NEW   public-styled card

apps/web/components/shared/
  Header.tsx                         EDIT  no code change if links is already a prop; wire two link arrays from pages
```

---

## Task 1: Add aggregates contract types

**Files:**
- Modify: `apps/etl/src/vacancies/vacancies.contract.ts`

- [ ] **Step 1: Open the contract file and inspect existing types**

Run: `grep -n '^export' apps/etl/src/vacancies/vacancies.contract.ts`
Expect: see `Seniority`, `WorkFormat`, `EmploymentType`, `EnglishLevel`, `EngagementType`, `VacancyDto`, `ListVacanciesResponse`, etc.

- [ ] **Step 2: Append the aggregates response type at end of file**

Append:
```ts
// ─────────────────────── Aggregates endpoint ───────────────────────

export interface AggregateSourceCount {
  id: string;
  code: string;
  displayName: string;
  count: number;
}

export interface AggregateSkillCount {
  id: string;
  name: string;
  count: number;
}

export interface VacancyAggregatesResponse {
  total: number;
  lastSyncAt: string | null;
  sources: AggregateSourceCount[];
  topSkills: AggregateSkillCount[];
  seniorityDist: Record<Seniority, number>;
  workFormatDist: Record<WorkFormat, number>;
  engagementDist: Record<EngagementType, number>;
  reservationKnownCount: number;
  reservationTrueCount: number;
  salaryDisclosedCount: number;
}
```

- [ ] **Step 3: Type-check**

Run: `pnpm --filter @metahunt/etl typecheck`
Expect: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add apps/etl/src/vacancies/vacancies.contract.ts
git commit -m "feat(vacancies): add VacancyAggregatesResponse contract"
```

---

## Task 2: Implement getAggregates() service method

**Files:**
- Modify: `apps/etl/src/vacancies/vacancies.service.ts`

The method runs 4 raw SQL queries via `db.execute(sql\`...\`)` mirroring `taxonomy.service.ts`. Eligibility rule: include only vacancies whose role node is VERIFIED (matches list default `includeRoleless: false`). For skills aggregation, join `vacancy_nodes` and only count nodes where `nodes.type='SKILL' AND nodes.status='VERIFIED'`.

- [ ] **Step 1: Open the service**

Run: `grep -n 'export class VacanciesService\|getAggregates' apps/etl/src/vacancies/vacancies.service.ts`
Expect: see the class declaration but no `getAggregates` yet.

- [ ] **Step 2: Add `sql` import**

Modify the existing `import` from `drizzle-orm` to include `sql`:
```ts
import {
  and, count, desc, eq, ilike, inArray, isNotNull, sql, type SQL,
} from "drizzle-orm";
```

- [ ] **Step 3: Add the import for the new contract types**

Modify the existing `import type` from `./vacancies.contract`:
```ts
import type {
  ListVacanciesResponse,
  NodeRef,
  VacancyDto,
  VacancyAggregatesResponse,
} from "./vacancies.contract";
```

- [ ] **Step 4: Add `getAggregates()` method to VacanciesService**

Add this method inside the class (after `list()`):

```ts
async getAggregates(): Promise<VacancyAggregatesResponse> {
  const ELIGIBLE = sql`
    v.role_node_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM nodes rn WHERE rn.id = v.role_node_id AND rn.status = 'VERIFIED')
  `;

  // 1. Scalars + histograms in a single round-trip via FILTER aggregates.
  const scalarRows = await this.db.execute<{
    total: string;
    last_sync_at: Date | null;

    sen_intern: string; sen_junior: string; sen_middle: string; sen_senior: string;
    sen_lead: string; sen_principal: string; sen_clevel: string;

    wf_remote: string; wf_office: string; wf_hybrid: string;

    eng_product: string; eng_outsource: string; eng_outstaff: string;
    eng_startup: string; eng_agency: string;

    reservation_known: string; reservation_true: string;
    salary_disclosed: string;
  }>(sql`
    SELECT
      COUNT(*)::text                                                                  AS total,
      MAX(v.loaded_at)                                                                AS last_sync_at,

      COUNT(*) FILTER (WHERE v.seniority = 'INTERN')::text                            AS sen_intern,
      COUNT(*) FILTER (WHERE v.seniority = 'JUNIOR')::text                            AS sen_junior,
      COUNT(*) FILTER (WHERE v.seniority = 'MIDDLE')::text                            AS sen_middle,
      COUNT(*) FILTER (WHERE v.seniority = 'SENIOR')::text                            AS sen_senior,
      COUNT(*) FILTER (WHERE v.seniority = 'LEAD')::text                              AS sen_lead,
      COUNT(*) FILTER (WHERE v.seniority = 'PRINCIPAL')::text                         AS sen_principal,
      COUNT(*) FILTER (WHERE v.seniority = 'C_LEVEL')::text                           AS sen_clevel,

      COUNT(*) FILTER (WHERE v.work_format = 'REMOTE')::text                          AS wf_remote,
      COUNT(*) FILTER (WHERE v.work_format = 'OFFICE')::text                          AS wf_office,
      COUNT(*) FILTER (WHERE v.work_format = 'HYBRID')::text                          AS wf_hybrid,

      COUNT(*) FILTER (WHERE v.engagement_type = 'PRODUCT')::text                     AS eng_product,
      COUNT(*) FILTER (WHERE v.engagement_type = 'OUTSOURCE')::text                   AS eng_outsource,
      COUNT(*) FILTER (WHERE v.engagement_type = 'OUTSTAFF')::text                    AS eng_outstaff,
      COUNT(*) FILTER (WHERE v.engagement_type = 'STARTUP')::text                     AS eng_startup,
      COUNT(*) FILTER (WHERE v.engagement_type = 'AGENCY')::text                      AS eng_agency,

      COUNT(*) FILTER (WHERE v.has_reservation IS NOT NULL)::text                     AS reservation_known,
      COUNT(*) FILTER (WHERE v.has_reservation = true)::text                          AS reservation_true,
      COUNT(*) FILTER (WHERE v.salary_min IS NOT NULL OR v.salary_max IS NOT NULL)::text AS salary_disclosed
    FROM vacancies v
    WHERE ${ELIGIBLE}
  `);
  const s = scalarRows[0];

  // 2. Sources distribution.
  const sourceRows = await this.db.execute<{
    id: string; code: string; display_name: string; count: string;
  }>(sql`
    SELECT s.id::text AS id, s.code AS code, s.display_name AS display_name, COUNT(*)::text AS count
    FROM vacancies v JOIN sources s ON s.id = v.source_id
    WHERE ${ELIGIBLE}
    GROUP BY s.id, s.code, s.display_name
    ORDER BY count DESC
  `);

  // 3. Top skills (VERIFIED only).
  const skillRows = await this.db.execute<{
    id: string; name: string; count: string;
  }>(sql`
    SELECT n.id::text AS id, n.canonical_name AS name, COUNT(DISTINCT vn.vacancy_id)::text AS count
    FROM vacancy_nodes vn
    JOIN nodes n ON n.id = vn.node_id
    JOIN vacancies v ON v.id = vn.vacancy_id
    WHERE n.type = 'SKILL' AND n.status = 'VERIFIED' AND ${ELIGIBLE}
    GROUP BY n.id, n.canonical_name
    ORDER BY count DESC
    LIMIT 10
  `);

  return {
    total: Number(s.total),
    lastSyncAt: s.last_sync_at ? new Date(s.last_sync_at).toISOString() : null,
    sources: sourceRows.map((r) => ({
      id: r.id, code: r.code, displayName: r.display_name, count: Number(r.count),
    })),
    topSkills: skillRows.map((r) => ({
      id: r.id, name: r.name, count: Number(r.count),
    })),
    seniorityDist: {
      INTERN: Number(s.sen_intern), JUNIOR: Number(s.sen_junior),
      MIDDLE: Number(s.sen_middle), SENIOR: Number(s.sen_senior),
      LEAD: Number(s.sen_lead), PRINCIPAL: Number(s.sen_principal),
      C_LEVEL: Number(s.sen_clevel),
    },
    workFormatDist: {
      REMOTE: Number(s.wf_remote), OFFICE: Number(s.wf_office), HYBRID: Number(s.wf_hybrid),
    },
    engagementDist: {
      PRODUCT: Number(s.eng_product), OUTSOURCE: Number(s.eng_outsource),
      OUTSTAFF: Number(s.eng_outstaff), STARTUP: Number(s.eng_startup),
      AGENCY: Number(s.eng_agency),
    },
    reservationKnownCount: Number(s.reservation_known),
    reservationTrueCount: Number(s.reservation_true),
    salaryDisclosedCount: Number(s.salary_disclosed),
  };
}
```

> Note: column names (`role_node_id`, `loaded_at`, `salary_min`, `salary_max`, `has_reservation`, `engagement_type`, `work_format`, `display_name`, `code`) match the actual Drizzle schema. Verify against `libs/database/src/schema/{vacancies,sources,nodes,vacancy-nodes}.ts` if any column name differs.

- [ ] **Step 5: Type-check**

Run: `pnpm --filter @metahunt/etl typecheck`
Expect: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add apps/etl/src/vacancies/vacancies.service.ts
git commit -m "feat(vacancies): add getAggregates() with FILTER-aggregate SQL"
```

---

## Task 3: Wire `@Get('aggregates')` controller route

**Files:**
- Modify: `apps/etl/src/vacancies/vacancies.controller.ts`

- [ ] **Step 1: Add the route handler**

Add this method to the controller class (after `list`):

```ts
@Get("aggregates")
aggregates() {
  return this.vacancies.getAggregates();
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm --filter @metahunt/etl typecheck`
Expect: 0 errors.

- [ ] **Step 3: Smoke-test the endpoint**

Start the etl dev server (skip if already running):
```bash
pnpm db:up
pnpm dev:etl
```

In another terminal:
```bash
curl -s localhost:3000/vacancies/aggregates | head -c 800
```

Expect: JSON with `total`, `lastSyncAt`, `sources`, `topSkills`, `seniorityDist`, `workFormatDist`, `engagementDist`, `reservationKnownCount`, `reservationTrueCount`, `salaryDisclosedCount` keys. Numbers should be > 0 if the local DB is seeded.

- [ ] **Step 4: Commit**

```bash
git add apps/etl/src/vacancies/vacancies.controller.ts
git commit -m "feat(vacancies): expose GET /vacancies/aggregates"
```

---

## Task 4: Frontend aggregates fetcher

**Files:**
- Create: `apps/web/lib/api/aggregates.ts`

- [ ] **Step 1: Create the fetcher file**

```ts
// Hand-mirrored types for VacancyAggregatesResponse from
// apps/etl/src/vacancies/vacancies.contract.ts. Per ADR-0005 we duplicate
// types here until a second consumer justifies extracting libs/contracts.

import type {
  Seniority,
  WorkFormat,
  EngagementType,
} from "./vacancies";

export interface AggregateSourceCount {
  id: string;
  code: string;
  displayName: string;
  count: number;
}

export interface AggregateSkillCount {
  id: string;
  name: string;
  count: number;
}

export interface VacancyAggregates {
  total: number;
  lastSyncAt: string | null;
  sources: AggregateSourceCount[];
  topSkills: AggregateSkillCount[];
  seniorityDist: Record<Seniority, number>;
  workFormatDist: Record<WorkFormat, number>;
  engagementDist: Record<EngagementType, number>;
  reservationKnownCount: number;
  reservationTrueCount: number;
  salaryDisclosedCount: number;
}

async function get<T>(path: string, init?: RequestInit): Promise<T> {
  const base = process.env.NEXT_PUBLIC_API_URL;
  if (!base) {
    throw new Error(
      "NEXT_PUBLIC_API_URL is not set. Add it to apps/web/.env.local (e.g. http://localhost:3000).",
    );
  }
  const url = `${base.replace(/\/+$/, "")}${path}`;
  const res = await fetch(url, init ?? { cache: "no-store" });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`aggregates api ${res.status} ${path}: ${body}`);
  }
  return (await res.json()) as T;
}

export const aggregatesApi = {
  get: (init?: RequestInit) =>
    get<VacancyAggregates>("/vacancies/aggregates", init),
};
```

- [ ] **Step 2: Type-check**

Run: `pnpm --filter @metahunt/web typecheck`
Expect: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/api/aggregates.ts
git commit -m "feat(web): add aggregatesApi fetcher mirroring backend contract"
```

---

## Task 5: Move old landing → `/welcome`

**Files:**
- Create: `apps/web/app/(landing)/welcome/page.tsx`

- [ ] **Step 1: Read current root landing**

Run: `cat apps/web/app/\(landing\)/page.tsx`
Expect: imports of Header / Hero / Problem / HowItWorks / Result / AiCopilot / Roadmap / AboutMe / FinalCTA / Footer + a `landingNav: NavItem[]`.

- [ ] **Step 2: Create the `/welcome` page**

```tsx
// apps/web/app/(landing)/welcome/page.tsx
import { Header, type NavItem } from "@/components/shared/Header";
import { Footer } from "@/components/shared/Footer";
import { Hero } from "../_components/hero/Hero";
import { Problem } from "../_components/problem/Problem";
import { HowItWorks } from "../_components/how/HowItWorks";
import { Result } from "../_components/result/Result";
import { AiCopilot } from "../_components/ai/AiCopilot";
import { Roadmap } from "../_components/roadmap/Roadmap";
import { AboutMe } from "../_components/about/AboutMe";
import { FinalCTA } from "../_components/cta/FinalCTA";

const welcomeNav: NavItem[] = [
  { label: "проблема", href: "#problem" },
  { label: "рішення", href: "#how" },
  { label: "результат", href: "#result" },
  { label: "фічі", href: "#ai" },
  { label: "роадмапа", href: "#roadmap" },
  { label: "хто я", href: "#about" },
  { label: "вакансії", href: "/" },
  { label: "моніторинг", href: "/dashboard" },
];

export default function WelcomePage() {
  return (
    <>
      <Header links={welcomeNav} />
      <Hero />
      <Problem />
      <HowItWorks />
      <Result />
      <AiCopilot />
      <Roadmap />
      <AboutMe />
      <FinalCTA />
      <Footer />
    </>
  );
}
```

- [ ] **Step 3: Smoke-test the new route**

Start web dev (skip if running):
```bash
pnpm dev:web
```

Open http://localhost:4000/welcome in browser. Expect: identical layout to current `/`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/\(landing\)/welcome/page.tsx
git commit -m "feat(web): move marketing landing to /welcome"
```

---

## Task 6: TotalCounter component

**Files:**
- Create: `apps/web/app/(landing)/_components/market-snapshot/TotalCounter.tsx`

- [ ] **Step 1: Add a relative-time helper**

Inline helper inside `TotalCounter.tsx` (no shared lib needed for one consumer).

- [ ] **Step 2: Create the component**

```tsx
// apps/web/app/(landing)/_components/market-snapshot/TotalCounter.tsx
import type { AggregateSourceCount } from "@/lib/api/aggregates";

type Props = {
  total: number;
  lastSyncAt: string | null;
  sources: AggregateSourceCount[];
};

function relativeMinutes(iso: string | null): string {
  if (!iso) return "не оновлено";
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.max(0, Math.round(diffMs / 60000));
  if (min < 1) return "оновлено щойно";
  if (min < 60) return `оновлено ${min} хв тому`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `оновлено ${hr} год тому`;
  const d = Math.round(hr / 24);
  return `оновлено ${d} дн тому`;
}

const FORMATTER = new Intl.NumberFormat("uk-UA");

export function TotalCounter({ total, lastSyncAt, sources }: Props) {
  const sourceLabel = sources.map((s) => s.displayName).join(" + ") || "—";
  return (
    <div className="flex flex-col items-start gap-3 rounded-2xl border border-border bg-surface px-8 py-6 md:items-end md:text-right">
      <span className="font-display text-6xl font-bold leading-none text-text-primary md:text-7xl">
        {FORMATTER.format(total)}
      </span>
      <span className="font-body text-sm text-text-secondary">
        вакансій зараз на ринку UA
      </span>
      <span className="flex items-center gap-2 font-mono text-xs text-text-muted">
        <span aria-hidden className="size-1.5 rounded-full bg-accent" />
        {relativeMinutes(lastSyncAt)} · {sourceLabel}
      </span>
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `pnpm --filter @metahunt/web typecheck`
Expect: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/\(landing\)/_components/market-snapshot/TotalCounter.tsx
git commit -m "feat(snapshot): TotalCounter (number + sources + relative time)"
```

---

## Task 7: TopSkills component

**Files:**
- Create: `apps/web/app/(landing)/_components/market-snapshot/TopSkills.tsx`

- [ ] **Step 1: Create the component**

```tsx
// apps/web/app/(landing)/_components/market-snapshot/TopSkills.tsx
import type { AggregateSkillCount } from "@/lib/api/aggregates";

type Props = {
  skills: AggregateSkillCount[];
  totalVacancies: number;
};

const DISPLAY_COUNT = 8;

export function TopSkills({ skills, totalVacancies }: Props) {
  const top = skills.slice(0, DISPLAY_COUNT);
  const max = top[0]?.count ?? 0;

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-6">
      <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
        top skills
      </span>
      {top.length === 0 ? (
        <span className="font-mono text-xs text-text-muted">no skills yet</span>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {top.map((skill) => {
            const widthPct = max > 0 ? (skill.count / max) * 100 : 0;
            const sharePct =
              totalVacancies > 0
                ? Math.round((skill.count / totalVacancies) * 100)
                : 0;
            return (
              <li
                key={skill.id}
                className="grid grid-cols-[1fr_auto] items-center gap-3"
              >
                <div className="flex flex-col gap-1">
                  <span className="font-body text-sm text-text-primary">
                    {skill.name}
                  </span>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-border/50">
                    <div
                      className="h-full origin-left rounded-full bg-accent"
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>
                </div>
                <span className="font-mono text-xs tabular-nums text-text-muted">
                  {sharePct}%
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check + commit**

```bash
pnpm --filter @metahunt/web typecheck
git add apps/web/app/\(landing\)/_components/market-snapshot/TopSkills.tsx
git commit -m "feat(snapshot): TopSkills horizontal-bar widget"
```

---

## Task 8: SeniorityBars component

**Files:**
- Create: `apps/web/app/(landing)/_components/market-snapshot/SeniorityBars.tsx`

- [ ] **Step 1: Create the component**

```tsx
// apps/web/app/(landing)/_components/market-snapshot/SeniorityBars.tsx
import type { Seniority } from "@/lib/api/vacancies";

type Props = {
  dist: Record<Seniority, number>;
};

const ORDER: Seniority[] = [
  "INTERN", "JUNIOR", "MIDDLE", "SENIOR", "LEAD", "PRINCIPAL", "C_LEVEL",
];

const SHORT: Record<Seniority, string> = {
  INTERN: "intern",
  JUNIOR: "junior",
  MIDDLE: "middle",
  SENIOR: "senior",
  LEAD: "lead",
  PRINCIPAL: "principal",
  C_LEVEL: "c-level",
};

export function SeniorityBars({ dist }: Props) {
  const visible = ORDER.filter((k) => (dist[k] ?? 0) > 0);
  const max = Math.max(0, ...visible.map((k) => dist[k] ?? 0));

  return (
    <div className="flex h-full flex-col gap-4 rounded-2xl border border-border bg-surface p-6">
      <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
        seniority
      </span>
      {visible.length === 0 ? (
        <span className="font-mono text-xs text-text-muted">no data</span>
      ) : (
        <div className="flex flex-1 items-end justify-between gap-3 pt-2">
          {visible.map((k) => {
            const v = dist[k] ?? 0;
            const heightPct = max > 0 ? (v / max) * 100 : 0;
            return (
              <div
                key={k}
                className="flex flex-1 flex-col items-center gap-2"
                title={`${SHORT[k]}: ${v}`}
              >
                <span className="font-mono text-[10px] tabular-nums text-text-muted">
                  {v}
                </span>
                <div className="flex h-24 w-full items-end">
                  <div
                    className="w-full rounded-t bg-accent"
                    style={{ height: `${heightPct}%`, minHeight: 2 }}
                  />
                </div>
                <span className="font-mono text-[10px] uppercase tracking-wide text-text-muted">
                  {SHORT[k]}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check + commit**

```bash
pnpm --filter @metahunt/web typecheck
git add apps/web/app/\(landing\)/_components/market-snapshot/SeniorityBars.tsx
git commit -m "feat(snapshot): SeniorityBars vertical histogram"
```

---

## Task 9: FormatDonut + reservation tile

**Files:**
- Create: `apps/web/app/(landing)/_components/market-snapshot/FormatDonut.tsx`

- [ ] **Step 1: Create the component**

The existing `Donut` is single-arc. v1 shows REMOTE share as the arc; HYBRID/OFFICE go in a legend below; reservation stat sits in the same tile under a divider.

```tsx
// apps/web/app/(landing)/_components/market-snapshot/FormatDonut.tsx
import { Donut } from "@/components/data/Donut";
import type { WorkFormat } from "@/lib/api/vacancies";

type Props = {
  dist: Record<WorkFormat, number>;
  reservationKnownCount: number;
  reservationTrueCount: number;
};

const FMT_LABEL: Record<WorkFormat, string> = {
  REMOTE: "remote",
  HYBRID: "hybrid",
  OFFICE: "office",
};

export function FormatDonut({
  dist,
  reservationKnownCount,
  reservationTrueCount,
}: Props) {
  const total = dist.REMOTE + dist.HYBRID + dist.OFFICE;
  const remoteShare = total > 0 ? Math.round((dist.REMOTE / total) * 100) : 0;

  const reservationShare =
    reservationKnownCount > 0
      ? Math.round((reservationTrueCount / reservationKnownCount) * 100)
      : null;

  return (
    <div className="flex h-full flex-col gap-4 rounded-2xl border border-border bg-surface p-6">
      <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
        format
      </span>
      <div className="flex flex-1 flex-col items-center justify-center gap-3">
        <Donut
          value={dist.REMOTE}
          total={total}
          label={`${remoteShare}%`}
          size={120}
          thickness={14}
          ariaLabel={`${remoteShare}% remote`}
        />
        <span className="font-body text-sm text-text-secondary">remote</span>
      </div>
      <ul className="flex flex-col gap-1 font-mono text-xs text-text-muted">
        {(["REMOTE", "HYBRID", "OFFICE"] as WorkFormat[]).map((k) => {
          const pct = total > 0 ? Math.round((dist[k] / total) * 100) : 0;
          return (
            <li key={k} className="flex items-center justify-between">
              <span className="lowercase">{FMT_LABEL[k]}</span>
              <span className="tabular-nums">{pct}%</span>
            </li>
          );
        })}
      </ul>
      {reservationShare !== null && (
        <div className="border-t border-border pt-3">
          <span className="font-body text-sm text-text-primary">
            <span className="font-display font-bold">{reservationShare}%</span>
            {" "}з бронюванням
          </span>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check + commit**

```bash
pnpm --filter @metahunt/web typecheck
git add apps/web/app/\(landing\)/_components/market-snapshot/FormatDonut.tsx
git commit -m "feat(snapshot): FormatDonut with reservation stat in same tile"
```

---

## Task 10: Snapshot wrapper

**Files:**
- Create: `apps/web/app/(landing)/_components/market-snapshot/Snapshot.tsx`

- [ ] **Step 1: Create wrapper that composes all 4 widgets**

```tsx
// apps/web/app/(landing)/_components/market-snapshot/Snapshot.tsx
import type { VacancyAggregates } from "@/lib/api/aggregates";
import { TotalCounter } from "./TotalCounter";
import { TopSkills } from "./TopSkills";
import { SeniorityBars } from "./SeniorityBars";
import { FormatDonut } from "./FormatDonut";

type Props = {
  aggregates: VacancyAggregates;
};

export function Snapshot({ aggregates: a }: Props) {
  return (
    <section className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-6 pt-16 pb-12 md:px-12">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-[3fr_2fr] md:items-stretch">
        <div className="flex flex-col justify-center gap-5">
          <h1 className="font-display text-4xl font-bold leading-tight text-text-primary md:text-5xl">
            Метахант
          </h1>
          <p className="max-w-[520px] font-body text-base leading-[1.55] text-text-secondary md:text-lg">
            агрегує IT-вакансії з DOU та Джині, нормалізує роль / стек / формат
            і викладає одним списком.
          </p>
        </div>
        <TotalCounter
          total={a.total}
          lastSyncAt={a.lastSyncAt}
          sources={a.sources}
        />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <TopSkills skills={a.topSkills} totalVacancies={a.total} />
        <SeniorityBars dist={a.seniorityDist} />
        <FormatDonut
          dist={a.workFormatDist}
          reservationKnownCount={a.reservationKnownCount}
          reservationTrueCount={a.reservationTrueCount}
        />
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Type-check + commit**

```bash
pnpm --filter @metahunt/web typecheck
git add apps/web/app/\(landing\)/_components/market-snapshot/Snapshot.tsx
git commit -m "feat(snapshot): Snapshot wrapper composing 4 widgets in 2-row layout"
```

---

## Task 11: PublicVacancyCard component

**Files:**
- Create: `apps/web/app/(landing)/_components/vacancy-list/PublicVacancyCard.tsx`

- [ ] **Step 1: Inspect existing operator card for label / format helpers**

Run: `grep -n 'SENIORITY_LABELS\|formatSalary\|formatLocations' apps/web/lib/extracted-vacancy.ts apps/web/lib/format.ts`
Expect: helpers exist. Reuse them; do not redefine.

- [ ] **Step 2: Create the public card**

```tsx
// apps/web/app/(landing)/_components/vacancy-list/PublicVacancyCard.tsx
import Link from "next/link";
import type { VacancyDto } from "@/lib/api/vacancies";

type Props = { vacancy: VacancyDto };

const SENIORITY_LABEL: Record<NonNullable<VacancyDto["seniority"]>, string> = {
  INTERN: "Intern", JUNIOR: "Junior", MIDDLE: "Middle", SENIOR: "Senior",
  LEAD: "Lead", PRINCIPAL: "Principal", C_LEVEL: "C-Level",
};
const FORMAT_LABEL: Record<NonNullable<VacancyDto["workFormat"]>, string> = {
  REMOTE: "Remote", OFFICE: "Office", HYBRID: "Hybrid",
};
const EMPLOYMENT_LABEL: Record<NonNullable<VacancyDto["employmentType"]>, string> = {
  FULL_TIME: "Full-time", PART_TIME: "Part-time", CONTRACT: "Contract",
  FREELANCE: "Freelance", INTERNSHIP: "Internship",
};
const ENGLISH_LABEL: Record<NonNullable<VacancyDto["englishLevel"]>, string> = {
  BEGINNER: "English Beginner",
  INTERMEDIATE: "English Intermediate",
  UPPER_INTERMEDIATE: "English Upper-Int",
  ADVANCED: "English Advanced",
  NATIVE: "English Native",
};

const SKILLS_SHOWN = 5;
const NF = new Intl.NumberFormat("en-US");

function formatSalary(s: VacancyDto["salary"]): string | null {
  if (!s.min && !s.max) return null;
  const cur = s.currency ?? "";
  if (s.min && s.max) return `${NF.format(s.min)} – ${NF.format(s.max)} ${cur}`.trim();
  if (s.min) return `від ${NF.format(s.min)} ${cur}`.trim();
  if (s.max) return `до ${NF.format(s.max)} ${cur}`.trim();
  return null;
}

export function PublicVacancyCard({ vacancy: v }: Props) {
  const subtitleParts = [
    v.company?.name,
    v.locations[0],
    v.workFormat ? FORMAT_LABEL[v.workFormat] : null,
  ].filter(Boolean) as string[];

  const tags = [
    v.seniority ? SENIORITY_LABEL[v.seniority] : null,
    v.employmentType ? EMPLOYMENT_LABEL[v.employmentType] : null,
    v.englishLevel ? ENGLISH_LABEL[v.englishLevel] : null,
  ].filter(Boolean) as string[];

  const skillNames = [
    ...v.skills.required.map((s) => s.name),
    ...v.skills.optional.map((s) => s.name),
  ];
  const visibleSkills = skillNames.slice(0, SKILLS_SHOWN);
  const moreSkillCount = Math.max(0, skillNames.length - SKILLS_SHOWN);
  const salary = formatSalary(v.salary);

  return (
    <article className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-6 transition-colors hover:border-text-muted">
      <header className="flex items-start justify-between gap-4">
        <h3 className="font-display text-xl font-semibold leading-snug text-text-primary">
          {v.title}
        </h3>
        <span className="shrink-0 rounded-full border border-border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-text-muted">
          {v.source.code}
        </span>
      </header>

      {subtitleParts.length > 0 && (
        <p className="font-body text-sm text-text-secondary">
          {subtitleParts.join(" · ")}
        </p>
      )}

      {tags.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {tags.map((t) => (
            <li
              key={t}
              className="rounded-full bg-bg px-2.5 py-1 font-mono text-[11px] text-text-secondary"
            >
              {t}
            </li>
          ))}
        </ul>
      )}

      {visibleSkills.length > 0 && (
        <p className="font-body text-sm text-text-secondary">
          {visibleSkills.join(" · ")}
          {moreSkillCount > 0 && (
            <span className="text-text-muted"> · +{moreSkillCount} more</span>
          )}
        </p>
      )}

      <p
        className={
          salary
            ? "font-mono text-sm text-text-primary"
            : "font-mono text-sm text-text-muted"
        }
      >
        {salary ?? "ЗП не вказано"}
      </p>

      <footer className="flex flex-wrap items-center justify-end gap-4 pt-2">
        {v.link && (
          <a
            href={v.link}
            target="_blank"
            rel="noreferrer noopener"
            className="font-mono text-sm text-accent hover:underline"
          >
            подати заявку ↗
          </a>
        )}
        <Link
          href={`/records/${v.rssRecordId}`}
          className="font-mono text-sm text-text-secondary hover:underline"
        >
          запис у нас →
        </Link>
      </footer>
    </article>
  );
}
```

- [ ] **Step 3: Type-check + commit**

```bash
pnpm --filter @metahunt/web typecheck
git add apps/web/app/\(landing\)/_components/vacancy-list/PublicVacancyCard.tsx
git commit -m "feat(snapshot): PublicVacancyCard for the public list"
```

---

## Task 12: VacancyList wrapper

**Files:**
- Create: `apps/web/app/(landing)/_components/vacancy-list/VacancyList.tsx`

- [ ] **Step 1: Inspect existing Pagination component**

Run: `cat apps/web/app/\(investigation\)/_components/Pagination.tsx | head -40`
Expect: a typed component used elsewhere with `total`, `limit`, `offset`, `basePath`, `searchParams` props.

- [ ] **Step 2: Create wrapper**

```tsx
// apps/web/app/(landing)/_components/vacancy-list/VacancyList.tsx
import type { ListVacanciesResponse } from "@/lib/api/vacancies";
import { Pagination } from "../../../(investigation)/_components/Pagination";
import { PublicVacancyCard } from "./PublicVacancyCard";

type Props = {
  result: ListVacanciesResponse;
  offset: number;
  flatSearchParams: Record<string, string | undefined>;
};

export function VacancyList({ result, offset, flatSearchParams }: Props) {
  return (
    <section
      id="list"
      className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-6 pb-20 md:px-12"
    >
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-2xl font-semibold text-text-primary md:text-3xl">
          вакансії
        </h2>
        <span className="font-mono text-xs text-text-muted">
          {result.total} total · page {result.page}
        </span>
      </div>

      {result.items.length === 0 ? (
        <p className="font-mono text-sm text-text-muted">no vacancies yet</p>
      ) : (
        <div className="flex flex-col gap-4">
          {result.items.map((v) => (
            <PublicVacancyCard key={v.id} vacancy={v} />
          ))}
        </div>
      )}

      <Pagination
        total={result.total}
        limit={result.pageSize}
        offset={offset}
        basePath="/"
        searchParams={flatSearchParams}
      />
    </section>
  );
}
```

> Note: importing across route groups (`(landing)` → `(investigation)/_components/Pagination`) is fine — Next.js groups affect routing only, not module resolution. If the relative-path is fragile, consider a future promotion to `components/data/Pagination.tsx` (out of scope here).

- [ ] **Step 3: Type-check + commit**

```bash
pnpm --filter @metahunt/web typecheck
git add apps/web/app/\(landing\)/_components/vacancy-list/VacancyList.tsx
git commit -m "feat(snapshot): VacancyList wrapping cards + pagination"
```

---

## Task 13: Rewrite `/` page

**Files:**
- Modify: `apps/web/app/(landing)/page.tsx`

- [ ] **Step 1: Replace the marketing landing with snapshot composition**

```tsx
// apps/web/app/(landing)/page.tsx
import { Header, type NavItem } from "@/components/shared/Header";
import { Footer } from "@/components/shared/Footer";
import { aggregatesApi } from "@/lib/api/aggregates";
import { vacanciesApi } from "@/lib/api/vacancies";
import { Snapshot } from "./_components/market-snapshot/Snapshot";
import { VacancyList } from "./_components/vacancy-list/VacancyList";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

const snapshotNav: NavItem[] = [
  { label: "вакансії", href: "#list" },
  { label: "моніторинг", href: "/dashboard" },
  { label: "про проєкт", href: "/welcome" },
];

function asString(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}
function asNonNegativeInt(
  v: string | string[] | undefined,
  fallback: number,
): number {
  const s = asString(v);
  if (!s) return fallback;
  const n = parseInt(s, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const offset = asNonNegativeInt(sp.offset, 0);
  const page = Math.floor(offset / PAGE_SIZE) + 1;

  const [aggregates, list] = await Promise.all([
    aggregatesApi.get(),
    vacanciesApi.list({ page, pageSize: PAGE_SIZE }),
  ]);

  const flatSearchParams: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(sp)) {
    flatSearchParams[k] = asString(v);
  }

  return (
    <>
      <Header links={snapshotNav} />
      <main className="flex min-h-screen flex-col bg-bg">
        <Snapshot aggregates={aggregates} />
        <VacancyList
          result={list}
          offset={offset}
          flatSearchParams={flatSearchParams}
        />
      </main>
      <Footer />
    </>
  );
}
```

- [ ] **Step 2: Smoke-test the full page**

Open http://localhost:4000/ in a browser (etl + web both running).

Expected:
- Hero left: "Метахант" + 2-line description.
- Hero right: big number (matches `aggregates.total`).
- Status line under counter: dot + "оновлено N хв тому · DOU + Джині".
- Below hero: 3 tiles — top skills (bars), seniority (vertical bars), format (donut + reservation %).
- Below tiles: vacancy list, pagination.
- `/welcome` still works.
- `/dashboard` still works.

If `aggregates.total` is 0 in your dev DB, run a fresh ingest first (`/ingests` operator route → trigger). Otherwise the empty-state prose appears, which is fine to verify.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/\(landing\)/page.tsx
git commit -m "feat(snapshot): rewrite / as market-snapshot + public vacancy list"
```

---

## Task 14: Cross-page sanity sweep + final commit cleanup

- [ ] **Step 1: Lint and type-check both packages**

```bash
pnpm --filter @metahunt/web typecheck
pnpm --filter @metahunt/web lint
pnpm --filter @metahunt/etl typecheck
pnpm --filter @metahunt/etl lint
```
Expect: 0 errors / 0 warnings (or only warnings that pre-existed on main).

- [ ] **Step 2: Smoke matrix**

In browser (web at :4000, etl at :3000):

| URL | Expect |
|---|---|
| `/` | Snapshot + list |
| `/?offset=20` | Page 2 of list, snapshot still rendered |
| `/welcome` | Old marketing landing (8 sections + footer) |
| `/dashboard` | Operator dashboard (unchanged) |
| `/vacancies` | Operator vacancies list (unchanged) |
| `/welcome#problem` | Anchor scrolls to Problem section |

- [ ] **Step 3: If a fix is needed, make it as a focused commit**

If something is misaligned (e.g., hero overlap on a specific viewport), patch and commit `fix(snapshot): <what>`.

- [ ] **Step 4: Push the branch**

```bash
git push -u origin feat/market-snapshot
```

---

## Task 15: P2 — Animations (separate single commit)

> Run this only after Task 14 ships clean. The P2 commit is intentionally one large change so it can be reverted in one shot if it ages poorly.

**Files:**
- Modify: `apps/web/package.json` (add `framer-motion`)
- Modify: `apps/web/app/(landing)/_components/market-snapshot/TotalCounter.tsx`
- Modify: `apps/web/app/(landing)/_components/market-snapshot/TopSkills.tsx`
- Modify: `apps/web/app/(landing)/_components/market-snapshot/SeniorityBars.tsx`
- Modify: `apps/web/app/(landing)/_components/market-snapshot/FormatDonut.tsx`
- Modify: `apps/web/app/(landing)/_components/market-snapshot/Snapshot.tsx`

- [ ] **Step 1: Install framer-motion in the web workspace**

```bash
pnpm --filter @metahunt/web add framer-motion
```

Expect: `framer-motion` added to `apps/web/package.json` dependencies. If a different name (e.g. `motion`) is the current install name in npm registry, prefer that — but the API used below is the `framer-motion` shape; verify imports at install time.

- [ ] **Step 2: Mark each animated component as a Client Component**

Each of the 4 widget files needs `"use client"` as its first line. The layout wrapper `Snapshot.tsx` can stay a server component because animations are scoped per child.

- [ ] **Step 3: TotalCounter — count-up + breathing dot**

Replace the static number span and dot in `TotalCounter.tsx`:

```tsx
"use client";
// ...existing imports...
import { motion, useMotionValue, useReducedMotion, animate } from "framer-motion";
import { useEffect, useState } from "react";

// inside component, after const FORMATTER:
function CountUp({ value }: { value: number }) {
  const reduced = useReducedMotion();
  const mv = useMotionValue(0);
  const [shown, setShown] = useState(reduced ? value : 0);

  useEffect(() => {
    if (reduced || value < 50) {
      setShown(value);
      return;
    }
    const controls = animate(mv, value, {
      duration: 0.8,
      ease: "easeOut",
      onUpdate: (v) => setShown(Math.round(v)),
    });
    return () => controls.stop();
  }, [value, reduced, mv]);

  return <>{FORMATTER.format(shown)}</>;
}
```

Replace `{FORMATTER.format(total)}` with `<CountUp value={total} />`. Replace the static dot:

```tsx
<motion.span
  aria-hidden
  className="size-1.5 rounded-full bg-accent"
  animate={{ opacity: [0.4, 1, 0.4] }}
  transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
/>
```

Wrap the motion.span in a reduced-motion check: if `useReducedMotion()` returns true, render the plain `<span>` instead.

- [ ] **Step 4: Snapshot tile stagger via Snapshot.tsx**

Add `"use client"` to `Snapshot.tsx` so we can use motion at the wrapper. Wrap the second-row grid with motion stagger:

```tsx
"use client";
import { motion, useReducedMotion } from "framer-motion";

// inside Snapshot, replace the second grid with:
const reduced = useReducedMotion();
const tileVariants = reduced
  ? { hidden: { opacity: 1 }, show: { opacity: 1 } }
  : {
      hidden: { opacity: 0, y: 12 },
      show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" } },
    };

<motion.div
  className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3"
  initial="hidden"
  animate="show"
  transition={reduced ? undefined : { staggerChildren: 0.08 }}
>
  <motion.div variants={tileVariants}><TopSkills .../></motion.div>
  <motion.div variants={tileVariants}><SeniorityBars .../></motion.div>
  <motion.div variants={tileVariants}><FormatDonut .../></motion.div>
</motion.div>
```

- [ ] **Step 5: TopSkills — bar width tween on intersection**

Use `framer-motion`'s `whileInView` to animate width from 0 → final on first intersection:

```tsx
<motion.div
  className="h-full origin-left rounded-full bg-accent"
  initial={{ width: 0 }}
  whileInView={{ width: `${widthPct}%` }}
  viewport={{ once: true, margin: "-40px" }}
  transition={{ duration: 0.7, ease: "easeOut", delay: index * 0.04 }}
/>
```

Pass `index` into the map callback. Honour `useReducedMotion()` — when true, set `initial` to the final width directly.

- [ ] **Step 6: SeniorityBars — height tween on intersection**

Mirror Step 5 but tween the `height` style:

```tsx
<motion.div
  className="w-full rounded-t bg-accent"
  initial={{ height: 0 }}
  whileInView={{ height: `${heightPct}%` }}
  viewport={{ once: true, margin: "-40px" }}
  transition={{ duration: 0.6, ease: "easeOut", delay: idx * 0.04 }}
/>
```

- [ ] **Step 7: FormatDonut — strokeDashoffset tween**

The shared `Donut` primitive renders the arc with `strokeDasharray` and a fixed offset. To animate, render an inline svg in `FormatDonut.tsx` (don't modify the shared primitive — it's used elsewhere). Use:

```tsx
<motion.circle
  cx={c} cy={c} r={r}
  fill="none" stroke="var(--color-accent)" strokeWidth={thickness}
  strokeDasharray={circumference}
  initial={{ strokeDashoffset: circumference }}
  whileInView={{ strokeDashoffset: circumference - pct * circumference }}
  viewport={{ once: true, margin: "-40px" }}
  transition={{ duration: 0.7, ease: "easeOut" }}
  transform={`rotate(-90 ${c} ${c})`}
/>
```

The static `<text>` label inside the donut renders normally. With reduced motion, render the static `Donut` component as before.

- [ ] **Step 8: Type-check, lint, smoke**

```bash
pnpm --filter @metahunt/web typecheck
pnpm --filter @metahunt/web lint
```

Browser smoke:
- Hard-refresh `/`. Big number ticks up over ~0.8s. Status dot pulses subtly.
- Tiles fade in with stagger on first load.
- Skill bars animate width on first scroll into view (or already-in-view at load).
- Seniority bars animate height similarly.
- Donut arc draws in.
- DevTools → Settings → Rendering → Emulate prefers-reduced-motion: reduce → reload. All animations are off; final state is rendered immediately.

- [ ] **Step 9: Commit P2**

```bash
git add apps/web/package.json apps/web/pnpm-lock.yaml \
        apps/web/app/\(landing\)/_components/market-snapshot/
git commit -m "feat(snapshot): P2 animations (count-up, stagger, intersection bars/donut)"
git push
```

---

## Closing

After Task 14 (and optionally Task 15) is merged:

- [ ] Update `md/journal/migrations/market-snapshot.md` — fill in the **Outcome** section with the merged commits + smoke summary, and move the file to `md/journal/migrations/_done/`.
- [ ] Update `md/roadmap.md` Stage 06 section: add a one-line bullet pointing at the closed tracker.
- [ ] Update `md/journal/releases.md` with a one-line entry: "market-snapshot — public `/` is now a live aggregate hero + vacancy list; old landing at `/welcome`."
