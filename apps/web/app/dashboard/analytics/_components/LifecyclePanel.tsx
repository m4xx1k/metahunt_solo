import type { ProductSubscriberStates } from "@/lib/api/product-analytics";
import { formatCount, formatPercent } from "@/lib/format";
import { StatCard } from "@/ui/data/StatCard";
import { StatGrid } from "@/ui/data/StatGrid";
import { HintText } from "@/ui/overlay/InfoHint";

// Lifecycle STATE, not movement: every linked chat is in exactly one of these,
// all-time, so the three add up to the whole subscriber base.
export function LifecyclePanel({ states }: { states: ProductSubscriberStates }) {
  const total = states.active + states.dormant + states.churned;
  return (
    <StatGrid cols={3}>
      <StatCard
        label="active"
        value={formatCount(states.active)}
        hint={
          <HintText
            label="how active is defined"
            text={`${formatPercent(states.active, total)} of subscribers`}
          >
            Has at least one active subscription and isn&rsquo;t dormant.
          </HintText>
        }
      />
      <StatCard
        label="asleep"
        value={formatCount(states.dormant)}
        tone={states.dormant > 0 ? "accent" : "default"}
        hint={
          <HintText label="how asleep is defined" text="digests land, nobody answers">
            Active subscription, ≥3 digests sent in the last 14 days, 0 actions in the same window.
          </HintText>
        }
      />
      <StatCard
        label="off"
        value={formatCount(states.churned)}
        hint={
          <HintText
            label="how off is defined"
            text={`${formatPercent(states.churned, total)} of subscribers`}
          >
            No active subscriptions — stopped, or the bot blocked (either way, we can&rsquo;t
            deliver).
          </HintText>
        }
      />
    </StatGrid>
  );
}
