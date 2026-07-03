import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";

import {
  readerFrom,
  readFilterState,
} from "@/features/vacancy-filters/url-params";
import {
  fetchMatch,
  type WarmSource,
} from "@/features/vacancy-filters/warm-query";
import { warmKey } from "@/features/vacancy-filters/query-keys";
import { ReverseAtsClient } from "./_components/ReverseAtsClient";
import { SAMPLES } from "./_components/samples";

export const dynamic = "force-dynamic";

// Server-seed the first sample's ranking under the URL's filters so the page
// lands on real results (SSR, no loading flash) and a shared/deep link renders
// filtered. Dehydrated under the SAME key the client computes, so it hydrates
// from cache without a mount refetch; the client island drives the rest.
export default async function ReverseAtsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = readFilterState(readerFrom(await searchParams));
  const source: WarmSource = { kind: "sample", skills: SAMPLES[0].skills };
  const queryClient = new QueryClient();
  try {
    queryClient.setQueryData(
      warmKey(source, filters, 1),
      await fetchMatch(source, filters, 1),
    );
  } catch {
    // backend down → no seed; the client shows its loading→error/empty state.
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <ReverseAtsClient />
    </HydrationBoundary>
  );
}
