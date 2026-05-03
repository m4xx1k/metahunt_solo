import { Card } from "./Card";
import { cn } from "@/lib/utils";

export function SuccessCard({
  title = "Candidate Found!",
  description = "We matched 15 ideal profiles.",
  className,
}: {
  title?: string;
  description?: string;
  className?: string;
}) {
  return (
    <Card className={cn("w-[300px]", className)}>
      <div className="flex h-6 w-6 items-center justify-center bg-success text-bg text-xs font-bold">
        ✓
      </div>
      <h3 className="font-display text-xl font-bold text-text-primary">
        {title}
      </h3>
      <p className="font-body text-sm text-text-secondary">{description}</p>
    </Card>
  );
}
