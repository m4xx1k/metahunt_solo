import { formatDateOnly, pluralizeUa } from "@/lib/format";
import type { SubscriberSubscription } from "@/lib/api/product-analytics";
import { Badge } from "@/ui";
import { Popover, PopoverContent, PopoverTrigger } from "@/ui/overlay/Popover";

// Compact "N підписок" trigger replacing the old inline multi-line list —
// full per-subscription detail (track, feed/cv, created date) lives in the
// popover instead of eating a fat column in every row.
export function SubscriptionsPopover({
  subscriptions,
}: {
  subscriptions: SubscriberSubscription[];
}) {
  const count = subscriptions.length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-2 border border-border bg-bg-elev px-2.5 py-1 font-mono text-2xs uppercase tracking-wider text-text-secondary transition-colors hover:border-accent hover:text-accent"
        >
          <span className="font-display text-sm font-bold text-text-primary">{count}</span>
          {pluralizeUa(count, "підписка", "підписки", "підписок")}
          <span aria-hidden="true" className="text-text-muted">
            ▾
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent aria-label="деталі підписок">
        <ul className="flex flex-col gap-3">
          {subscriptions.map((sub) => (
            <li
              key={sub.id}
              className="flex flex-col gap-1.5 border-b border-border/60 pb-3 last:border-0 last:pb-0"
            >
              <div className="flex items-center gap-2">
                <Badge variant={sub.isCv ? "accent" : "dark"}>{sub.isCv ? "cv" : "feed"}</Badge>
                <span
                  className={sub.isActive ? "text-text-primary" : "text-text-muted line-through"}
                >
                  {sub.trackLabel}
                </span>
              </div>
              <span className="text-2xs uppercase tracking-wider text-text-muted">
                {sub.isActive ? "активна" : "деактивована"} · створено{" "}
                {formatDateOnly(sub.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
