import type { ProductFunnelStep } from "@/lib/api/product-analytics";
import { eventLabel } from "@/entities/analytics/event-labels";
import { formatCount, formatPercent } from "@/lib/format";
import { EmptyState } from "@/ui/feedback/EmptyState";
import { MeterRow } from "@/ui/data/MeterRow";
import { Panel } from "@/ui/layout/Panel";
import { PanelLink } from "@/ui/navigation/PanelLink";

// Landing → Telegram in five rows. The full per-step ledger lives on
// /dashboard/analytics; this is only the shape of the drop-off.
export function ActivationPanel({
  funnel,
  period,
}: {
  funnel: ProductFunnelStep[];
  period: string;
}) {
  const entry = funnel[0]?.journeys ?? 0;

  return (
    <Panel title="Activation" meta={period}>
      {entry === 0 ? (
        <EmptyState title="no journeys yet" hint="nobody entered the funnel in this period." />
      ) : (
        <div className="flex flex-col gap-4">
          {funnel.slice(0, 5).map((step, index) => {
            const previous = index === 0 ? step.journeys : funnel[index - 1].journeys;
            return (
              <MeterRow
                key={step.name}
                label={eventLabel(step.name)}
                value={formatCount(step.journeys)}
                pct={(step.journeys / entry) * 100}
                note={index === 0 ? undefined : `${formatPercent(step.journeys, previous)} of prev`}
                tone={index === 0 ? "neutral" : "accent"}
              />
            );
          })}
        </div>
      )}
      <div className="mt-auto pt-2">
        <PanelLink href="/dashboard/analytics">analytics</PanelLink>
      </div>
    </Panel>
  );
}
