import { rankingApi, type MatchResponse } from "@/lib/api/ranking";
import { ReverseAtsClient } from "./_components/ReverseAtsClient";
import { SAMPLES } from "./_components/samples";

export const dynamic = "force-dynamic";

// Server-fetch the first sample's ranking so the page lands on real results
// (SSR, no loading flash). The client island drives everything after that.
export default async function ReverseAtsPage() {
  let initial: MatchResponse | null = null;
  try {
    initial = await rankingApi.match({ skills: SAMPLES[0].skills, pageSize: 20 });
  } catch {
    initial = null; // backend down → client shows the error/empty state
  }
  return <ReverseAtsClient initial={initial} />;
}
