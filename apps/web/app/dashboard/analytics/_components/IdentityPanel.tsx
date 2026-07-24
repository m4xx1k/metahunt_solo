import type { ProductAnalyticsOverview } from "@/lib/api/product-analytics";
import { formatCount, formatPercent } from "@/lib/format";
import { Donut } from "@/ui/charts/Donut";
import { StatRows } from "@/ui/data/StatRows";
import { Panel } from "@/ui/layout/Panel";

type Props = {
  subscriptions: ProductAnalyticsOverview["subscriptions"];
  identity: ProductAnalyticsOverview["identity"];
};

// Two ledgers side by side: what subscriptions exist, and where the identity
// chain is broken. A non-zero gap count is a data bug, not a metric.
export function IdentityPanel({ subscriptions, identity }: Props) {
  const gaps =
    identity.subscriptionsWithoutJourney +
    identity.trackedLinkedWithoutEvent +
    identity.trackedDeliveryWithoutEvent;

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Panel title="Subscriptions" meta={`${formatCount(subscriptions.total)} total`}>
        <div className="flex items-center gap-5 border-b border-border/60 pb-4">
          <Donut
            value={subscriptions.cv}
            total={subscriptions.total}
            label={formatPercent(subscriptions.cv, subscriptions.total)}
            size={76}
            thickness={10}
            ariaLabel="cv share of all subscriptions"
          />
          <div className="flex flex-col gap-1">
            <span className="font-mono text-2xs uppercase tracking-[0.12em] text-text-muted">
              cv vs feed
            </span>
            <span className="font-display text-lg font-bold tabular-nums text-text-primary">
              {formatCount(subscriptions.cv)}
              <span className="pl-2 font-mono text-xs font-normal text-text-muted">
                cv / {formatCount(subscriptions.feed)} feed
              </span>
            </span>
          </div>
        </div>
        <StatRows
          cols={2}
          rows={[
            { label: "linked", value: formatCount(subscriptions.linked) },
            { label: "pending", value: formatCount(subscriptions.pending) },
            { label: "active", value: formatCount(subscriptions.active) },
            { label: "delivered", value: formatCount(subscriptions.delivered) },
            { label: "deactivated", value: formatCount(subscriptions.deactivated) },
            {
              label: "linked, no delivery",
              value: formatCount(subscriptions.linkedWithoutDelivery),
            },
          ]}
        />
      </Panel>

      <Panel
        title="Identity"
        meta={gaps === 0 ? "no gaps" : `${formatCount(gaps)} gaps`}
        className={gaps === 0 ? undefined : "border-danger/60"}
      >
        <StatRows
          cols={2}
          rows={[
            { label: "journeys", value: formatCount(identity.journeysTotal) },
            { label: "browser", value: formatCount(identity.browserJourneys) },
            { label: "server", value: formatCount(identity.serverJourneys) },
            { label: "legacy", value: formatCount(identity.legacyJourneys) },
            { label: "account-linked", value: formatCount(identity.accountLinkedJourneys) },
            { label: "multi-journey users", value: formatCount(identity.multiJourneyUsers) },
            { label: "multi-sub journeys", value: formatCount(identity.multiSubscriptionJourneys) },
            {
              label: "no journey_id",
              value: formatCount(identity.subscriptionsWithoutJourney),
              tone: identity.subscriptionsWithoutJourney > 0 ? "danger" : "default",
            },
            {
              label: "linked, no event",
              value: formatCount(identity.trackedLinkedWithoutEvent),
              tone: identity.trackedLinkedWithoutEvent > 0 ? "danger" : "default",
            },
            {
              label: "delivery, no event",
              value: formatCount(identity.trackedDeliveryWithoutEvent),
              tone: identity.trackedDeliveryWithoutEvent > 0 ? "danger" : "default",
            },
            { label: "outbox pending", value: formatCount(identity.pendingOutboxEvents) },
          ]}
        />
      </Panel>
    </div>
  );
}
