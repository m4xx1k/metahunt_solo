// The merged feed+CV route (listed beta at /merged). PR1 renders the COLD
// experience: the feed's server fetch + body reused via <FeedShell>, wrapped in
// lens chrome. Importing the feed's _components is a deliberate, temporary
// coupling that dissolves at the PR4 flip; warm lens + upload land in PR2.

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
import { FeedHero } from "@/app/(feed)/_components/market/FeedHero";
import { buildFeedListQuery } from "@/app/(feed)/_components/feed-query";
import { MergedShell } from "../_components/MergedShell";

export const dynamic = "force-dynamic";

const mergedNav: NavItem[] = [
  { label: "класичний фід", href: "/" },
  { label: "моніторинг", href: "/dashboard" },
  { label: "про проєкт", href: "/welcome" },
];

export default async function MergedPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;

  const trackSlug = slug?.[0];

  const [aggregates, { tracks }] = await Promise.all([
    aggregatesApi.get(),
    tracksApi.get(),
  ]);

  if (trackSlug && !tracks.some((t) => t.slug === trackSlug)) {
    notFound();
  }

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
    facetsApi.domains().catch(() => ({ domains: [] })),
  ]);

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
      <Header links={mergedNav} />
      <main className="flex min-h-screen flex-col bg-bg">
        {/* No pipeline intro here: the merged landing leads with the lens
            tabs + tracks, and the feed's 3-card pipeline overflows at tablet. */}
        <FeedHero aggregates={aggregates} showPipeline={false} />
        <div className="mx-auto w-full max-w-7xl px-6 pb-20 lg:px-12">
          <HydrationBoundary state={dehydrate(queryClient)}>
            <MergedShell
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
