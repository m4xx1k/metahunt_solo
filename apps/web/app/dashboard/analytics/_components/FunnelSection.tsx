import type { AnalyticsPageFunnelStep } from "@/lib/api/analytics-page";
import { formatCount, formatPercent } from "@/lib/format";
import { MeterRow } from "@/ui/data/MeterRow";
import { StatCard } from "@/ui/data/StatCard";
import { Panel } from "@/ui/layout/Panel";
import { InfoHint } from "@/ui/overlay/InfoHint";

// This is a step-presence funnel: subscription_created can bypass the web form.
export function FunnelSection({
  funnel,
  ctaClicks,
}: {
  funnel: AnalyticsPageFunnelStep[];
  ctaClicks: number;
}) {
  const baseline = funnel[0]?.people ?? 0;

  return (
    <Panel title="Funnel" meta="visited → started → handoff → linked" scope="period">
      <div className="grid gap-5 lg:grid-cols-[1fr_auto]">
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
        <div className="flex flex-col gap-1.5">
          <StatCard
            label="CTA clicks"
            value={formatCount(ctaClicks)}
            hint={
              <span className="inline-flex items-center gap-1.5">
                not a funnel step
                <InfoHint label="why cta clicks sits outside the funnel">
                  landing_cta_clicked people. Not a funnel step — fewer people fire it than reach
                  the form, so gating on it would undercount.
                </InfoHint>
              </span>
            }
            className="min-w-[180px]"
          />
        </div>
      </div>
    </Panel>
  );
}
