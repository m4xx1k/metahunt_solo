import { cn } from "@/lib/utils";

export function Tag({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "font-mono text-[13px] uppercase tracking-wider text-accent",
        className,
      )}
    >
      {children}
    </span>
  );
}
