// The home feed. Cold = the market feed body (<FeedShell>); warm = the ranked
// list under a candidate — a real signed-in viewer's active CV (never a URL
// param, MET-144 step 7) or an allowlisted `?sample=`. Only a sample seeds
// server-side: a real CV's identity depends on the JWT, and the warm lens
// never auto-opens for a returning CV owner (mirrors the pre-existing UX —
// the CV tab still needs an explicit click), so there is nothing to seed for
// it on an ordinary page load. The lens itself is derived inside
// <FeedLensShell>.

import type { Metadata } from "next";
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
import { fetchMatch, HOME_INCLUDE_OFF_STACK } from "@/features/vacancy-filters/warm-query";
import { FeedHero } from "@/app/(feed)/_components/market/FeedHero";
import { TrackIntro } from "@/app/(feed)/_components/market/TrackIntro";
import { TrackPicker } from "@/app/(feed)/_components/market/TrackPicker";
import { HowItWorks } from "@/app/(feed)/_components/how/HowItWorks";
import { buildFeedListQuery } from "@/app/(feed)/_components/feed-query";
import {
  FEED_INDEX_DESCRIPTION,
  FEED_INDEX_TITLE,
  trackDescription,
  trackTitle,
} from "@/lib/seo/feed-meta";
import { JsonLd } from "@/lib/seo/json-ld";
import { pageMetadata } from "@/lib/seo/metadata";
import { organizationJsonLd, webSiteJsonLd } from "@/lib/seo/organization";
import { FeedLensShell } from "../_components/FeedLensShell";

export const dynamic = "force-dynamic";

// force-dynamic makes every fetch no-store, so these hourly-changing catalogs hit
// the ETL each request. Cache them in the Data Cache (the list + ?sample seed
// below stay live, per-request).
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

// One file serves the index and ~40 track slugs. Without per-track metadata all
// of them shipped the same title, description and (missing) canonical, so they
// competed with each other instead of ranking.
export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ slug?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const trackSlug = slug?.[0];
  // `?sample` renders a demo preview, not the canonical page — noindex so it
  // never competes with (or dilutes) the base URL in search.
  const noindex = typeof sp.sample === "string" && sp.sample.length > 0;

  if (!trackSlug) {
    return pageMetadata({
      title: FEED_INDEX_TITLE,
      description: FEED_INDEX_DESCRIPTION,
      path: "/",
      absoluteTitle: true,
      noindex,
    });
  }

  const { tracks } = await getTracks();
  const track = tracks.find((t) => t.slug === trackSlug);
  if (!track) return {};

  return pageMetadata({
    title: trackTitle(track.label),
    description: trackDescription(track),
    path: `/${trackSlug}`,
    noindex,
  });
}

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

  const track = trackSlug ? (tracks.find((t) => t.slug === trackSlug) ?? null) : null;
  if (trackSlug && !track) {
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

  // Warm seed: a shared /?sample=X link should render ranked on first paint.
  // Tolerate a bad id / backend gap — the client degrades to an empty warm list.
  const rawSample = typeof sp.sample === "string" ? sp.sample : null;
  const sample = rawSample && samples.some((s) => s.candidateId === rawSample) ? rawSample : null;
  if (sample) {
    const filters = readFilterState(readerFrom(sp));
    try {
      queryClient.setQueryData(
        warmKey(sample, filters, 1, HOME_INCLUDE_OFF_STACK),
        await fetchMatch(sample, filters, 1, true, HOME_INCLUDE_OFF_STACK),
      );
    } catch {
      /* no seed */
    }
  }

  return (
    <>
      {/* Organisation markup belongs on the single most representative page. */}
      {!track ? (
        <>
          <JsonLd data={organizationJsonLd()} />
          <JsonLd data={webSiteJsonLd()} />
        </>
      ) : null}
      <Header cta={<HeaderAuth />} />
      <main className="page-dot-grid flex min-h-screen flex-col bg-bg">
        <FeedHero
          aggregates={aggregates}
          heading={
            track
              ? {
                  title: trackTitle(track.label),
                  subtitle: "Свіжі вакансії з DOU і Djinni. Дублі згорнуті, фільтри поруч.",
                }
              : undefined
          }
        />
        {track ? <TrackIntro track={track} /> : null}
        {!track ? (
          <TrackPicker
            key={trackSlug ?? "all"}
            tracks={tracks}
            activeSlug={trackSlug ?? null}
            lastSyncAt={aggregates.lastSyncAt}
          />
        ) : null}
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
        {!track ? (
          <section className="border-t border-border px-6 py-16 md:px-12 md:py-20">
            <div className="mx-auto flex w-full max-w-[1536px] flex-col gap-6">
              <p className="font-mono text-2xs uppercase tracking-[0.18em] text-text-muted">
                &gt; як це працює
              </p>
              <HowItWorks
                aggregates={aggregates}
                matchCta={{ label: "Завантажити резюме", event: "feed:upload-cv" }}
              />
            </div>
          </section>
        ) : null}
      </main>
      <Footer />
    </>
  );
}
