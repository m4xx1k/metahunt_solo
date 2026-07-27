import type { ProductFunnelStep } from "@/lib/api/product-analytics";
import { eventLabel } from "@/entities/analytics/event-labels";
import { formatPercent } from "@/lib/format";
import { MeterRow } from "@/ui/data/MeterRow";
import { EmptyState } from "@/ui/feedback/EmptyState";
import { Panel } from "@/ui/layout/Panel";

// The funnel is monotonic by construction, so the worst step-to-step drop IS
// the thing to work on next. Finding it by eye across four rows is exactly the
// job the screen should be doing instead of the operator.
function worstDrop(funnel: ProductFunnelStep[]): { index: number; lost: number } | null {
  let worst: { index: number; lost: number } | null = null;
  for (let index = 1; index < funnel.length; index += 1) {
    const lost = funnel[index - 1].journeys - funnel[index].journeys;
    if (lost > 0 && (!worst || lost > worst.lost)) worst = { index, lost };
  }
  return worst;
}

export function LeakPanel({ funnel }: { funnel: ProductFunnelStep[] }) {
  const entry = funnel[0]?.journeys ?? 0;

  if (entry === 0) {
    return (
      <Panel title="Biggest leak" scope="period">
        <EmptyState title="no journeys yet" hint="widen the period." />
      </Panel>
    );
  }

  const worst = worstDrop(funnel);
  const worstLabel = worst ? eventLabel(funnel[worst.index].name) : null;

  return (
    <Panel
      title="Biggest leak"
      meta={worst ? `fix ${worstLabel}` : "no drop-off"}
      scope="period"
      footer={
        worst ? (
          <span className="text-text-secondary">
            {worst.lost} lost entering <span className="text-danger">{worstLabel}</span> — the
            widest gap in the chain.
          </span>
        ) : (
          <span className="text-text-muted">every step holds.</span>
        )
      }
    >
      <div className="flex flex-col gap-4">
        {funnel.map((step, index) => (
          <MeterRow
            key={step.name}
            label={eventLabel(step.name)}
            value={`${step.journeys} · ${formatPercent(step.journeys, entry)}`}
            pct={(step.journeys / entry) * 100}
            tone={worst?.index === index ? "danger" : index === 0 ? "neutral" : "accent"}
          />
        ))}
      </div>
    </Panel>
  );
}
