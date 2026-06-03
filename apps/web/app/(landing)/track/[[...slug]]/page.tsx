// Track-navigation page. A copy of the landing feed scoped to a browse-tree
// track. The active track is the first route segment (flat slug, e.g.
// /track/backend-go); /track with no segment is the all-disciplines index.
//
// Feed model (Variant C): the track is a *preset*, not the feed driver. Its
// criteria endpoint resolves the effective ROLE + SKILL nodes; the page reads
// ?roles / ?skills (absent → the track's criteria, present → the explicit
// set) and queries the feed by those two explicit axes — never trackSlug. So
// removing a preset (drop Go) honestly broadens the feed, and both axes share
// one unified facet UI. See md/journal/migrations/taxonomy-navigation.md.

import { Header, type NavItem } from "@/components/shared/Header";
import { Footer } from "@/components/shared/Footer";
import { aggregatesApi } from "@/lib/api/aggregates";
import { tracksApi } from "@/lib/api/tracks";
import { facetsApi } from "@/lib/api/facets";
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

// An axis param: absent (undefined) → fall back to the track's preset ids;
// present (even "") → the explicit comma-joined set. Mirrors FacetSection's
// URL model so a fully-removed preset (?skills=) yields an empty axis.
function axisOr(
  v: string | string[] | undefined,
  presetIds: string[],
): string[] {
  const s = asString(v);
  if (s === undefined) return presetIds;
  return s.split(",").filter(Boolean);
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

  const sourceCode = asString(sp.source);
  const seniority = coerceSeniority(asString(sp.seniority));
  const workFormat = coerceWorkFormat(asString(sp.workFormat));
  const hasTestAssignment = coerceBool(asString(sp.test));
  const hasReservation = coerceBool(asString(sp.reservation));

  const [
    aggregates,
    { tracks },
    criteria,
    { skills: contextualSkills },
    { roles: roleCatalog },
    { skills: skillCatalog },
  ] = await Promise.all([
    aggregatesApi.get(),
    tracksApi.get(),
    trackSlug
      ? tracksApi.criteria(trackSlug)
      : Promise.resolve({ roles: [], skills: [] }),
    trackSlug ? tracksApi.skills(trackSlug) : Promise.resolve({ skills: [] }),
    facetsApi.roles(),
    facetsApi.skills(),
  ]);

  // Effective axes: the URL overrides the track's criteria per axis.
  const roleIds = axisOr(
    sp.roles,
    criteria.roles.map((r) => r.id),
  );
  const skillIds = axisOr(
    sp.skills,
    criteria.skills.map((s) => s.id),
  );

  const sourceId =
    sourceCode != null
      ? (aggregates.sources.find((s) => s.code === sourceCode)?.id ?? null)
      : null;

  // An active track whose effective axes are both empty (every preset removed,
  // or a pure-grouping track) matches nothing — mirror the count, don't fall
  // through to the unfiltered set. The bare /track index (no track) does show
  // everything eligible.
  const hasCriteria = roleIds.length > 0 || skillIds.length > 0;
  const list =
    !trackSlug || hasCriteria
      ? await vacanciesApi.list({
          page,
          pageSize: PAGE_SIZE,
          roleIds: roleIds.length > 0 ? roleIds : undefined,
          skillIds: skillIds.length > 0 ? skillIds : undefined,
          sourceId: sourceId ?? undefined,
          seniority,
          workFormat,
          hasTestAssignment,
          hasReservation,
        })
      : { items: [], page, pageSize: PAGE_SIZE, total: 0 };

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
              roleCriteria={criteria.roles}
              skillCriteria={criteria.skills}
              contextualSkills={contextualSkills}
              roleCatalog={roleCatalog}
              skillCatalog={skillCatalog}
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
