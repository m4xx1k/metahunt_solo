import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";

import { cvApi } from "@/lib/api/cv";
import { facetsApi } from "@/lib/api/facets";
import {
  readerFrom,
  readFilterState,
} from "@/features/vacancy-filters/url-params";
import { fetchMatch } from "@/features/vacancy-filters/warm-query";
import { warmKey } from "@/features/vacancy-filters/query-keys";
import type { OptionRow } from "@/features/vacancy-filters/types";
import { ReverseAtsClient } from "./_components/ReverseAtsClient";

export const dynamic = "force-dynamic";

// Server-seed the first sample's ranking under the URL's filters so the page
// lands on real results (SSR, no loading flash) and a shared/deep link renders
// filtered. Samples + the domain catalog are the filter-independent props; the
// seed is dehydrated under the SAME key the client computes, so it hydrates from
// cache without a mount refetch. The client island drives the rest.
export default async function ReverseAtsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = readFilterState(readerFrom(await searchParams));

  const [samples, { domains }] = await Promise.all([
    cvApi.samples().catch(() => []),
    // Tolerate a missing /feed/domains during a deploy gap (mirrors the feed).
    facetsApi.domains().catch(() => ({ domains: [] })),
  ]);
  const domainOptions: OptionRow[] = domains.map((d) => ({
    id: d.id,
    label: d.name,
    count: d.count,
  }));

  const queryClient = new QueryClient();
  if (samples[0]) {
    try {
      queryClient.setQueryData(
        warmKey(samples[0].candidateId, filters, 1),
        await fetchMatch(samples[0].candidateId, filters, 1),
      );
    } catch {
      // backend down → no seed; the client shows its loading→error/empty state.
    }
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <ReverseAtsClient samples={samples} domainOptions={domainOptions} />
    </HydrationBoundary>
  );
}
