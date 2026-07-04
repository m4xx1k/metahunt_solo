import type { VacancyAggregates } from "@/lib/api/aggregates";
import { PipelineCard } from "./PipelineCard";
import { SourcesVisual, ExtractVisual, MatchVisual } from "./Visuals";
import { pipeline } from "./data";

// The 3-stage explainer (Збір → Розбір → Підбір). Renders just the cards row —
// no section/background of its own; it lives inside the feed's intro block
// (Snapshot) so the whole "what is this" story reads as one piece.
// `matchCta` overrides the Match step's default link (used by /merged to open
// the CV picker via a window event instead of navigating to reverse-ATS).
export function Pipeline({
  aggregates,
  matchCta,
}: {
  aggregates: VacancyAggregates;
  matchCta?: { label: string; event: string };
}) {
  const { collect, parse, match } = pipeline.steps;

  return (
    <div className="flex flex-col items-stretch gap-4 xl:flex-row xl:justify-center xl:gap-0">
      <PipelineCard {...collect} index={0}>
        <SourcesVisual sources={aggregates.sources} accent={collect.accent} />
      </PipelineCard>

      <Connector />

      <PipelineCard {...parse} index={1}>
        <ExtractVisual fields={pipeline.extracted} accent={parse.accent} />
      </PipelineCard>

      <Connector />

      <PipelineCard {...match} index={2} ctaEvent={matchCta}>
        <MatchVisual match={pipeline.match} accent={match.accent} />
      </PipelineCard>
    </div>
  );
}

function Connector() {
  return (
    <div
      aria-hidden
      className="hidden items-center px-4 font-mono text-2xl text-text-muted xl:flex"
    >
      →
    </div>
  );
}
