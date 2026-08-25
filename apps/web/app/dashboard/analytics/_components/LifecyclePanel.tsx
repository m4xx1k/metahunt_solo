import type { ProductSubscriberStates } from "@/lib/api/product-analytics";
import { formatCount, formatPercent } from "@/lib/format";
import { StatCard } from "@/ui/data/StatCard";
import { StatGrid } from "@/ui/data/StatGrid";

// Lifecycle STATE, not movement: every linked chat is in exactly one of these,
// all-time, so the three add up to the whole subscriber base.
export function LifecyclePanel({ states }: { states: ProductSubscriberStates }) {
  const total = states.active + states.dormant + states.churned;
  return (
    <StatGrid cols={3}>
      <StatCard
        label="active"
        value={formatCount(states.active)}
        hint={`${formatPercent(states.active, total)} of subscribers`}
      />
      <StatCard
        label="asleep"
        value={formatCount(states.dormant)}
        tone={states.dormant > 0 ? "accent" : "default"}
        hint="digests land, nobody answers"
      />
      <StatCard
        label="off"
        value={formatCount(states.churned)}
        hint={`${formatPercent(states.churned, total)} of subscribers`}
      />
    </StatGrid>
  );
}
