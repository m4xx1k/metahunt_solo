import type { SubscriberActivity } from "@/lib/api/product-analytics";
import { SubscriberIdentity } from "@/entities/subscriber/SubscriberIdentity";
import { formatRelative } from "@/lib/format";
import { EmptyState } from "@/ui/feedback/EmptyState";
import { Panel } from "@/ui/layout/Panel";

const DAY_MS = 86_400_000;
const FRESH_DAYS = 7;
const QUIET_DAYS = 14;
const LIST_LIMIT = 5;

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  return (Date.now() - new Date(iso).getTime()) / DAY_MS;
}

// At this size the useful output of an analytics screen is not a chart, it is a
// name. Two lists, both actionable today: people who just arrived and have not
// engaged, and people who used to and stopped.
export function TalkToPanel({ subscribers }: { subscribers: SubscriberActivity[] }) {
  const justLinked = subscribers
    .filter((row) => {
      const linkedAgo = daysSince(row.telegramLinkedAt);
      const actedAgo = daysSince(row.lastActionAt);
      return linkedAgo !== null && linkedAgo <= FRESH_DAYS && (actedAgo === null || actedAgo >= 1);
    })
    .slice(0, LIST_LIMIT);

  const wentQuiet = subscribers
    .filter((row) => {
      const actedAgo = daysSince(row.lastActionAt);
      return row.isActive && actedAgo !== null && actedAgo >= QUIET_DAYS;
    })
    .slice(0, LIST_LIMIT);

  return (
    <Panel title="Talk to" meta="today" scope="all-time">
      {justLinked.length === 0 && wentQuiet.length === 0 ? (
        <EmptyState title="nobody to chase" hint="everyone recent is already active." />
      ) : (
        <div className="flex flex-col gap-5">
          <SubscriberList
            heading="just linked, quiet"
            rows={justLinked}
            stamp={(row) => row.telegramLinkedAt}
          />
          <SubscriberList
            heading="was active, stopped"
            rows={wentQuiet}
            stamp={(row) => row.lastActionAt}
          />
        </div>
      )}
    </Panel>
  );
}

function SubscriberList({
  heading,
  rows,
  stamp,
}: {
  heading: string;
  rows: SubscriberActivity[];
  stamp: (row: SubscriberActivity) => string | null;
}) {
  if (rows.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <span className="font-mono text-2xs uppercase tracking-[0.12em] text-text-muted">
        {heading}
      </span>
      <ul className="flex flex-col gap-1.5">
        {rows.map((row) => {
          const at = stamp(row);
          return (
            <li
              key={row.chatId}
              className="flex items-baseline justify-between gap-3 font-mono text-xs"
            >
              <SubscriberIdentity
                tgUsername={row.tgUsername}
                tgFirstName={row.tgFirstName}
                chatId={row.chatId}
              />
              <span className="shrink-0 tabular-nums text-text-muted">
                {at ? formatRelative(at) : "—"}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
