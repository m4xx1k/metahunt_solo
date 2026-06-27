// The home feed. Served at `/` (all disciplines) and `/<trackSlug>` (a
// browse-tree track) via the group-root optional catch-all. The active track
// is the first route segment, e.g. /backend-go.
//
// Feed model (Variant C): the track is a *preset*, not the feed driver. Its
// preset endpoint resolves the effective ROLE + SKILL nodes; the page reads
// ?roles / ?skills (absent → the track's preset, present → the explicit set)
// and queries the feed by those two explicit axes — never trackSlug. So
// removing a preset node (drop Go) honestly broadens the feed, and both axes
// share one unified facet UI. See md/journal/migrations/taxonomy-navigation.md.

import { notFound } from "next/navigation";

import { Header, type NavItem } from "@/app/_components/Header";
import { Footer } from "@/app/_components/Footer";
import { aggregatesApi } from "@/lib/api/aggregates";
import { tracksApi } from "@/lib/api/tracks";
import { facetsApi } from "@/lib/api/facets";
import {
  coerceBool,
  coerceSeniority,
  coerceWorkFormat,
  vacanciesApi,
} from "@/lib/api/vacancies";
import type { SubscriptionParams } from "@/lib/api/subscriptions";
import { FeedHero } from "../_components/market/FeedHero";
import { FeedFilters } from "../_components/market/FeedFilters";
import { SubscribeButton } from "../_components/subscribe/SubscribeButton";
import { VacancyList } from "../_components/vacancy-list/VacancyList";

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

// An axis param: absent (undefined) → fall back to the track's preset node ids;
// present (even "") → the explicit comma-joined set. Mirrors TrackAxisSection's
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

  // Flat slug: one segment == the track slug. First segment wins; `/` (no
  // segment) is the index (no active track).
  const trackSlug = slug?.[0];

  const offset = asNonNegativeInt(sp.offset, 0);
  const page = Math.floor(offset / PAGE_SIZE) + 1;

  const sourceCode = asString(sp.source);
  const seniority = coerceSeniority(asString(sp.seniority));
  const workFormat = coerceWorkFormat(asString(sp.workFormat));
  const hasTestAssignment = coerceBool(asString(sp.test));
  const hasReservation = coerceBool(asString(sp.reservation));
  const hasDuplicates = asString(sp.dupes) === "true" ? true : undefined;
  // Skill-scope toggle: by default skills match must-have only; ?nice=true
  // loosens the filter so nice-to-have skills count too.
  const includeOptionalSkills = asString(sp.nice) === "true" ? true : undefined;

  const [aggregates, { tracks }] = await Promise.all([
    aggregatesApi.get(),
    tracksApi.get(),
  ]);

  // The catch-all serves every `/<slug>`, so an unknown slug is a real 404 —
  // not a feed scoped to a track that doesn't exist.
  if (trackSlug && !tracks.some((t) => t.slug === trackSlug)) {
    notFound();
  }

  // The full role/skill catalogs back the sidebar search on BOTH layouts (the
  // landing MultiSelects and the track facets) — always fetch them (ISR-cached).
  // The preset + contextual skills only matter once a track is active.
  const [
    preset,
    { skills: contextualSkills },
    { roles: roleCatalog },
    { skills: skillCatalog },
  ] = await Promise.all([
    trackSlug
      ? tracksApi.preset(trackSlug)
      : Promise.resolve({ roles: [], skills: [] }),
    trackSlug ? tracksApi.skills(trackSlug) : Promise.resolve({ skills: [] }),
    facetsApi.roles(),
    facetsApi.skills(),
  ]);

  // Effective axes: the URL overrides the track's preset per axis.
  const roleIds = axisOr(
    sp.roles,
    preset.roles.map((r) => r.id),
  );
  const skillIds = axisOr(
    sp.skills,
    preset.skills.map((s) => s.id),
  );

  const sourceId =
    sourceCode != null
      ? (aggregates.sources.find((s) => s.code === sourceCode)?.id ?? null)
      : null;

  // An active track whose effective axes are both empty (every preset node
  // removed, or a pure-grouping track) matches nothing — mirror the count,
  // don't fall through to the unfiltered set. The bare `/` index (no track)
  // does show everything eligible.
  const hasPreset = roleIds.length > 0 || skillIds.length > 0;
  const list =
    !trackSlug || hasPreset
      ? await vacanciesApi.list({
          page,
          pageSize: PAGE_SIZE,
          roleIds: roleIds.length > 0 ? roleIds : undefined,
          skillIds: skillIds.length > 0 ? skillIds : undefined,
          includeOptionalSkills,
          sourceId: sourceId ?? undefined,
          seniority,
          workFormat,
          hasTestAssignment,
          hasReservation,
          hasDuplicates,
        })
      : { items: [], page, pageSize: PAGE_SIZE, total: 0 };

  const flatSearchParams: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(sp)) {
    flatSearchParams[k] = asString(v);
  }

  // The effective query a subscription would replay — same filter the list
  // above ran, minus pagination. Mirrors the `vacanciesApi.list` call.
  const subscriptionParams: SubscriptionParams = {
    roleIds: roleIds.length > 0 ? roleIds : undefined,
    skillIds: skillIds.length > 0 ? skillIds : undefined,
    sourceId: sourceId ?? undefined,
    seniority,
    workFormat,
    hasTestAssignment,
    hasReservation,
  };

  return (
    <>
      <Header links={snapshotNav} />
      <main className="flex min-h-screen flex-col bg-bg">
        <FeedHero aggregates={aggregates} showPipeline={!trackSlug} />
        <div className="mx-auto w-full max-w-7xl px-6 pb-20 lg:px-12">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[300px_minmax(0,1fr)] lg:items-start">
            <div className="flex flex-col gap-4">
              {(!trackSlug || hasPreset) && (
                <SubscribeButton params={subscriptionParams} />
              )}
              <FeedFilters
                aggregates={aggregates}
                tracks={tracks}
                activeTrackSlug={trackSlug ?? null}
                presetRoles={preset.roles}
                presetSkills={preset.skills}
                contextualSkills={contextualSkills}
                roleCatalog={roleCatalog}
                skillCatalog={skillCatalog}
              />
            </div>
            <VacancyList
              result={list}
              offset={offset}
              flatSearchParams={flatSearchParams}
              basePath={
                trackSlug ? `/${encodeURIComponent(trackSlug)}` : "/"
              }
            />
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
