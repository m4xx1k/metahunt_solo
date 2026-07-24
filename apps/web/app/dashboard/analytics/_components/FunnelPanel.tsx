import type { ProductAnalyticsOverview } from "@/lib/api/product-analytics";
import { eventLabel } from "@/entities/analytics/event-labels";
import { formatCount, formatPercent } from "@/lib/format";
import { MeterRow } from "@/ui/data/MeterRow";
import { EmptyState } from "@/ui/feedback/EmptyState";
import { Panel } from "@/ui/layout/Panel";
import { InfoHint } from "@/ui/overlay/InfoHint";
import { StackedBar } from "@/ui/charts/StackedBar";

type Props = {
  funnel: ProductAnalyticsOverview["funnel"];
  feedEngagement: ProductAnalyticsOverview["feedEngagement"];
  population: string;
};

// Funnel steps are a magnitude, not an identity — one hue ramped light→dark so
// earlier/bigger stages read brighter, instead of N categorical colors.
function segmentsFor(funnel: Props["funnel"]) {
  return funnel.map((step, index) => {
    const t = funnel.length > 1 ? index / (funnel.length - 1) : 0;
    return {
      value: step.journeys,
      label: eventLabel(step.name),
      color: `color-mix(in srgb, var(--color-accent) ${Math.round(100 - t * 70)}%, var(--color-bg-card))`,
    };
  });
}

export function FunnelPanel({ funnel, feedEngagement, population }: Props) {
  const entry = funnel[0]?.journeys ?? 0;
  const total = funnel.reduce((sum, step) => sum + step.journeys, 0);

  if (entry === 0) {
    return (
      <Panel title="Funnel" meta={population}>
        <EmptyState
          title="no journeys in this period"
          hint="widen the period, or switch population to all traffic."
        />
      </Panel>
    );
  }

  return (
    <Panel
      title="Funnel"
      meta={`${population} · independent per step`}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1.5 font-mono text-2xs uppercase tracking-[0.12em] text-text-muted">
            feed clicks
            <InfoHint label="what feed clicks mean">
              Job clicks in the web feed (apply_clicked). Not a step of the chain above — a feed
              click needs no subscription, so it is tracked as its own number.
            </InfoHint>
          </span>
          <span className="font-display text-sm font-bold text-text-primary">
            {formatCount(feedEngagement.journeys)}
            <span className="pl-2 font-mono text-xs font-normal text-text-muted">
              journeys · {formatCount(feedEngagement.events)} clicks
            </span>
          </span>
        </div>
      }
    >
      <StackedBar
        segments={segmentsFor(funnel)}
        total={total}
        height={24}
        ariaLabel="journey volume per funnel step, in chronological order"
      />
      <div className="flex flex-col gap-4 pt-2">
        {funnel.map((step, index) => {
          const previous = index === 0 ? step.journeys : funnel[index - 1].journeys;
          return (
            <MeterRow
              key={step.name}
              label={eventLabel(step.name)}
              value={`${formatCount(step.journeys)} · ${formatPercent(step.journeys, previous)}`}
              pct={(step.journeys / entry) * 100}
              tone={index === 0 ? "neutral" : "accent"}
            />
          );
        })}
      </div>
    </Panel>
  );
}
