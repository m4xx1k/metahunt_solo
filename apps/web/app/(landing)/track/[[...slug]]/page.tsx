// Prototype track-navigation page (scaffold — step 0).
// A copy of the working landing feed scoped to a browse-tree track. The
// active track is the first route segment (flat slug, e.g. /track/backend-go);
// /track with no segment is the all-disciplines index. The real tree +
// refine panel land in later steps; for now this proves the trackSlug feed
// slice end-to-end. Source landing page: app/(landing)/page.tsx.
// See md/journal/migrations/taxonomy-navigation.md.

import { Header, type NavItem } from "@/components/shared/Header";
import { Footer } from "@/components/shared/Footer";
import { aggregatesApi } from "@/lib/api/aggregates";
import { tracksApi } from "@/lib/api/tracks";
import {
  coerceBool,
  coerceSeniority,
  coerceWorkFormat,
  vacanciesApi,
} from "@/lib/api/vacancies";
import { Snapshot } from "../../_components/market-snapshot/Snapshot";
import { MarketFilters } from "../../_components/market-snapshot/MarketFilters";
import { VacancyList } from "../../_components/vacancy-list/VacancyList";

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

function asCsv(v: string | string[] | undefined): string[] {
  const s = asString(v);
  return s ? s.split(",").filter(Boolean) : [];
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

export default async function TrackPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;

  // Flat slug: one segment == the track slug. First segment wins; /track is
  // the index (no active track).
  const trackSlug = slug?.[0];

  const offset = asNonNegativeInt(sp.offset, 0);
  const page = Math.floor(offset / PAGE_SIZE) + 1;

  const roleId = asString(sp.role);
  const skillIds = asCsv(sp.skills);
  const sourceCode = asString(sp.source);
  const seniority = coerceSeniority(asString(sp.seniority));
  const workFormat = coerceWorkFormat(asString(sp.workFormat));
  const hasTestAssignment = coerceBool(asString(sp.test));
  const hasReservation = coerceBool(asString(sp.reservation));

  // Lazy-refine: until the user picks an explicit role/skill, the track drives
  // the feed via trackSlug; once they do, the raw ids take over.
  const hasExplicitRefine = roleId != null || skillIds.length > 0;

  const [aggregates, { tracks }] = await Promise.all([
    aggregatesApi.get(),
    tracksApi.get(),
  ]);
  const sourceId =
    sourceCode != null
      ? (aggregates.sources.find((s) => s.code === sourceCode)?.id ?? null)
      : null;

  const list = await vacanciesApi.list({
    page,
    pageSize: PAGE_SIZE,
    trackSlug: hasExplicitRefine ? undefined : trackSlug,
    roleId: roleId ?? undefined,
    skillIds: skillIds.length > 0 ? skillIds : undefined,
    sourceId: sourceId ?? undefined,
    seniority,
    workFormat,
    hasTestAssignment,
    hasReservation,
  });

  const flatSearchParams: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(sp)) {
    flatSearchParams[k] = asString(v);
  }

  return (
    <>
      <Header links={snapshotNav} />
      <main className="flex min-h-screen flex-col bg-bg">
        <Snapshot aggregates={aggregates} />
        <div className="mx-auto w-full max-w-7xl px-6 pb-20 lg:px-12">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[300px_minmax(0,1fr)] lg:items-start">
            <MarketFilters
              aggregates={aggregates}
              tracks={tracks}
              activeTrackSlug={trackSlug ?? null}
            />
            <VacancyList
              result={list}
              offset={offset}
              flatSearchParams={flatSearchParams}
            />
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
