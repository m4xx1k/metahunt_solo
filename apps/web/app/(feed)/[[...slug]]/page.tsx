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
//
// Data layer: this server component fetches the filter-independent props
// (aggregates, tracks, catalogs, preset) plus the initial list for the incoming
// URL, then hands off to <FeedShell>, a client island that seeds react-query
// with that list and refetches client-side on every filter change (no RSC
// round-trip). See md/journal/migrations/filters-components.md (T6).

import { notFound } from "next/navigation";
import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";

import { Header, type NavItem } from "@/app/_components/Header";
import { Footer } from "@/app/_components/Footer";
import { aggregatesApi } from "@/lib/api/aggregates";
import { tracksApi } from "@/lib/api/tracks";
import { facetsApi } from "@/lib/api/facets";
import { vacanciesApi } from "@/lib/api/vacancies";
import { readerFrom } from "@/features/vacancy-filters/url-params";
import { coldKey } from "@/features/vacancy-filters/query-keys";
import { FeedHero } from "../_components/market/FeedHero";
import { FeedShell } from "../_components/FeedShell";
import { buildFeedListQuery } from "../_components/feed-query";

export const dynamic = "force-dynamic";

const snapshotNav: NavItem[] = [
  { label: "вакансії", href: "#list" },
  { label: "моніторинг", href: "/dashboard" },
  { label: "про проєкт", href: "/welcome" },
];

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
    { domains: domainCatalog },
  ] = await Promise.all([
    trackSlug
      ? tracksApi.preset(trackSlug)
      : Promise.resolve({ roles: [], skills: [] }),
    trackSlug ? tracksApi.skills(trackSlug) : Promise.resolve({ skills: [] }),
    facetsApi.roles(),
    facetsApi.skills(),
    // Tolerate a missing /feed/domains during a deploy gap (web can ship before
    // etl): degrade to an empty domain filter instead of 500-ing the whole feed.
    facetsApi.domains().catch(() => ({ domains: [] })),
  ]);

  // Seed react-query with the list for the incoming URL, under the SAME key the
  // client computes (coldKey), so the first render is served from cache with no
  // mount refetch. A track with no effective axes (query null) seeds nothing —
  // the shell renders an empty list. Dehydration streams the seed to the client.
  const { query } = buildFeedListQuery(readerFrom(sp), {
    trackActive: trackSlug != null,
    presetRoleIds: preset.roles.map((r) => r.id),
    presetSkillIds: preset.skills.map((s) => s.id),
    sources: aggregates.sources,
  });
  const queryClient = new QueryClient();
  if (query) {
    queryClient.setQueryData(coldKey(query), await vacanciesApi.list(query));
  }

  return (
    <>
      <Header links={snapshotNav} />
      <main className="flex min-h-screen flex-col bg-bg">
        <FeedHero aggregates={aggregates} showPipeline={!trackSlug} />
        <div className="mx-auto w-full max-w-7xl px-6 pb-20 lg:px-12">
          <HydrationBoundary state={dehydrate(queryClient)}>
            <FeedShell
              aggregates={aggregates}
              tracks={tracks}
              activeTrackSlug={trackSlug ?? null}
              presetRoles={preset.roles}
              presetSkills={preset.skills}
              contextualSkills={contextualSkills}
              roleCatalog={roleCatalog}
              skillCatalog={skillCatalog}
              domainCatalog={domainCatalog}
            />
          </HydrationBoundary>
        </div>
      </main>
      <Footer />
    </>
  );
}
