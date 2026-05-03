import { Card } from "./Card";
import { cn } from "@/lib/utils";

export function PricingCard({
  tier = "Premium",
  price = "$0",
  note = "перші 1000 користувачів",
  className,
}: {
  tier?: string;
  price?: string;
  note?: string;
  className?: string;
}) {
  return (
    <Card className={cn("w-[280px]", className)}>
      <span className="font-mono text-xs font-bold uppercase tracking-wider text-accent">
        {tier}
      </span>
      <div className="font-display text-5xl font-bold leading-none text-text-primary">
        {price}
      </div>
      <p className="font-body text-sm text-text-secondary">{note}</p>
    </Card>
  );
}
