import { Card } from "@/components/ui-kit";
import { cn } from "@/lib/utils";

export function ProblemCard({
  icon,
  title,
  description,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description: string;
  className?: string;
}) {
  return (
    <Card className={cn("w-[300px] p-7", className)}>
      <div className="flex h-12 w-12 items-center justify-center bg-accent/15 text-accent text-xl">
        {icon ?? "◇"}
      </div>
      <h3 className="font-display text-xl font-bold text-text-primary">
        {title}
      </h3>
      <p className="font-body text-sm leading-[1.55] text-text-secondary">
        {description}
      </p>
    </Card>
  );
}
