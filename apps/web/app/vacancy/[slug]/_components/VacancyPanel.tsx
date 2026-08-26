import { Tag } from "@/ui";
import { cn } from "@/lib/utils";

// The right rail's one surface. Panel from ui/layout is built for the console's
// full-height grid cells; this is the flat bordered box the rail needs.
export function VacancyPanel({
  title,
  className,
  children,
}: {
  title?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("flex flex-col gap-3 border border-border bg-bg-card p-4", className)}>
      {title ? <Tag>&gt; {title}</Tag> : null}
      {children}
    </section>
  );
}
