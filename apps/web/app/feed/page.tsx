import type { Metadata } from "next";
import { Suspense } from "react";
import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";

import { Footer } from "@/app/_components/Footer";
import { Header } from "@/app/_components/Header";
import { HeaderAuth } from "@/features/auth/header-auth";
import { coldKey } from "@/features/vacancy-filters/query-keys";
import { readerFrom, readFilterState } from "@/features/vacancy-filters/url-params";
import { cvApi } from "@/lib/api/cv";
import { facetsApi } from "@/lib/api/facets";
import { vacanciesApi } from "@/lib/api/vacancies";
import { pageMetadata } from "@/lib/seo/metadata";
import { Tag } from "@/ui";

import { FeedLabShell } from "./_components/FeedLabShell";
import { toLabColdQuery } from "./_components/lab-query";

export const dynamic = "force-dynamic";

// A lab route, not a finished page — hidden from search until it earns a place.
// Deliberately NOT also disallowed in robots.txt: blocking the crawl would stop
// Google from ever seeing this noindex, which is how a page ends up indexed
// without a snippet. Same reasoning as /match.
export const metadata: Metadata = pageMetadata({
  noindex: true,
  title: "Feed with fit scores",
  description:
    "Every job with a Fit % against your CV, sortable by fit or by date. An experiment on top of the metahunt feed.",
  path: "/feed",
});

export default async function FeedLabPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const filters = readFilterState(readerFrom(sp));

  const [{ roles }, { domains }, samples] = await Promise.all([
    facetsApi.roles().catch(() => ({ roles: [] })),
    facetsApi.domains().catch(() => ({ domains: [] })),
    cvApi.samples().catch(() => []),
  ]);

  // Seed first paint with the real list — always the unified path (MET-144
  // step 7: this route has no `?cv=`, only `?sample=` against an allowlisted
  // seeded candidate). Must match FeedLabShell's own resolution exactly.
  const rawSample = typeof sp.sample === "string" ? sp.sample : null;
  const sample =
    rawSample && samples.some((s) => s.candidateId === rawSample) ? rawSample : undefined;
  const queryClient = new QueryClient();
  try {
    const query = toLabColdQuery(filters, 1, sample);
    queryClient.setQueryData(coldKey(query), await vacanciesApi.list(query));
  } catch {
    /* no seed — the client fetches it */
  }

  return (
    <>
      <Header cta={<HeaderAuth />} />
      <main className="page-dot-grid flex min-h-screen flex-col bg-bg">
        <section className="border-b border-border px-6 py-10 md:px-12">
          <div className="mx-auto flex w-full max-w-[1536px] flex-col items-start gap-3">
            <Tag>&gt; LAB · FIT SCORES</Tag>
            <h1 className="font-display text-3xl font-black tracking-tight text-text-primary">
              Every job, with a number on it.
            </h1>
            <p className="max-w-[680px] text-text-secondary">
              The same feed, scored against your CV: Fit % on every card, sorted by fit or by date.
              Without a CV the number stays locked.
            </p>
          </div>
        </section>

        <div className="mx-auto w-full max-w-[1536px] px-6 py-8 lg:px-12">
          <HydrationBoundary state={dehydrate(queryClient)}>
            <Suspense fallback={null}>
              <FeedLabShell
                roleOptions={roles.map((r) => ({ id: r.id, label: r.name, count: r.count ?? 0 }))}
                domainOptions={domains.map((d) => ({
                  id: d.id,
                  label: d.name,
                  count: d.count ?? 0,
                }))}
                samples={samples}
              />
            </Suspense>
          </HydrationBoundary>
        </div>
      </main>
      <Footer />
    </>
  );
}
