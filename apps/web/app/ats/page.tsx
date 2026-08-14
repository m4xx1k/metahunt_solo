import type { Metadata } from "next";

import { Footer } from "@/app/_components/Footer";
import { Header } from "@/app/_components/Header";
import { atsApi, type AtsStatus } from "@/lib/api/ats";
import { formatCount } from "@/lib/format";
import {
  booleanSearchParam,
  firstSearchParam,
  flattenSearchParams,
  nonNegativeIntegerSearchParam,
} from "@/lib/search-params";
import { pageMetadata } from "@/lib/seo/metadata";
import { EmptyState } from "@/ui/feedback/EmptyState";
import { FilterToggles } from "@/ui/inputs/FilterToggles";
import { UrlSearch } from "@/ui/inputs/UrlSearch";
import { PageBody } from "@/ui/layout/PageBody";
import { PageHeader } from "@/ui/layout/PageHeader";
import { Pagination } from "@/ui/navigation/Pagination";
import { UrlSegments } from "@/ui/navigation/UrlSegments";

import { AtsJobCard } from "./_components/AtsJobCard";
import { AtsSummary } from "./_components/AtsSummary";

export const dynamic = "force-dynamic";
export const metadata: Metadata = pageMetadata({
  title: "ATS vacancies · local operator view",
  description: "Local review surface for direct ATS vacancies and board quality.",
  path: "/ats",
});

const PAGE_SIZE = 25;
const STATUS_OPTIONS: Array<{ value: AtsStatus; label: string }> = [
  { value: "open", label: "open" },
  { value: "all", label: "all" },
  { value: "closed", label: "closed" },
];

function statusFrom(value: string | undefined): AtsStatus {
  return value === "all" || value === "closed" ? value : "open";
}

export default async function AtsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const offset = nonNegativeIntegerSearchParam(sp.offset);
  const q = firstSearchParam(sp.q);
  const status = statusFrom(firstSearchParam(sp.status));
  const uaOnly = booleanSearchParam(sp.uaOnly);
  const remoteOnly = booleanSearchParam(sp.remoteOnly);
  const reviewOnly = booleanSearchParam(sp.reviewOnly);
  const flatSearchParams = flattenSearchParams(sp);

  let result: Awaited<ReturnType<typeof atsApi.jobs>> | null = null;
  let overview: Awaited<ReturnType<typeof atsApi.overview>> | null = null;
  let error: Error | null = null;
  try {
    [result, overview] = await Promise.all([
      atsApi.jobs({ q, status, uaOnly, remoteOnly, reviewOnly, limit: PAGE_SIZE, offset }),
      atsApi.overview(),
    ]);
  } catch (caught) {
    error = caught instanceof Error ? caught : new Error("ATS API request failed");
  }

  return (
    <>
      <Header links={[{ label: "all vacancies", href: "/" }]} cta={null} />
      <PageHeader
        title="ATS vacancies"
        hint="local source-posting review · direct company boards"
        actions={
          <>
            <UrlSegments
              param="status"
              value={status}
              defaultValue="open"
              options={STATUS_OPTIONS}
              label="vacancy status"
            />
            <UrlSearch placeholder="title or company…" />
          </>
        }
      />
      <PageBody>
        {error ? (
          <EmptyState
            title="ATS API or database is unavailable"
            hint={`${error.message} Start the ATS POC API and check DATABASE_URL; a failed request is intentionally not shown as an empty corpus.`}
            tone="danger"
          />
        ) : result && overview ? (
          <>
            <AtsSummary overview={overview} />
            <FilterToggles
              basePath="/ats"
              searchParams={flatSearchParams}
              toggles={[
                { key: "uaOnly", offLabel: "all locations", onLabel: "Ukraine", active: uaOnly },
                {
                  key: "remoteOnly",
                  offLabel: "all work modes",
                  onLabel: "remote",
                  active: remoteOnly,
                },
                {
                  key: "reviewOnly",
                  offLabel: "all quality",
                  onLabel: "needs review",
                  active: reviewOnly,
                },
              ]}
            />
            <p className="font-mono text-xs text-text-muted">
              {formatCount(result.total)} postings match the current filters.
            </p>
            {result.items.length === 0 ? (
              <EmptyState
                title="no ATS postings match these filters"
                hint="The API responded successfully. Clear a filter or switch the status to inspect the loaded corpus."
              />
            ) : (
              <section className="flex flex-col gap-3" aria-label="ATS vacancy postings">
                {result.items.map((job) => (
                  <AtsJobCard key={job.id} job={job} />
                ))}
              </section>
            )}
            <Pagination
              total={result.total}
              limit={result.limit}
              offset={result.offset}
              basePath="/ats"
              searchParams={flatSearchParams}
            />
          </>
        ) : null}
      </PageBody>
      <Footer />
    </>
  );
}
