import { Card } from "@/components/ui-kit";
import { cn } from "@/lib/utils";

export function StepCard({
  number,
  title,
  description,
  className,
}: {
  number: string;
  title: string;
  description: string;
  className?: string;
}) {
  return (
    <Card className={cn("w-[380px] gap-5 p-8", className)}>
      <div className="font-mono text-[40px] font-bold leading-none text-accent">
        {number}
      </div>
      <h3 className="font-display text-2xl font-bold text-text-primary">
        {title}
      </h3>
      <p className="font-body text-sm leading-[1.6] text-text-secondary">
        {description}
      </p>
    </Card>
  );
}
