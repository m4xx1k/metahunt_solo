import { cn } from "@/lib/utils";
import type { SubscriberStatus } from "@/lib/api/product-analytics";

// `active` renders nothing on purpose: the roster's default state should be
// invisible so the exceptions (blocked / asleep / off) pop.
const BADGE: Record<Exclude<SubscriberStatus, "active">, { label: string; className: string }> = {
  blocked: { label: "blocked", className: "text-danger" },
  dormant: { label: "asleep", className: "text-accent" },
  churned: { label: "off", className: "text-text-muted" },
};

export function SubscriberStatusBadge({
  status,
  className,
}: {
  status: SubscriberStatus;
  className?: string;
}) {
  if (status === "active") return null;
  const badge = BADGE[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-mono text-2xs uppercase tracking-[0.12em]",
        badge.className,
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", badge.className.replace("text-", "bg-"))} />
      {badge.label}
    </span>
  );
}
