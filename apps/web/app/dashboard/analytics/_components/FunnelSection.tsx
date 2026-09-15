import type { AnalyticsPageFunnelStep } from "@/lib/api/analytics-page";
import { formatCount, formatPercent } from "@/lib/format";
import { MeterRow } from "@/ui/data/MeterRow";
import { Panel } from "@/ui/layout/Panel";
import { HintText } from "@/ui/overlay/InfoHint";

// This is a step-presence funnel: subscription_created can bypass the web form.
export function FunnelSection({ funnel }: { funnel: AnalyticsPageFunnelStep[] }) {
  const baseline = funnel[0]?.people ?? 0;

  return (
    <Panel
      title="Funnel"
      meta={
        <HintText label="how to read this funnel" text="visited → started → linked">
          Each step counts people who fired that event anywhere in the period, not a strict sequence
          — a subscription created by the bot can skip the web form.
        </HintText>
      }
      scope="period"
    >
      <div className="flex flex-col gap-4">
        {funnel.map((step, index) => {
          const prev = funnel[index - 1];
          const pct = baseline > 0 ? (step.people / baseline) * 100 : 0;
          return (
            <MeterRow
              key={step.step}
              label={step.label}
              value={
                <>
                  {formatCount(step.people)}
                  {prev ? (
                    <span className="pl-2 text-text-muted">
                      · {formatPercent(step.people, prev.people)} of {prev.label}
                    </span>
                  ) : null}
                </>
              }
              pct={pct}
              tone={index === 0 ? "neutral" : "accent"}
            />
          );
        })}
      </div>
    </Panel>
  );
}
