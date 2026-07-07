import Link from "next/link";

import type { VacancyAggregates } from "@/lib/api/aggregates";
import { CollectStage } from "./CollectStage";
import { ParseStage } from "./ParseStage";
import { MatchStage } from "./MatchStage";
import { StageCard, Connector } from "./StageCard";
import { UploadCta } from "./UploadCta";

// The animated 3-stage explainer (Collect → Parse → Match); each card deep-links
// to /how-it-works. `matchCta` (bare index only) adds the upload-CV button.
export function HowItWorks({
  aggregates,
  matchCta,
}: {
  aggregates: VacancyAggregates;
  matchCta?: { label: string; event: string };
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-stretch gap-2 md:flex-row md:gap-0">
        <StageCard
          n="01"
          label="collect"
          sub="every source falls into one place"
          href="/how-it-works#collect"
        >
          <CollectStage total={aggregates.total} />
        </StageCard>
        <Connector />
        <StageCard
          n="02"
          label="parse"
          sub="an llm reads it, we get structure"
          href="/how-it-works#parse"
        >
          <ParseStage />
        </StageCard>
        <Connector />
        <StageCard
          n="03"
          label="match"
          sub="your skills → the market, ranked"
          href="/how-it-works#match"
        >
          <MatchStage />
        </StageCard>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
        {matchCta ? <UploadCta label={matchCta.label} event={matchCta.event} /> : null}
        <Link
          href="/how-it-works"
          className="font-mono text-xs text-text-secondary underline-offset-4 transition-colors hover:text-accent hover:underline"
        >
          see the full breakdown →
        </Link>
      </div>
    </div>
  );
}
