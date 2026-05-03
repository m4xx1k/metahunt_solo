import { cn } from "@/lib/utils";

export function Badge({
  variant = "accent",
  className,
  children,
}: {
  variant?: "accent" | "dark";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-1 font-mono text-[11px] font-bold uppercase tracking-wider",
        variant === "accent"
          ? "bg-accent text-bg"
          : "bg-text-primary text-bg-card",
        className,
      )}
    >
      {children}
    </span>
  );
}
