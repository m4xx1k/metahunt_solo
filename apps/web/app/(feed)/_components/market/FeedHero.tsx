import Link from "next/link";

import type { VacancyAggregates } from "@/lib/api/aggregates";
import { Tag, Divider } from "@/ui";
import { TotalCounter } from "./TotalCounter";
import { HowItWorks } from "../how/HowItWorks";

// Intro / hero for the feed. One cohesive block (no separate background band):
// the headline + live counter say *what this is*, and the 3-stage pipeline
// below says *how it works* (Collect → Parse → Match). The pipeline only shows
// on the bare index (`showPipeline`), not on track pages. The old stat widgets
// (TopSkills / SeniorityBars / …) were deleted as unrendered dead code — git
// history has them if a stats band ever comes back.

type Props = {
  aggregates: VacancyAggregates;
  showPipeline?: boolean;
  /** Overrides the pipeline's Match CTA (merged: open the CV picker). */
  matchCta?: { label: string; event: string };
};

export function FeedHero({ aggregates: a, showPipeline = false, matchCta }: Props) {
  return (
    <section className="mx-auto flex w-full max-w-7xl flex-col gap-10 px-6 pt-16 pb-10 md:px-12">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-[3fr_2fr] md:items-stretch">
        <div className="flex flex-col justify-center gap-5">
          <h1 className="font-display text-4xl font-bold leading-tight tracking-tight text-text-primary md:text-5xl">
            Ukrainian tech jobs — <span className="text-accent">in one list</span>.
          </h1>
          <p className="max-w-[560px] font-body text-base leading-[1.55] text-text-secondary md:text-lg">
            We pull from every source, structure it with AI, and match it to
            your CV.
          </p>
          <Link
            href="/how-it-works"
            className="w-fit font-mono text-xs uppercase tracking-wider text-text-muted underline-offset-4 transition-colors hover:text-accent hover:underline"
          >
            &gt; how it works
          </Link>
        </div>
        <TotalCounter
          total={a.total}
          lastSyncAt={a.lastSyncAt}
          sources={a.sources}
        />
      </div>

      {showPipeline && (
        <div className="flex flex-col gap-6">
          <div className="flex justify-center">
            <Tag>{"> how it works"}</Tag>
          </div>
          <HowItWorks aggregates={a} matchCta={matchCta} />
        </div>
      )}

      <Divider className="mt-2" />
    </section>
  );
}
