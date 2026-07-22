// The home feed. Cold = the market feed body (<FeedShell>); warm (?cv) = the
// ranked list under a CV, seeded server-side so a shared /?cv=X link renders
// warm on first paint. The lens is derived from ?cv inside <FeedLensShell>.

import { notFound } from "next/navigation";
import { unstable_cache } from "next/cache";
import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";

import { Header } from "@/app/_components/Header";
import { Footer } from "@/app/_components/Footer";
import { HeaderAuth } from "@/features/auth/header-auth";
import { aggregatesApi } from "@/lib/api/aggregates";
import { tracksApi } from "@/lib/api/tracks";
import { facetsApi } from "@/lib/api/facets";
import { vacanciesApi } from "@/lib/api/vacancies";
import { cvApi } from "@/lib/api/cv";
import { readerFrom, readFilterState } from "@/features/vacancy-filters/url-params";
import { coldKey, warmKey } from "@/features/vacancy-filters/query-keys";
import { fetchMatch } from "@/features/vacancy-filters/warm-query";
import { FeedHero } from "@/app/(feed)/_components/market/FeedHero";
import { buildFeedListQuery } from "@/app/(feed)/_components/feed-query";
import { FeedLensShell } from "../_components/FeedLensShell";

export const dynamic = "force-dynamic";

// force-dynamic makes every fetch no-store, so these hourly-changing catalogs hit
// the ETL each request. Cache them in the Data Cache (the list + ?cv seed below
// stay live, per-request).
const CATALOG_TTL = 3600;
const getAggregates = unstable_cache(() => aggregatesApi.get(), ["feed:aggregates"], {
  revalidate: CATALOG_TTL,
});
const getTracks = unstable_cache(() => tracksApi.get(), ["feed:tracks"], {
  revalidate: CATALOG_TTL,
});
const getRoleCatalog = unstable_cache(() => facetsApi.roles(), ["feed:facets-roles"], {
  revalidate: CATALOG_TTL,
});
const getSkillCatalog = unstable_cache(() => facetsApi.skills(), ["feed:facets-skills"], {
  revalidate: CATALOG_TTL,
});
const getDomainCatalog = unstable_cache(() => facetsApi.domains(), ["feed:facets-domains"], {
  revalidate: CATALOG_TTL,
});
const getSamples = unstable_cache(() => cvApi.samples(), ["feed:cv-samples"], {
  revalidate: CATALOG_TTL,
});
const getTrackPreset = unstable_cache((s: string) => tracksApi.preset(s), ["feed:track-preset"], {
  revalidate: CATALOG_TTL,
});
const getTrackSkills = unstable_cache((s: string) => tracksApi.skills(s), ["feed:track-skills"], {
  revalidate: CATALOG_TTL,
});

export default async function FeedPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;

  const trackSlug = slug?.[0];

  const [aggregates, { tracks }] = await Promise.all([getAggregates(), getTracks()]);

  if (trackSlug && !tracks.some((t) => t.slug === trackSlug)) {
    notFound();
  }

  const [
    preset,
    { skills: contextualSkills },
    { roles: roleCatalog },
    { skills: skillCatalog },
    { domains: domainCatalog },
    samples,
  ] = await Promise.all([
    trackSlug ? getTrackPreset(trackSlug) : Promise.resolve({ roles: [], skills: [] }),
    trackSlug ? getTrackSkills(trackSlug) : Promise.resolve({ skills: [] }),
    getRoleCatalog(),
    getSkillCatalog(),
    getDomainCatalog().catch(() => ({ domains: [] })),
    getSamples().catch(() => []),
  ]);

  const domainOptions = domainCatalog.map((d) => ({
    id: d.id,
    label: d.name,
    count: d.count,
  }));

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

  // Warm seed: a shared /?cv=X link should render ranked on first paint.
  // Tolerate a bad id / backend gap — the client degrades to an empty warm list.
  const cv = typeof sp.cv === "string" ? sp.cv : null;
  if (cv) {
    const filters = readFilterState(readerFrom(sp));
    const isSample = samples.some((sample) => sample.candidateId === cv);
    try {
      queryClient.setQueryData(warmKey(cv, filters, 1), await fetchMatch(cv, filters, 1, isSample));
    } catch {
      /* no seed */
    }
  }

  return (
    <>
      <Header cta={<HeaderAuth />} />
      <main
        className="flex min-h-screen flex-col bg-bg"
        style={{
          backgroundImage:
            "radial-gradient(60% 50% at 50% 0%, rgba(255,179,128,0.08), transparent 70%), radial-gradient(var(--color-border) 1px, transparent 1px)",
          backgroundSize: "auto, 22px 22px",
        }}
      >
        <FeedHero
          aggregates={aggregates}
          showPipeline={!trackSlug}
          matchCta={{ label: "Upload your CV", event: "feed:upload-cv" }}
          samples={samples}
        />
        <div className="mx-auto w-full max-w-[1536px] px-6 pb-24 sm:pb-20 lg:px-12">
          <HydrationBoundary state={dehydrate(queryClient)}>
            <FeedLensShell
              aggregates={aggregates}
              tracks={tracks}
              activeTrackSlug={trackSlug ?? null}
              presetRoles={preset.roles}
              presetSkills={preset.skills}
              contextualSkills={contextualSkills}
              roleCatalog={roleCatalog}
              skillCatalog={skillCatalog}
              domainCatalog={domainCatalog}
              domainOptions={domainOptions}
              samples={samples}
            />
          </HydrationBoundary>
        </div>
      </main>
      <Footer />
    </>
  );
}
