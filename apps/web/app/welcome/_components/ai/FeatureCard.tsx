import { Card } from "@/ui";
import { cn } from "@/lib/utils";

export function FeatureCard({
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
    <Card className={cn("w-[300px]", className)}>
      {icon && <div className="text-accent text-3xl leading-none">{icon}</div>}
      <h3 className="font-display text-lg font-bold text-text-primary">
        {title}
      </h3>
      <p className="font-body text-xs leading-[1.55] text-text-secondary">
        {description}
      </p>
    </Card>
  );
}
