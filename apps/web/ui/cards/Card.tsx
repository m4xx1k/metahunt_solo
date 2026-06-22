import { cn } from "@/lib/utils";

export function Card({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 border border-border bg-bg-card p-8 shadow-brut-lg",
        className,
      )}
    >
      {children}
    </div>
  );
}
